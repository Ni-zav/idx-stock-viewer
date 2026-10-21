import test from 'node:test';
import assert from 'node:assert/strict';
import { getMarketState, getAdaptiveInterval } from '../lib/market-hours.js';

const time = iso => new Date(iso);
test('weekday morning and afternoon sessions in Jakarta', () => {
  assert.equal(getMarketState(time('2026-10-22T01:59:00Z')).open, false); // 08:59 WIB
  assert.equal(getMarketState(time('2026-10-22T02:00:00Z')).open, true);  // 09:00
  assert.equal(getMarketState(time('2026-10-22T05:00:00Z')).open, false); // 12:00 lunch
  assert.equal(getMarketState(time('2026-10-22T06:29:00Z')).open, false); // 13:29
  assert.equal(getMarketState(time('2026-10-22T06:30:00Z')).open, true);  // 13:30
  assert.equal(getMarketState(time('2026-10-22T08:50:00Z')).open, false); // 15:50
});
test('Friday has a longer break and uses Jakarta day', () => {
  assert.equal(getMarketState(time('2026-10-23T04:29:00Z')).open, true);  // Fri 11:29
  assert.equal(getMarketState(time('2026-10-23T04:30:00Z')).open, false); // Fri 11:30
  assert.equal(getMarketState(time('2026-10-23T06:59:00Z')).open, false); // Fri 13:59
  assert.equal(getMarketState(time('2026-10-23T07:00:00Z')).open, true);  // Fri 14:00
  assert.equal(getMarketState(time('2026-10-23T18:00:00Z')).weekend, true); // Sat 01:00 WIB
});
test('polling cadence respects session and weekend', () => {
  assert.equal(getAdaptiveInterval(time('2026-10-22T02:00:00Z')), 5000);
  assert.equal(getAdaptiveInterval(time('2026-10-22T05:00:00Z')), 30000);
  assert.equal(getAdaptiveInterval(time('2026-10-23T18:00:00Z')), 300000);
});
