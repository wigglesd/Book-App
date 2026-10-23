'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeIsbn } = require('../src/isbn');

test('normalizes ISBN-10 and ISBN-13 to both forms', () => {
  assert.deepStrictEqual(normalizeIsbn('0-14-032872-6'), { isbn13: '9780140328721', isbn10: '0140328726' });
  assert.deepStrictEqual(normalizeIsbn('978-0-14-032872-1'), { isbn13: '9780140328721', isbn10: '0140328726' });
});

test('handles an X check digit', () => {
  assert.deepStrictEqual(normalizeIsbn('080442957x'), { isbn13: '9780804429573', isbn10: '080442957X' });
});

test('979 ISBNs have no ISBN-10', () => {
  assert.deepStrictEqual(normalizeIsbn('9791032305690'), { isbn13: '9791032305690', isbn10: null });
});

test('rejects bad check digits and junk', () => {
  assert.strictEqual(normalizeIsbn('9780140328722'), null);
  assert.strictEqual(normalizeIsbn('hello'), null);
  assert.strictEqual(normalizeIsbn(''), null);
  assert.strictEqual(normalizeIsbn('1234567890123'), null);
});
