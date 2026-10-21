// Intraday CSV datetimes are UTC (without an explicit offset), while daily
// date-only CSV rows refer to an IDX trading date in Jakarta.
export function parseMarketTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const date = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Date.parse(date + 'T00:00:00+07:00');
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(date)) {
    return Date.parse(date.replace(' ', 'T') + 'Z');
  }
  return Date.parse(date);
}

const jakartaDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric',
});

export function jakartaTradingDate(now = new Date()) {
  const parts = Object.fromEntries(jakartaDate.formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
