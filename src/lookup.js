'use strict';

// Looks a book up by ISBN-13, trying Open Library first and Google Books as a
// fallback. Returns a plain metadata object or null when nothing is found.
function createLookup({ fetchImpl = globalThis.fetch, googleApiKey } = {}) {
  async function getJson(url) {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'BookApp/1.0 (personal reading log)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`${url} responded ${res.status}`);
    return res.json();
  }

  async function fromOpenLibrary(isbn) {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const data = await getJson(url);
    const b = data[`ISBN:${isbn}`];
    if (!b) return null;
    return {
      title: [b.title, b.subtitle].filter(Boolean).join(': '),
      authors: (b.authors || []).map((a) => a.name),
      publisher: (b.publishers || []).map((p) => p.name).join(', ') || null,
      publishedDate: b.publish_date || null,
      pageCount: b.number_of_pages || null,
      coverUrl: (b.cover && (b.cover.medium || b.cover.large || b.cover.small)) || null,
      infoUrl: b.url || null,
      source: 'Open Library',
    };
  }

  async function fromGoogleBooks(isbn) {
    let url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
    if (googleApiKey) url += `&key=${encodeURIComponent(googleApiKey)}`;
    const data = await getJson(url);
    const v = data.items && data.items[0] && data.items[0].volumeInfo;
    if (!v) return null;
    const thumb = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
    return {
      title: [v.title, v.subtitle].filter(Boolean).join(': '),
      authors: v.authors || [],
      publisher: v.publisher || null,
      publishedDate: v.publishedDate || null,
      pageCount: v.pageCount || null,
      coverUrl: thumb ? thumb.replace(/^http:/, 'https:') : null,
      infoUrl: v.infoLink || null,
      source: 'Google Books',
    };
  }

  return async function lookupIsbn(isbn13) {
    const errors = [];
    for (const source of [fromOpenLibrary, fromGoogleBooks]) {
      try {
        const found = await source(isbn13);
        if (found && found.title) return found;
      } catch (err) {
        errors.push(err.message);
      }
    }
    if (errors.length === 2) throw new Error(`ISBN lookup failed: ${errors.join('; ')}`);
    return null;
  };
}

module.exports = { createLookup };
