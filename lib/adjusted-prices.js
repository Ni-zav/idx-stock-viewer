/**
 * Convert one Yahoo raw-ish OHLC candle using the provided Adj Close / Close.
 * Yahoo may already split-adjust OHLC. This only provides price-adjusted history
 * under the vendor's convention; it is NOT a total-return series.
 * Volumes are left unchanged to avoid fabricating adjusted trade volume.
 */
export function adjustOhlcv(rows) {
  return rows.map(row => {
    const { open, high, low, close, adjClose } = row
    const factor = adjClose / close
    if (![open, high, low, close, adjClose, factor].every(Number.isFinite) ||
        open <= 0 || high <= 0 || low <= 0 || close <= 0 || factor <= 0) {
      throw new RangeError('Cannot calculate adjusted OHLC without valid Yahoo Adj Close')
    }
    return {
      ...row,
      open: open * factor,
      high: high * factor,
      low: low * factor,
      close: adjClose,
      adjClose,
    }
  })
}
