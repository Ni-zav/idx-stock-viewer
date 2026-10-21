export function simpleMovingAverage(
  candles: Array<{time: number; close: number}>,
  period: number
): Array<{time: number; value: number}>;
