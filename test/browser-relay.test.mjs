import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createBrowserRelay } from '../src/api/browserRelay.ts';
import { ConnectionError } from '../src/api/connectionErrors.ts';
import config from '../src/constants/transport.json' with { type: 'json' };

const TOKEN = 'fixture-relay-session';
const NEXT_TOKEN = 'fixture-renewed-session';
const TARGET = 'https://provider.example/v1/models';
const PROXY_PATH = config.proxyPath;
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

test('a failed session handshake is retried on the next operation without direct credential forwarding', async () => {
  const calls = [];
  const relay = createBrowserRelay(async (url, options) => {
    calls.push({ url, options });
    if (url === config.sessionPath) return calls.length === 1 ? response({}, 503) : response({ token: TOKEN });
    return response({ data: [] });
  });
  await assert.rejects(relay(PROXY_PATH, { url: TARGET, method: 'GET', headers: { Authorization: 'Bearer fixture' } }), ConnectionError);
  assert.equal((await relay(PROXY_PATH, { url: TARGET, method: 'GET' })).status, 200);
  assert.equal(calls.filter(call => call.url === config.sessionPath).length, 2);
  assert.ok(calls.every(call => call.url !== TARGET));
});

test('concurrent requests share a session handshake and cancellation does not cancel other callers', async () => {
  let settle;
  let sessions = 0;
  const relay = createBrowserRelay(async url => {
    if (url === config.sessionPath) { sessions++; return new Promise(resolve => { settle = resolve; }); }
    return response({ ok: true });
  });
  const controller = new AbortController();
  const stopped = relay(PROXY_PATH, { url: TARGET, method: 'GET' }, controller.signal);
  const active = relay(PROXY_PATH, { url: TARGET, method: 'GET' });
  controller.abort();
  await assert.rejects(stopped, { name: 'AbortError' });
  settle(response({ token: TOKEN }));
  assert.equal((await active).status, 200);
  assert.equal(sessions, 1);
});

test('only an explicit local session rejection refreshes the token before forwarding the same request once', async () => {
  const tokens = [];
  let sessions = 0;
  const relay = createBrowserRelay(async (url, options) => {
    if (url === config.sessionPath) return response({ token: ++sessions === 1 ? TOKEN : NEXT_TOKEN });
    const token = new Headers(options.headers).get('x-chief-session');
    tokens.push(token);
    if (token === TOKEN) return response({}, 403, { [config.relayErrorHeader]: config.sessionInvalidCode });
    return response({ result: 'accepted' });
  });
  assert.equal((await relay(PROXY_PATH, { url: TARGET, method: 'POST', body: '{}' })).status, 200);
  assert.deepEqual(tokens, [TOKEN, NEXT_TOKEN]);
  assert.equal(sessions, 2);
});

test('upstream authorization failures are returned intact and never replay a provider request', async () => {
  let forwarded = 0;
  const relay = createBrowserRelay(async url => {
    if (url === config.sessionPath) return response({ token: TOKEN });
    forwarded++;
    return response({ error: { code: 'invalid_api_key' } }, 403);
  });
  const result = await relay(PROXY_PATH, { url: TARGET, method: 'POST', body: '{}' });
  assert.equal(result.status, 403);
  assert.equal(forwarded, 1);
});

test('a network failure after forwarding is reported without retrying a possibly completed action', async () => {
  let forwarded = 0;
  const relay = createBrowserRelay(async url => {
    if (url === config.sessionPath) return response({ token: TOKEN });
    forwarded++;
    throw new TypeError('fixture private endpoint and secret must stay hidden');
  });
  await assert.rejects(relay(PROXY_PATH, { url: TARGET, method: 'POST', body: '{}' }), error => error instanceof ConnectionError && !error.message.includes('secret'));
  assert.equal(forwarded, 1);
});

test('a restarted real HTTP relay accepts a refreshed session and executes the operation once', async t => {
  let token = TOKEN;
  let executions = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === config.sessionPath) return res.end(JSON.stringify({ token }));
    for await (const _chunk of req) { /* Consume the real request before responding. */ }
    if (req.headers['x-chief-session'] !== token) {
      res.writeHead(403, { [config.relayErrorHeader]: config.sessionInvalidCode });
      return res.end('{}');
    }
    executions++;
    res.end('{"ok":true}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const relay = createBrowserRelay((url, options) => fetch(origin + url, options));
  await relay(PROXY_PATH, { url: TARGET, method: 'GET' });
  token = NEXT_TOKEN;
  await relay(PROXY_PATH, { url: TARGET, method: 'POST', body: '{}' });
  assert.equal(executions, 2, 'each logical operation is executed exactly once');
  console.log('BROWSER_RELAY_HTTP_RECOVERY_OK executions=' + executions);
});
