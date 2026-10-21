import test from 'node:test'
import assert from 'node:assert/strict'
import { adjustOhlcv } from '../lib/adjusted-prices.js'

test('scales OHLC consistently to vendor adjusted close, not volume', () => {
  const raw = [{date:'2026-10-20',ticker:'BBCA',open:100,high:120,low:90,close:110,adjClose:88,volume:400}]
  const [adjusted] = adjustOhlcv(raw)
  assert.equal(adjusted.open, 80)
  assert.equal(adjusted.high, 96)
  assert.equal(adjusted.low, 72)
  assert.equal(adjusted.close, 88)
  assert.equal(adjusted.volume, 400)
  assert.equal(raw[0].close, 110)
})
test('missing adjusted closes fail closed rather than fabricating a return', () => {
  assert.throws(() => adjustOhlcv([{open:1,high:2,low:1,close:1,adjClose:0}]), RangeError)
})
