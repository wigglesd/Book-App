'use strict';

const fs = require('fs');
const path = require('path');

const LISTS = ['read', 'wishlist'];

// A small JSON-file backed store. Each book is keyed by ISBN-13 and lives on
// exactly one list: "read" or "wishlist".
function createStore(filePath) {
  let books = {};
  if (filePath && fs.existsSync(filePath)) {
    books = JSON.parse(fs.readFileSync(filePath, 'utf8')).books || {};
  }

  function save() {
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ books }, null, 2));
    fs.renameSync(tmp, filePath);
  }

  return {
    LISTS,
    get(isbn13) {
      return books[isbn13] || null;
    },
    all(list) {
      return Object.values(books)
        .filter((b) => !list || b.list === list)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },
    upsert(book) {
      const now = new Date().toISOString();
      const existing = books[book.isbn13];
      books[book.isbn13] = {
        ...existing,
        ...book,
        addedAt: (existing && existing.addedAt) || now,
        updatedAt: now,
      };
      save();
      return books[book.isbn13];
    },
    remove(isbn13) {
      const existed = Boolean(books[isbn13]);
      delete books[isbn13];
      if (existed) save();
      return existed;
    },
  };
}

module.exports = { createStore, LISTS };
