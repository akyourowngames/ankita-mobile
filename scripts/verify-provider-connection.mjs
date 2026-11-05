import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { createWebServer } from './serve-web.mjs';
import transport from '../src/constants/transport.json' with { type: 'json' };
import { VERIFY_TIMEOUTS } from './verification-config.mjs';

const HOST = '127.0.0.1'; // Loopback-only integration fixtures never contact a user's provider.
const MODEL = 'connection-fixture';
const KEY = 'provider-connection-fixture-key';
const REPLY = 'Connected chat is working.';
const VIEWPORT = { width: 390, height: 844 }; // CSS pixels, phone-width acceptance coverage.
const artifacts = process.env.CHIEF_VERIFY_ARTIFACT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'chief-provider-'));
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
after(() => browser.close());
console.log('PROVIDER_CONNECTION_ARTIFACTS=' + artifacts);

async function fixture(t) {
  const requests = [];
  let catalogue = { status: 200, payload: { data: [{ id: MODEL }] } };
  let sessionUnavailable = false;
  let sessionPending = false;
  let sessionStarted;
  const pendingSession = new Promise(resolve => { sessionStarted = resolve; });
  let app = createWebServer();
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body });
    // No CORS response headers. Browser requests must use the real app relay.
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') { res.statusCode = catalogue.status; return res.end(JSON.stringify(catalogue.payload)); }
    const probing = body?.tools?.some(tool => tool.function?.name === 'check_connection');
    const message = probing ? { content: '', tool_calls: [{ id: 'probe', type: 'function', function: { name: 'check_connection', arguments: '{}' } }] } : { content: REPLY };
    res.end(JSON.stringify({ choices: [{ finish_reason: probing ? 'tool_calls' : 'stop', message }] }));
  });
  const web = http.createServer((req, res) => {
    if (sessionPending && req.url === transport.sessionPath) { sessionStarted(); return; }
    if (sessionUnavailable && req.url === transport.sessionPath) {
      res.writeHead(503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Fixture relay temporarily unavailable' }));
    }
    app.emit('request', req, res);
  });
  await Promise.all([new Promise(resolve => upstream.listen(0, HOST, resolve)), new Promise(resolve => web.listen(0, HOST, resolve))]);
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.setDefaultTimeout(VERIFY_TIMEOUTS.interactionMs);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    await page.screenshot({ path: path.join(artifacts, t.name.replace(/\W+/g, '-') + '.png'), fullPage: true }).catch(() => {});
    await page.context().close();
    await Promise.all([web, upstream].map(server => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); }));
    assert.deepEqual(errors, [], 'the app must not throw uncaught page errors');
  });
  const button = name => page.getByRole('button', { name, exact: true });
  await page.goto(process.env.CHIEF_VERIFY_URL || `http://${HOST}:${web.address().port}`);
  await button('Get started').click();
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Connection check');
  await button('Continue').click();
  await button('Set up my provider').click();
  await button('Add Custom provider').click();
  await page.getByRole('textbox', { name: 'Provider name', exact: true }).fill('Connection fixture');
  await page.getByRole('textbox', { name: 'API base URL', exact: true }).fill(`http://${HOST}:${upstream.address().port}/v1`);
  await page.getByRole('switch', { name: 'API key required' }).click();
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill(KEY);
  const discover = async (selectModel = false) => {
    await button('Test connection & find models').click();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Checking connection…"]') && document.querySelector('[role="alert"]')?.textContent);
    if (await button('Close models').count()) {
      await button(selectModel ? MODEL : 'Close models').click();
      await button('Close models').waitFor({ state: 'hidden' });
    }
  };
  return { page, button, discover, requests,
    catalogue(status, payload) { catalogue = { status, payload }; },
    unavailable(value) { sessionUnavailable = value; },
    stallSession() { sessionPending = true; return pendingSession; },
    restart() { app = createWebServer(); },
  };
}

