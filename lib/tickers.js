// The application's Yahoo Finance integration is limited to four-letter IDX symbols.
export function normalizeTickers(value, maxCount = 100) {
  if (!Array.isArray(value) || value.length > maxCount) return null;
  const tickers = [];
  for (const candidate of value) {
    if (typeof candidate !== 'string') return null;
    const ticker = candidate.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(ticker)) return null;
    if (!tickers.includes(ticker)) tickers.push(ticker);
  }
  return tickers;
}

export function normalizeTicker(value) {
  const result = normalizeTickers([value], 1);
  return result === null ? null : result[0];
}

export function normalizeInterval(value) {
  return Number.isInteger(value) && value >= 5000 && value <= 300000 ? value : null;
}
