import test from 'node:test'
import assert from 'node:assert/strict'
import { quoteFreshness } from '../lib/quote-freshness.js'

const marketNow = new Date('2026-10-21T03:00:00Z')
test('stale and recent observations are distinguished during IDX market hours', () => {
  assert.equal(quoteFreshness(Date.parse('2026-10-21T02:55:00Z'), marketNow).freshness, 'recent')
  assert.equal(quoteFreshness(Date.parse('2026-10-21T02:20:00Z'), marketNow).freshness, 'stale')
  assert.equal(quoteFreshness(Date.parse('2026-10-21T04:00:00Z'), marketNow).freshness, 'stale')
})
test('last closing observation is not mislabeled as live off-hours', () => {
  assert.equal(quoteFreshness(Date.parse('2026-10-20T09:00:00Z'),
    new Date('2026-10-21T19:00:00Z')).freshness, 'closed')
  assert.equal(quoteFreshness(Date.parse('2026-08-14T08:00:00Z'),
    new Date('2026-08-17T03:00:00Z')).freshness, 'closed')
})
test('quote quality always warns that source latency is unknown', () => {
  assert.equal(quoteFreshness(Date.now()).sourceLatencyUnknown, true)
})
