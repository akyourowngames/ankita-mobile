import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildRequest, streamRequest } from '../src/api/protocol.ts';
import { abortable } from '../src/api/abortable.ts';

test('Stop settles a caller even when the shared relay handshake never returns', async () => {
  const controller = new AbortController();
  const result = abortable(new Promise(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
});

test('explicit completion ends generation without waiting for the provider socket to close', async t => {
  const base = await serverFor(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"done"}}]}\n\ndata: [DONE]\n\n');
  });
  assert.equal(await streamRequest(request(base), fetch, AbortSignal.timeout(TICK_MS * 30), () => {}), 'done');
});

const TICK_MS = 30; // Fixture-only chunk cadence, fast enough for a deterministic transport round trip.
async function serverFor(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}/v1`;
}
const provider = baseUrl => ({ id: 'fixture', name: 'Fixture', kind: 'openai', baseUrl, model: 'fixture-model', keyRequired: false });
const request = baseUrl => buildRequest(provider(baseUrl), '', [{ role: 'user', content: 'Hi' }], 'Be clear');

test('real HTTP SSE streams text before completion and carries the selected model/system/history', async t => {
  let body;
  const base = await serverFor(t, (req, res) => {
    const parts = []; req.on('data', chunk => parts.push(chunk)); req.on('end', () => {
      body = JSON.parse(Buffer.concat(parts)); res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Héllo "}}]}\n\n');
      setTimeout(() => res.end('data: {"choices":[{"delta":{"content":"there"}}]}\n\ndata: [DONE]\n\n'), TICK_MS);
    });
  });
  const chunks = [], result = await streamRequest(request(base), fetch, new AbortController().signal, text => chunks.push(text));
  assert.deepEqual(chunks, ['Héllo ', 'there']); assert.equal(result, 'Héllo there');
  assert.equal(body.model, 'fixture-model'); assert.equal(body.messages[0].role, 'system'); assert.equal(body.messages[1].content, 'Hi');
});

test('Stop aborts the real connection, keeps partial text and does not accept another frame', async t => {
  const base = await serverFor(t, (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); const timer = setInterval(() => res.write('data: {"choices":[{"delta":{"content":"part"}}]}\n\n'), TICK_MS); res.on('close', () => clearInterval(timer)); });
  const controller = new AbortController(), parts = [];
  await assert.rejects(streamRequest(request(base), fetch, controller.signal, text => { parts.push(text); controller.abort(); }), { name: 'AbortError' });
  assert.deepEqual(parts, ['part']);
});

test('cut-off streams are errors rather than fabricated completion', async t => {
  const base = await serverFor(t, (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'); });
  const parts = []; await assert.rejects(streamRequest(request(base), fetch, new AbortController().signal, text => parts.push(text)), /before completion/); assert.deepEqual(parts, ['partial']);
});

test('HTTP errors cannot return provider error bodies or API keys to UI', async t => {
  const secret = 'fixture-secret-never-display';
  const base = await serverFor(t, (req, res) => { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: secret } })); });
  await assert.rejects(streamRequest({ ...request(base), headers: { Authorization: `Bearer ${secret}` } }, fetch, new AbortController().signal, () => {}), error => /HTTP 401/.test(error.message) && !error.message.includes(secret));
});

test('Anthropic streams and nonstreaming compatible JSON are supported', async t => {
  let mode = 'anthropic';
  const base = await serverFor(t, (req, res) => { if (mode === 'anthropic') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hello"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'); } else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"choices":[{"message":{"content":"plain reply"}}]}'); } });
  assert.equal(await streamRequest(request(base), fetch, new AbortController().signal, () => {}), 'hello');
  mode = 'json'; assert.equal(await streamRequest(request(base), fetch, new AbortController().signal, () => {}), 'plain reply');
});
