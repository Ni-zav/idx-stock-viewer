// All market-session decisions use Asia/Jakarta, regardless of server timezone.
// Regular-market continuous sessions only; exchange holidays require a calendar.
const jakartaClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function getMarketState(now = new Date()) {
  const values = Object.fromEntries(jakartaClock.formatToParts(now).map(part => [part.type, part.value]));
  const minutes = Number(values.hour) * 60 + Number(values.minute);
  const weekend = values.weekday === 'Sat' || values.weekday === 'Sun';
  const friday = values.weekday === 'Fri';

  // Regular market (continuous trading); does not cover opening/closing auctions.
  const sessions = friday
    ? [[9 * 60, 11 * 60 + 30], [14 * 60, 15 * 60 + 50]]
    : [[9 * 60, 12 * 60], [13 * 60 + 30, 15 * 60 + 50]];
  const open = !weekend && sessions.some(([start, end]) => minutes >= start && minutes < end);

  return { open, weekend, weekday: values.weekday, minutes };
}

export function getAdaptiveInterval(now = new Date()) {
  const state = getMarketState(now);
  if (state.open) return 5000;
  return state.weekend ? 300000 : 30000;
}
