import { getMarketState } from './market-hours.js'

/**
 * Describes the observation age, not the exchange's licensing/delay guarantee.
 * A recent Yahoo observation is NOT an official real-time IDX quote.
 */
export function quoteFreshness(timestamp, now = new Date()) {
  const state = getMarketState(now)
  const ageMs = Number.isFinite(timestamp) ? now.getTime() - timestamp : NaN
  const valid = Number.isFinite(ageMs) && ageMs >= -60_000
  const ageSeconds = valid ? Math.max(0, Math.floor(ageMs / 1000)) : null
  const freshness = !valid || (state.open && ageMs > 15 * 60_000)
    ? 'stale'
    : state.open ? 'recent' : 'closed'
  return { freshness, observationAgeSeconds: ageSeconds, sourceLatencyUnknown: true }
}
