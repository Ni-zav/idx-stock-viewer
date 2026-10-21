import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTickers, normalizeTicker, normalizeInterval } from '../lib/tickers.js';

test('uppercases, trims and deduplicates valid IDX symbols', () => {
  assert.deepEqual(normalizeTickers([' bbca ', 'BBRI', 'bbca']), ['BBCA', 'BBRI']);
  assert.deepEqual(normalizeTickers([]), []);
});
test('rejects path traversal, option injection and oversized lists', () => {
  assert.equal(normalizeTicker('../etc/passwd'), null);
  assert.equal(normalizeTicker('--all'), null);
  assert.equal(normalizeTickers('BBCA'), null);
  assert.equal(normalizeTickers(['BBCA', 7]), null);
  assert.equal(normalizeTickers(new Array(101).fill('BBCA')), null);
});
test('only bounded integer polling intervals are permitted', () => {
  assert.equal(normalizeInterval(5000), 5000);
  assert.equal(normalizeInterval(300000), 300000);
  for (const value of [0, -1, 4.2, '5000', 1000, 300001, null]) {
    assert.equal(normalizeInterval(value), null);
  }
});
