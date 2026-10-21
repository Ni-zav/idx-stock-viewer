import { readFileSync } from 'node:fs'

// A versioned IDX closure calendar is shared with market_calendar.py.
const calendar = JSON.parse(readFileSync(new URL('../config/idx-market-calendar.json', import.meta.url), 'utf8'))
const holidaySets = Object.fromEntries(
  Object.entries(calendar.holidaysByYear).map(([year, days]) => [year, new Set(days)])
)

const jakartaClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function getMarketState(now = new Date()) {
  const values = Object.fromEntries(jakartaClock.formatToParts(now).map(part => [part.type, part.value]))
  const minutes = Number(values.hour) * 60 + Number(values.minute)
  const date = `${values.year}-${values.month}-${values.day}`
  const weekend = values.weekday === 'Sat' || values.weekday === 'Sun'
  const calendarVerified = Object.hasOwn(holidaySets, values.year)
  const holiday = holidaySets[values.year]?.has(date) ?? false
  const friday = values.weekday === 'Fri'

  // IDX regular market continuous sessions; auctions/negotiated market differ.
  const sessions = friday
    ? [[9 * 60, 11 * 60 + 30], [14 * 60, 15 * 60 + 50]]
    : [[9 * 60, 12 * 60], [13 * 60 + 30, 15 * 60 + 50]]
  const open = !weekend && !holiday && sessions.some(([start, end]) => minutes >= start && minutes < end)

  return { open, weekend, holiday, calendarVerified, date, weekday: values.weekday, minutes }
}

export function getAdaptiveInterval(now = new Date()) {
  const state = getMarketState(now)
  if (state.open) return 5000
  return state.weekend || state.holiday ? 300000 : 30000
}
