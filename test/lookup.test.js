'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createLookup } = require('../src/lookup');

function fakeFetch(routes) {
  return async (url) => {
    const host = new URL(url).host;
    const body = routes[host];
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body };
  };
}

test('uses Open Library when it has the book', async () => {
  const lookup = createLookup({
    fetchImpl: fakeFetch({
      'openlibrary.org': {
        'ISBN:9780140328721': {
          title: 'Fantastic Mr. Fox',
          authors: [{ name: 'Roald Dahl' }],
          publishers: [{ name: 'Puffin' }],
          publish_date: '1988',
          number_of_pages: 96,
          cover: { medium: 'https://covers.openlibrary.org/b/id/1-M.jpg' },
        },
      },
    }),
  });
  const book = await lookup('9780140328721');
  assert.strictEqual(book.title, 'Fantastic Mr. Fox');
  assert.deepStrictEqual(book.authors, ['Roald Dahl']);
  assert.strictEqual(book.source, 'Open Library');
});

test('falls back to Google Books', async () => {
  const lookup = createLookup({
    fetchImpl: fakeFetch({
      'openlibrary.org': {},
      'www.googleapis.com': {
        items: [{ volumeInfo: { title: 'Dune', authors: ['Frank Herbert'], imageLinks: { thumbnail: 'http://x/y.jpg' } } }],
      },
    }),
  });
  const book = await lookup('9780441172719');
  assert.strictEqual(book.title, 'Dune');
  assert.strictEqual(book.coverUrl, 'https://x/y.jpg');
  assert.strictEqual(book.source, 'Google Books');
});

test('returns null when neither source knows the ISBN', async () => {
  const lookup = createLookup({ fetchImpl: fakeFetch({ 'openlibrary.org': {}, 'www.googleapis.com': { totalItems: 0 } }) });
  assert.strictEqual(await lookup('9780000000002'), null);
});

test('throws when both sources fail', async () => {
  const lookup = createLookup({
    fetchImpl: fakeFetch({ 'openlibrary.org': new Error('down'), 'www.googleapis.com': new Error('down') }),
  });
  await assert.rejects(lookup('9780140328721'), /ISBN lookup failed/);
});
