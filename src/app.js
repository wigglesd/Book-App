'use strict';

const path = require('path');
const express = require('express');
const { normalizeIsbn } = require('./isbn');
const { findByTitle } = require('./match');

const MAX_CHECK_ITEMS = 200;
const MAX_CHECK_LOOKUPS = 25;
const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

function createApp({ store, lookup, auth, ownerName = 'the owner' }) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(
    '/vendor/html5-qrcode.min.js',
    express.static(require.resolve('html5-qrcode/html5-qrcode.min.js'))
  );

  // Visitors see everything except the owner's private notes.
  const view = (req) => (book) => {
    if (!book || auth.isOwner(req)) return book;
    const { notes, ...rest } = book;
    return rest;
  };

  // ---- Session ----------------------------------------------------------

  app.get('/api/session', (req, res) => {
    res.json({ owner: auth.isOwner(req), ownerName });
  });

  // Behind a tunnel every request comes from the same address, so failed
  // logins are throttled globally rather than per client.
  let failedLogins = [];
  app.post('/api/login', (req, res) => {
    const now = Date.now();
    failedLogins = failedLogins.filter((t) => now - t < FAILED_LOGIN_WINDOW_MS);
    if (failedLogins.length >= MAX_FAILED_LOGINS) {
      return res.status(429).json({ error: 'Too many failed logins; try again in 15 minutes' });
    }
    if (!auth.checkPassword(req.body && req.body.password)) {
      failedLogins.push(now);
      return res.status(401).json({ error: 'Wrong password' });
    }
    res.setHeader('Set-Cookie', auth.loginCookie(req.secure));
    res.json({ owner: true });
  });

  app.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie', auth.logoutCookie());
    res.json({ owner: false });
  });

  // ---- Public queries ---------------------------------------------------

  app.get('/api/books', (req, res) => {
    const list = store.LISTS.includes(req.query.list) ? req.query.list : undefined;
    res.json({ books: store.all(list).map(view(req)) });
  });

  // Checks a list of ISBNs and/or titles against the read list and wishlist.
  app.post('/api/check', async (req, res) => {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : null;
    if (!items) return res.status(400).json({ error: 'Send { items: [ ... ] }' });
    const queries = items.map((s) => String(s).trim()).filter(Boolean).slice(0, MAX_CHECK_ITEMS);
    const books = store.all();
    let lookupsLeft = MAX_CHECK_LOOKUPS;

    const results = [];
    for (const query of queries) {
      const isbn = normalizeIsbn(query);
      if (isbn) {
        const book = store.get(isbn.isbn13);
        if (book) {
          results.push({ query, status: book.list, match: 'isbn', book: view(req)(book) });
          continue;
        }
        // Not this exact edition: look up the title and match other editions.
        let found = null;
        if (lookupsLeft-- > 0) {
          try {
            found = await lookup(isbn.isbn13);
          } catch {
            found = null;
          }
        }
        const byTitle = found ? findByTitle(books, found.title).exact : [];
        const edition = byTitle.find((b) => (found.authors || []).some((a) => (b.authors || []).includes(a))) || byTitle[0];
        if (edition) {
          results.push({ query, status: edition.list, match: 'other-edition', book: view(req)(edition) });
        } else {
          results.push({ query, status: 'not-found', title: found ? found.title : null });
        }
        continue;
      }

      const { exact, partial } = findByTitle(books, query);
      const best = exact.find((b) => b.list === 'read') || exact[0];
      if (best) {
        results.push({ query, status: best.list, match: 'title', book: view(req)(best) });
      } else {
        results.push({ query, status: 'not-found', possible: partial.slice(0, 5).map(view(req)) });
      }
    }
    res.json({ results });
  });

  // ---- Owner-only -------------------------------------------------------

  app.get('/api/lookup/:isbn', auth.requireOwner, async (req, res) => {
    const isbn = normalizeIsbn(req.params.isbn);
    if (!isbn) return res.status(400).json({ error: 'That is not a valid ISBN-10 or ISBN-13' });
    const existing = store.get(isbn.isbn13);
    let metadata = null;
    let lookupError = null;
    try {
      metadata = await lookup(isbn.isbn13);
    } catch (err) {
      lookupError = err.message;
    }
    res.json({ ...isbn, metadata, existing, lookupError });
  });

  app.post('/api/books', auth.requireOwner, async (req, res) => {
    const body = req.body || {};
    const isbn = normalizeIsbn(body.isbn);
    if (!isbn) return res.status(400).json({ error: 'That is not a valid ISBN-10 or ISBN-13' });
    if (!store.LISTS.includes(body.list)) {
      return res.status(400).json({ error: `list must be one of: ${store.LISTS.join(', ')}` });
    }

    let metadata = null;
    if (!body.title) {
      try {
        metadata = await lookup(isbn.isbn13);
      } catch {
        metadata = null;
      }
      if (!metadata) {
        return res.status(422).json({ error: 'Book not found in the ISBN databases; enter the title manually' });
      }
    } else {
      metadata = {
        title: String(body.title).trim(),
        authors: (Array.isArray(body.authors) ? body.authors : String(body.authors || '').split(','))
          .map((a) => String(a).trim())
          .filter(Boolean),
        publisher: body.publisher || null,
        publishedDate: body.publishedDate || null,
        pageCount: body.pageCount || null,
        coverUrl: body.coverUrl || null,
        infoUrl: body.infoUrl || null,
        source: body.source || 'Manual entry',
      };
    }

    const book = store.upsert({
      ...metadata,
      ...isbn,
      list: body.list,
      readDate: body.list === 'read' ? body.readDate || new Date().toISOString().slice(0, 10) : null,
      notes: body.notes || '',
    });
    res.status(201).json({ book });
  });

  app.patch('/api/books/:isbn13', auth.requireOwner, (req, res) => {
    const book = store.get(req.params.isbn13);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    const body = req.body || {};
    const changes = {};
    if (body.list !== undefined) {
      if (!store.LISTS.includes(body.list)) return res.status(400).json({ error: 'Invalid list' });
      changes.list = body.list;
      if (body.list === 'read' && !book.readDate) changes.readDate = new Date().toISOString().slice(0, 10);
      if (body.list === 'wishlist') changes.readDate = null;
    }
    if (body.readDate !== undefined) changes.readDate = body.readDate || null;
    if (body.notes !== undefined) changes.notes = String(body.notes);
    res.json({ book: store.upsert({ ...book, ...changes }) });
  });

  app.delete('/api/books/:isbn13', auth.requireOwner, (req, res) => {
    if (!store.remove(req.params.isbn13)) return res.status(404).json({ error: 'Book not found' });
    res.json({ ok: true });
  });

  return app;
}

module.exports = { createApp };
