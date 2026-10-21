import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketTimestamp, jakartaTradingDate } from '../lib/market-data.js';

test('daily trading dates start at Jakarta midnight', () => {
  assert.equal(parseMarketTimestamp('2026-10-22'), Date.parse('2026-10-21T17:00:00Z'));
});
test('intraday UTC timestamps do not inherit the server timezone', () => {
  assert.equal(parseMarketTimestamp('2026-10-22 02:00:00'), Date.parse('2026-10-22T02:00:00Z'));
  assert.equal(parseMarketTimestamp('2026-10-22T02:00:00Z'), Date.parse('2026-10-22T02:00:00Z'));
  assert.ok(Number.isNaN(parseMarketTimestamp('not-a-timestamp')));
});
test('Jakarta market date is not the UTC date near midnight', () => {
  assert.equal(jakartaTradingDate(new Date('2026-10-21T18:00:00Z')), '2026-10-22');
});