test('provider setup, model test and chat work through a CORS-less real HTTP provider', async t => {
  const f = await fixture(t);
  await f.discover(true);
  assert.equal(f.requests.filter(req => req.url === '/v1/models').length, 1);
  assert.equal(f.requests[0].authorization, `Bearer ${KEY}`);
  assert.equal(await f.page.getByRole('textbox', { name: 'Model ID', exact: true }).inputValue(), MODEL);
  await f.button('Test selected model').click();
  await f.page.getByText(/Selected model generated a native tool call/).waitFor();
  await f.button('Save provider').click();
  await f.button('Start chatting').click();
  await f.page.getByRole('textbox', { name: 'Message', exact: true }).fill('Check the saved connection.');
  await f.button('Send message').click();
  await f.page.getByText(REPLY, { exact: true }).waitFor();
  assert.equal(f.requests.filter(req => req.method === 'OPTIONS').length, 0);
  assert.ok(f.requests.every(req => req.authorization === `Bearer ${KEY}`));
  console.log('PROVIDER_SETUP_CHAT_HTTP_OK requests=' + f.requests.length);
});

test('a temporary relay handshake failure can recover without reloading the app', async t => {
  const f = await fixture(t);
  f.unavailable(true);
  await f.discover();
  assert.match(await f.page.getByRole('alert').innerText(), /app connection is unavailable/i,
    'a local relay failure must not blame the provider key or its CORS configuration');
  f.unavailable(false);
  await f.discover();
  assert.equal(f.requests.filter(req => req.method === 'GET' && req.url === '/v1/models').length, 1,
    'retry must acquire a fresh local session and reach the model catalogue');
  assert.ok(await f.page.getByText(/Connection works/).count());
  console.log('PROVIDER_HANDSHAKE_RECOVERY_OK');
});

test('a restarted relay refreshes its session before forwarding the next provider request', async t => {
  const f = await fixture(t);
  await f.discover();
  f.restart();
  await f.discover();
  assert.equal(f.requests.filter(req => req.method === 'GET' && req.url === '/v1/models').length, 2,
    'an expired local session must not be mistaken for a rejected provider key');
  assert.ok(await f.page.getByText(/Connection works/).count());
  console.log('PROVIDER_RESTART_RECOVERY_OK');
});

test('a pending connection check can be cancelled without losing provider details', async t => {
  const f = await fixture(t);
  const started = f.stallSession();
  await f.button('Test connection & find models').click();
  await started;
  assert.equal(await f.button('Save provider').isEnabled(), false);
  assert.equal(await f.button('Test selected model').isEnabled(), false);
  assert.equal(await f.page.getByRole('progressbar').count(), 1, 'only the active check has a spinner');
  await f.button('Cancel check').click();
  assert.equal(await f.page.getByRole('textbox', { name: 'API key', exact: true }).inputValue(), KEY);
  assert.equal(await f.page.getByRole('textbox', { name: 'Provider name', exact: true }).inputValue(), 'Connection fixture');
  assert.equal(await f.button('Test connection & find models').isEnabled(), true);
  assert.match(await f.page.getByRole('alert').innerText(), /cancelled/i);
  assert.equal(f.requests.length, 0);
  console.log('PROVIDER_CHECK_CANCEL_OK providerRequests=0');
});

test('model discovery explains provider authentication and rate limits without exposing remote details', async t => {
  const f = await fixture(t);
  const privateRemoteText = 'private-provider-sentinel-never-display';
  f.catalogue(401, { error: { message: privateRemoteText } });
  await f.discover();
  assert.match(await f.page.getByRole('alert').innerText(), /provider rejected authentication/i);
  assert.doesNotMatch(await f.page.getByRole('alert').innerText(), /private-provider-sentinel/);
  f.catalogue(429, { error: { code: 'rate_limit', message: privateRemoteText } });
  await f.discover();
  assert.match(await f.page.getByRole('alert').innerText(), /rate-limiting/i);
  assert.equal(await f.page.getByRole('textbox', { name: 'API key', exact: true }).inputValue(), KEY);
  f.catalogue(200, { incompatible: privateRemoteText });
  await f.discover();
  assert.match(await f.page.getByRole('alert').innerText(), /enter a model manually/i);
  f.catalogue(200, { data: [{ id: MODEL }] });
  await f.discover(true);
  assert.equal(await f.page.getByRole('textbox', { name: 'Model ID', exact: true }).inputValue(), MODEL);
  console.log('PROVIDER_DISCOVERY_ERRORS_RECOVERY_OK requests=' + f.requests.length);
});
