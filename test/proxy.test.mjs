import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const proxy = (() => { try { return require('../server/provider-proxy.cjs'); } catch { return {}; } })();
test('browser relay streams a CORS-less provider, rejects other origins and never forwards redirects', async t => {
  assert.equal(typeof proxy.createProviderProxy, 'function', 'same-origin provider relay is missing');
  const upstream = http.createServer((req, res) => { if (req.url === '/v1/models') { res.setHeader('content-type', 'application/json'); res.end('{"data":[{"id":"fixture-model"}]}'); } else if (req.url === '/v1/chat/completions') { res.setHeader('content-type', 'text/event-stream'); res.end('data: {"choices":[{"delta":{"content":"works"}}]}\n\ndata: [DONE]\n\n'); } else { res.writeHead(302, { location: 'https://example.com/steal' }); res.end(); } });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const relay = http.createServer(proxy.createProviderProxy());
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  t.after(() => { for (const server of [relay, upstream]) { server.closeAllConnections(); server.close(); } });
  const origin = `http://127.0.0.1:${relay.address().port}`, base = `http://127.0.0.1:${upstream.address().port}`;
  const config = require('../src/constants/transport.json');
  const session = await fetch(`${origin}${config.sessionPath}`, { headers: { Origin: origin } }).then(r => r.json());
  const send = (url, overrides = {}) => fetch(`${origin}${config.proxyPath}`, { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json', 'x-chief-session': session.token }, body: JSON.stringify({ url, method: 'GET', headers: { Authorization: 'fixture-key' }, ...overrides }) });
  assert.equal((await (await send(`${base}/v1/models`)).json()).data[0].id, 'fixture-model');
  assert.match(await (await send(`${base}/v1/chat/completions`, { method: 'POST', body: '{}' })).text(), /works/);
  const blocked = await fetch(`${origin}${config.proxyPath}`, { method: 'POST', headers: { Origin: 'https://evil.example', 'content-type': 'application/json', 'x-chief-session': session.token }, body: '{}' }); assert.equal(blocked.status, 403);
  const badToken = await fetch(`${origin}${config.proxyPath}`, { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json', 'x-chief-session': 'wrong' }, body: '{}' }); assert.equal(badToken.status, 403);
  const unicodeToken = await fetch(`${origin}${config.proxyPath}`, { method: 'POST', headers: { Origin: origin, 'x-chief-session': 'é'.repeat(session.token.length) }, body: '{}' }); assert.equal(unicodeToken.status, 403);
  assert.equal((await send(`${base}/v1/health`)).status, 502);
  assert.equal((await send(`${base}/v1/not-an-ai-route`)).status, 400);
});

test('browser relay preserves Retry-After without exposing cookies or upstream secrets', async t => {
  const upstream = http.createServer((_req, res) => { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '2', 'set-cookie': 'private-cookie', 'x-private-key': 'private-secret' }); res.end('{"error":{"code":429}}'); });
  const relay = http.createServer(proxy.createProviderProxy());
  await Promise.all([new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve)), new Promise(resolve => relay.listen(0, '127.0.0.1', resolve))]);
  t.after(() => { for (const server of [upstream, relay]) { server.closeAllConnections(); server.close(); } });
  const origin = `http://127.0.0.1:${relay.address().port}`, config = require('../src/constants/transport.json');
  const session = await fetch(`${origin}${config.sessionPath}`, { headers: { Origin: origin } }).then(res => res.json());
  const res = await fetch(`${origin}${config.proxyPath}`, { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json', 'x-chief-session': session.token }, body: JSON.stringify({ url: `http://127.0.0.1:${upstream.address().port}/chat/completions`, method: 'POST', body: '{}' }) });
  assert.equal(res.status, 429); assert.equal(res.headers.get('retry-after'), '2');
  assert.equal(res.headers.get('set-cookie'), null); assert.equal(res.headers.get('x-private-key'), null);
});
