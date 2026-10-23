'use strict';

// Lower-case, strip accents/punctuation and a leading article so that
// "The Hobbit" and "hobbit" compare equal.
function normalizeText(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

function mainTitle(title) {
  return normalizeText(String(title || '').split(/[:(]/)[0]);
}

// Splits "Title by Author" into its parts; author is optional.
function parseTitleQuery(q) {
  const m = /^(.*?)\s+by\s+(.+)$/i.exec(q);
  return m ? { title: m[1], author: m[2] } : { title: q, author: null };
}

function authorMatches(book, author) {
  if (!author) return true;
  const want = normalizeText(author).split(' ');
  return (book.authors || []).some((a) => {
    const have = normalizeText(a);
    return want.every((w) => have.includes(w));
  });
}

// Returns { exact: [...books], partial: [...books] } for a free-text title query.
function findByTitle(books, query) {
  const { title, author } = parseTitleQuery(query);
  const q = normalizeText(title);
  if (!q) return { exact: [], partial: [] };
  const candidates = books.filter((b) => authorMatches(b, author));
  const exact = candidates.filter((b) => normalizeText(b.title) === q || mainTitle(b.title) === q);
  const partial =
    q.length >= 4
      ? candidates.filter((b) => !exact.includes(b) && normalizeText(b.title).includes(q))
      : [];
  return { exact, partial };
}

module.exports = { normalizeText, findByTitle };
