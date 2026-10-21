import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleMovingAverage } from '../lib/indicators.js';

test('moving average has no values before its warm-up period', () => {
  const data = [10, 20, 30, 40].map((close, time) => ({time, close}));
  assert.deepEqual(simpleMovingAverage(data, 3), [
    {time: 2, value: 20}, {time: 3, value: 30},
  ]);
});
test('invalid observations reset the moving window', () => {
  const data = [10, 20, NaN, 20, 30, 40].map((close, time) => ({time, close}));
  assert.deepEqual(simpleMovingAverage(data, 3), [{time: 5, value: 30}]);
});
test('invalid periods are rejected', () => {
  assert.throws(() => simpleMovingAverage([], 0), RangeError);
  assert.throws(() => simpleMovingAverage([], 2.5), RangeError);
});
