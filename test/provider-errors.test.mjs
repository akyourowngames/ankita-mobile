import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildRequest, streamRequest } from '../src/api/protocol.ts';

// Local HTTP reproductions: removing error-envelope classification breaks these assertions.
const cases = [
  { status: 429, body: { error: { code: 429, message: 'Concurrency limit reached' } }, code: 'rate_limit', retry: 2000 },
  { status: 429, body: { error: { code: 'insufficient_quota', message: 'private-account-sentinel' } }, code: 'quota' },
  { status: 401, body: { error: { code: 'PAID_MODEL_AUTH_REQUIRED' } }, code: 'model_access' },
  { status: 403, body: { error: { type: 'FreeTierError', message: 'Free tier can only be used from within OpenCode' } }, code: 'client_restricted' },
  { status: 404, body: { error: { message: 'No endpoints found that support image input' } }, code: 'vision_unsupported' },
  { status: 503, body: { error: { message: 'private-account-sentinel' } }, code: 'unavailable' },
];
for (const fixture of cases) test(`HTTP ${fixture.status}: ${fixture.code} stays actionable without exposing account payloads`, async t => {
  const server = http.createServer((_req, res) => { res.writeHead(fixture.status, { 'content-type': 'application/json', 'retry-after': '2' }); res.end(JSON.stringify(fixture.body)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const provider = { id: 'p', name: 'Kilo fixture', kind: 'openai', model: 'fixture', keyRequired: true, baseUrl: `http://127.0.0.1:${server.address().port}` };
  await assert.rejects(streamRequest(buildRequest(provider, 'private-key-sentinel', [{ role: 'user', content: 'hi' }], ''), fetch, AbortSignal.timeout(5000), () => {}), error => {
    console.log(`PROVIDER_REPRO status=${fixture.status} code=${error.code || 'missing'} message=${error.message}`);
    assert.equal(error.code, fixture.code);
    if (fixture.retry) assert.equal(error.retryAfterMs, fixture.retry);
    assert.doesNotMatch(error.message, /private-(?:account|key)-sentinel/);
    return true;
  });
});

test('an HTTP-success SSE error remains a provider failure, retaining only the actual partial reply', async () => {
  let partial = '';
  const response = new Response('data: {"choices":[{"delta":{"content":"Actual partial"}}]}\n\ndata: {"error":{"code":429,"message":"private-account-sentinel"}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  const request = { url: 'https://fixture.test', headers: {}, body: {} };
  await assert.rejects(streamRequest(request, async () => response, new AbortController().signal, text => { partial += text; }), error => error.code === 'rate_limit' && !error.message.includes('private-account-sentinel'));
  assert.equal(partial, 'Actual partial');
});
