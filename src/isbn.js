'use strict';

// Strip spaces/hyphens and upper-case a trailing "x".
function clean(raw) {
  return String(raw || '').replace(/[\s-]/g, '').toUpperCase();
}

function isValidIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = s[i] === 'X' ? 10 : Number(s[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

function isValidIsbn13(s) {
  return /^97[89]\d{10}$/.test(s) && isbn13CheckDigit(s.slice(0, 12)) === s[12];
}

function isbn10To13(s) {
  const base = '978' + s.slice(0, 9);
  return base + isbn13CheckDigit(base);
}

function isbn13To10(s) {
  if (!s.startsWith('978')) return null;
  const core = s.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

// Returns { isbn13, isbn10 } for a valid ISBN-10 or ISBN-13, otherwise null.
function normalizeIsbn(raw) {
  const s = clean(raw);
  if (s.length === 10 && isValidIsbn10(s)) return { isbn13: isbn10To13(s), isbn10: s };
  if (s.length === 13 && isValidIsbn13(s)) return { isbn13: s, isbn10: isbn13To10(s) };
  return null;
}

module.exports = { normalizeIsbn, isValidIsbn10, isValidIsbn13 };
