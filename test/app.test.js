'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { createStore } = require('../src/store');
const { createAuth } = require('../src/auth');

const CATALOG = {
  '9780140328721': { title: 'Fantastic Mr. Fox', authors: ['Roald Dahl'], source: 'Test' },
  '9780441172719': { title: 'Dune', authors: ['Frank Herbert'], source: 'Test' },
  '9780593099322': { title: 'Dune', authors: ['Frank Herbert'], source: 'Test' }, // another edition
  '9780547928227': { title: 'The Hobbit', authors: ['J. R. R. Tolkien'], source: 'Test' },
};

async function startServer(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookapp-'));
  const file = path.join(dir, 'books.json');
  const app = createApp({
    store: createStore(file),
    lookup: async (isbn) => CATALOG[isbn] || null,
    auth: createAuth('secret'),
    ownerName: 'David',
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function req(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json() };
  }
  return { req, base, file, logout: () => { cookie = ''; } };
}

test('visitors cannot change lists; the owner can after logging in', async (t) => {
  const { req } = await startServer(t);
  assert.strictEqual((await req('POST', '/api/books', { isbn: '9780140328721', list: 'read' })).status, 401);
  assert.strictEqual((await req('POST', '/api/login', { password: 'nope' })).status, 401);
  assert.strictEqual((await req('POST', '/api/login', { password: 'secret' })).status, 200);
  assert.deepStrictEqual((await req('GET', '/api/session')).body, { owner: true, ownerName: 'David' });
  const added = await req('POST', '/api/books', { isbn: '0140328726', list: 'read' });
  assert.strictEqual(added.status, 201);
  assert.strictEqual(added.body.book.title, 'Fantastic Mr. Fox');
  assert.strictEqual(added.body.book.isbn13, '9780140328721');
});

test('lookup validates the ISBN and reports existing entries', async (t) => {
  const { req } = await startServer(t);
  await req('POST', '/api/login', { password: 'secret' });
  assert.strictEqual((await req('GET', '/api/lookup/12345')).status, 400);
  const fresh = await req('GET', '/api/lookup/978-0-441-17271-9');
  assert.strictEqual(fresh.body.metadata.title, 'Dune');
  assert.strictEqual(fresh.body.existing, null);
  await req('POST', '/api/books', { isbn: '9780441172719', list: 'wishlist' });
  assert.strictEqual((await req('GET', '/api/lookup/9780441172719')).body.existing.list, 'wishlist');
});

test('unknown ISBNs need a manual title', async (t) => {
  const { req } = await startServer(t);
  await req('POST', '/api/login', { password: 'secret' });
  assert.strictEqual((await req('POST', '/api/books', { isbn: '9780306406157', list: 'read' })).status, 422);
  const manual = await req('POST', '/api/books', {
    isbn: '9780306406157', list: 'read', title: 'Obscure Book', authors: 'A. Writer, B. Writer',
  });
  assert.strictEqual(manual.status, 201);
  assert.deepStrictEqual(manual.body.book.authors, ['A. Writer', 'B. Writer']);
  assert.strictEqual(manual.body.book.source, 'Manual entry');
});

test('wishlist books can be moved to read, and data persists to disk', async (t) => {
  const { req, file } = await startServer(t);
  await req('POST', '/api/login', { password: 'secret' });
  await req('POST', '/api/books', { isbn: '9780441172719', list: 'wishlist' });
  assert.strictEqual((await req('GET', '/api/books?list=wishlist')).body.books.length, 1);
  const moved = await req('PATCH', '/api/books/9780441172719', { list: 'read' });
  assert.strictEqual(moved.body.book.list, 'read');
  assert.match(moved.body.book.readDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual((await req('GET', '/api/books?list=wishlist')).body.books.length, 0);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(saved.books['9780441172719'].list, 'read');
  assert.strictEqual((await req('DELETE', '/api/books/9780441172719')).status, 200);
  assert.strictEqual((await req('GET', '/api/books')).body.books.length, 0);
});

test('visitors can check a mixed list of ISBNs and titles', async (t) => {
  const { req, logout } = await startServer(t);
  await req('POST', '/api/login', { password: 'secret' });
  await req('POST', '/api/books', { isbn: '9780140328721', list: 'read', notes: 'private' });
  await req('POST', '/api/books', { isbn: '9780441172719', list: 'read' });
  await req('POST', '/api/books', { isbn: '9780547928227', list: 'wishlist' });
  logout();

  const { body } = await req('POST', '/api/check', {
    items: [
      '0-14-032872-6',          // read, by ISBN-10
      '9780593099322',          // a different edition of Dune
      'hobbit',                 // wishlist, by title without the article
      'Dune by Frank Herbert',  // title + author
      'Dune by Someone Else',   // wrong author
      'Fantastic',              // partial title -> suggestion only
      '9780306406157',          // unknown ISBN
    ],
  });
  const statuses = body.results.map((r) => [r.status, r.match || null]);
  assert.deepStrictEqual(statuses, [
    ['read', 'isbn'],
    ['read', 'other-edition'],
    ['wishlist', 'title'],
    ['read', 'title'],
    ['not-found', null],
    ['not-found', null],
    ['not-found', null],
  ]);
  assert.strictEqual(body.results[5].possible[0].title, 'Fantastic Mr. Fox');
  assert.strictEqual(body.results[0].book.notes, undefined, 'notes are hidden from visitors');
  const publicList = (await req('GET', '/api/books?list=read')).body.books;
  assert.ok(publicList.every((b) => b.notes === undefined));
});

test('serves the pages and the scanner library', async (t) => {
  const { base } = await startServer(t);
  for (const p of ['/', '/share.html', '/common.js', '/vendor/html5-qrcode.min.js']) {
    const res = await fetch(base + p);
    assert.strictEqual(res.status, 200, p);
  }
});
