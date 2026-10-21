import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { WebSocket } from 'ws'

async function unusedPort() {
  const s = createServer()
  s.listen(0, '127.0.0.1')
  await once(s, 'listening')
  const port = s.address().port
  s.close()
  await once(s, 'close')
  return port
}

test('remote bind refuses to start without an API token', async () => {
  const port = await unusedPort()
  const child = spawn(process.execPath, ['api-server.js'], {
    env: { ...process.env, HOST: '0.0.0.0', PORT: String(port), API_TOKEN: '' },
    stdio: 'ignore',
  })
  const [code] = await once(child, 'exit')
  assert.notEqual(code, 0)
})

test('when token enabled, HTTP and WS commands reject unauthorized clients', { timeout: 15000 }, async t => {
  const port = await unusedPort(), token = '0123456789abcdef0123456789abcdef'
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['api-server.js'], {
    env: {...process.env, HOST:'127.0.0.1',PORT:String(port),API_TOKEN:token},
    stdio:['ignore','pipe','pipe'],
  })
  t.after(() => child.kill())
  let ready = false
  for(let i=0;i<80;i++) {
    try {
      const response = await fetch(base + '/api/health', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if(response.ok) { ready=true; break }
    } catch { /* starting */ }
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  assert.ok(ready, 'API never became ready')
  const unauthorized = await fetch(base + '/api/health')
  assert.equal(unauthorized.status, 401)
  const authorized = await fetch(base + '/api/health', {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(authorized.status, 200)
  const health = await authorized.json()
  assert.equal(health.workerCapacity, 3)

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/stream`)
    ws.once('unexpected-response', (_req, response) => {
      try { assert.equal(response.statusCode, 401); response.resume(); resolve() }
      catch(error) { reject(error) }
    })
    ws.once('error', reject)
  })

  const authorizedSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/stream`,
    ['idx-v1', `idx-auth-${token}`])
  t.after(() => authorizedSocket.close())
  await once(authorizedSocket, 'open')
  assert.equal(authorizedSocket.readyState, WebSocket.OPEN)
})
