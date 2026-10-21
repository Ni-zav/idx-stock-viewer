import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { WebSocket } from 'ws';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

async function until(callback, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await callback();
      if (result) return result;
    } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for API state');
}

test('API security boundaries and WebSocket subscriptions are isolated', { timeout: 15000 }, async t => {
  const port = await freePort();
  const api = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['api-server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stderr.on('data', chunk => logs.push(chunk.toString()));
  t.after(() => child.kill());
  await until(async () => {
    const response = await fetch(api + '/api/health');
    return response.ok;
  });

  const health = await (await fetch(api + '/api/health')).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.cachedSymbols, 0);
  assert.equal(health.streaming, false);

  async function post(endpoint, body) {
    return fetch(api + endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  assert.equal((await post('/api/streaming/start', { tickers: ['--all'] })).status, 400);
  assert.equal((await post('/api/update', { ticker: '../etc/passwd' })).status, 400);
  assert.equal((await post('/api/intraday/fetch', { tickers: ['../etc'] })).status, 400);
  assert.equal((await fetch(api + '/api/prices?tickers=../etc')).status, 400);

  const first = new WebSocket(`ws://127.0.0.1:${port}/ws/stream`);
  const second = new WebSocket(`ws://127.0.0.1:${port}/ws/stream`);
  t.after(() => { first.close(); second.close(); });
  await Promise.all([once(first, 'open'), once(second, 'open')]);
  first.send(JSON.stringify({type:'subscribe',tickers:['BBCA']}));
  second.send(JSON.stringify({type:'subscribe',tickers:['BBRI']}));
  const status = async () => (await (await fetch(api + '/api/streaming/status')).json()).tickers;
  await until(async () => (await status()).length === 2);
  assert.deepEqual((await status()).sort(), ['BBCA', 'BBRI']);

  first.send(JSON.stringify({type:'unsubscribe'}));
  await until(async () => JSON.stringify(await status()) === JSON.stringify(['BBRI']));
  second.close();
  await until(async () => (await status()).length === 0);
});
