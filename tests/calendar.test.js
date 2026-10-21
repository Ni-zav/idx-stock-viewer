import test from 'node:test'
import assert from 'node:assert/strict'
import { getMarketState, getAdaptiveInterval } from '../lib/market-hours.js'

test('IDX 2026 holiday closure overrides ordinary weekday opening', () => {
  const holiday = getMarketState(new Date('2026-08-17T03:00:00Z'))
  assert.equal(holiday.date, '2026-08-17')
  assert.equal(holiday.holiday, true)
  assert.equal(holiday.open, false)
  assert.equal(holiday.calendarVerified, true)
  assert.equal(getAdaptiveInterval(new Date('2026-08-17T03:00:00Z')), 300000)
})

test('October weekday trades; upcoming year is flagged unverified', () => {
  assert.equal(getMarketState(new Date('2026-10-21T03:00:00Z')).open, true)
  const other = getMarketState(new Date('2027-01-04T03:00:00Z'))
  assert.equal(other.calendarVerified, false)
  assert.equal(other.holiday, false)
})
