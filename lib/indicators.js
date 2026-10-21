/**
 * O(n) simple moving average. The first period - 1 points have no value.
 * No synthetic candles are introduced: input is already sorted chart data.
 * @param {Array<{time: number, close: number}>} candles
 * @param {number} period
 * @returns {Array<{time: number, value: number}>}
 */
export function simpleMovingAverage(candles, period) {
  if (!Number.isInteger(period) || period < 2) throw new RangeError('SMA period must be >= 2');
  const output = [];
  const window = [];
  let sum = 0;
  for (const candle of candles) {
    if (!Number.isFinite(candle.close) || candle.close <= 0) {
      window.length = 0;
      sum = 0;
      continue;
    }
    window.push(candle.close);
    sum += candle.close;
    if (window.length > period) sum -= window.shift();
    if (window.length === period) output.push({ time: candle.time, value: sum / period });
  }
  return output;
}
