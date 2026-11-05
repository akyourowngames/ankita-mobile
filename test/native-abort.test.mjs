import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildRequest, streamRequest } from '../src/api/protocol.ts';
import { abortable } from '../src/api/abortable.ts';
import { installAbortSignalCompatibility } from '../src/runtime/abortSignal.ts';
import { probeModel } from '../src/api/modelProbe.ts';
import { createStateWriter } from '../src/storage/stateWriter.ts';

const require = createRequire(import.meta.url);
// This is the exact AbortController module installed by React Native's setUpXHR.
const native = require('abort-controller/dist/abort-controller');
installAbortSignalCompatibility(native.AbortSignal, native.AbortController);
const WireAbortController = globalThis.AbortController;

// Node's HTTP implementation requires its own signal brand. The app still sees
// the real native signal. This adapter only bridges cancellation at the wire.
async function nativeHTTP(input, options) {
  const controller = new WireAbortController();
  const cancel = () => controller.abort(options.signal.reason);
  options.signal.addEventListener('abort', cancel, { once: true });
  if (options.signal.aborted) cancel();
  try { return await fetch(input, { ...options, signal: controller.signal }); }
  finally { options.signal.removeEventListener('abort', cancel); }
}

test('modern cancellation is preserved and native installation is idempotent', () => {
  const modernAbort = AbortController.prototype.abort;
  const modernThrow = AbortSignal.prototype.throwIfAborted;
  installAbortSignalCompatibility();
  assert.equal(AbortController.prototype.abort, modernAbort);
  assert.equal(AbortSignal.prototype.throwIfAborted, modernThrow);
  const nativeAbort = native.AbortController.prototype.abort;
  installAbortSignalCompatibility(native.AbortSignal, native.AbortController);
  assert.equal(native.AbortController.prototype.abort, nativeAbort);
  const controller = new native.AbortController();
  assert.equal(controller.signal.reason, undefined);
  controller.abort(null);
  assert.equal(controller.signal.reason, null);
});

test('the installed native AbortSignal can start and read an actual provider response', async t => {
  let requests = 0;
  const server = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* Consume the real generation request. */ }
    requests++;
    res.setHeader('content-type', 'application/json');
    res.end('{"choices":[{"message":{"content":"Native connection works."}}]}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const provider = { id: 'native-fixture', name: 'Native fixture', kind: 'openai',
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture-model', keyRequired: false };
  const controller = new native.AbortController();
  const output = await streamRequest(buildRequest(provider, '', [{ role: 'user', content: 'Hi' }], ''), nativeHTTP, controller.signal, () => {});
  assert.equal(output, 'Native connection works.');
  assert.equal(requests, 1);
  console.log('ANDROID_ABORT_HTTP_OK requests=' + requests);
});

test('native Stop rejects shared waits with a stable AbortError', async () => {
  const controller = new native.AbortController();
  const waiting = abortable(new Promise(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  const reason = controller.signal.reason;
  assert.ok(reason instanceof Error);
  assert.throws(() => controller.signal.throwIfAborted(), error => error === reason);
});

test('native abort reasons survive repeated aborts and are available to event listeners', () => {
  const controller = new native.AbortController();
  const reason = new Error('Fixture cancellation');
  let observed;
  controller.signal.addEventListener('abort', () => { observed = controller.signal.reason; });
  controller.abort(reason);
  controller.abort(new Error('Later reason must not replace the first'));
  assert.equal(controller.signal.reason, reason);
  assert.equal(observed, reason);
});

for (const kind of ['openai', 'anthropic', 'chief']) test(`${kind}: native model test completes over real HTTP`, async t => {
  const previousController = globalThis.AbortController;
  globalThis.AbortController = native.AbortController;
  t.after(() => { globalThis.AbortController = previousController; });
  let requests = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    requests++;
    assert.equal(body.model, 'native-test-model');
    const name = body.tools?.[0]?.function?.name || body.tools?.[0]?.name;
    const reply = kind === 'anthropic' ? { content: [{ type: 'tool_use', id: 'native-probe', name, input: {} }] }
      : kind === 'chief' ? { reply: 'Native Chief connected.' }
      : { choices: [{ message: { tool_calls: [{ id: 'native-probe', type: 'function', function: { name, arguments: '{}' } }] } }] };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(reply));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const provider = { id: 'native-probe', name: 'Native test', kind,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'native-test-model', keyRequired: true };
  assert.equal(await probeModel(provider, 'native-fixture-key', nativeHTTP, new native.AbortController().signal), kind === 'chief' ? 'text' : 'tools');
  assert.equal(requests, 1);
  console.log('ANDROID_MODEL_HTTP_OK kind=' + kind + ' requests=' + requests);
});

test('native signals permit durable assistant changes and reject a stopped mutation before writing', async () => {
  let state = { assistant: { fixture: 'before' } }, persisted;
  const writer = createStateWriter({ get: () => state, publish: update => { state = update(state); }, persist: async next => { persisted = next; } });
  await writer.commit(() => ({ fixture: 'saved' }), new native.AbortController().signal);
  assert.deepEqual(state, { assistant: { fixture: 'saved' } });
  assert.deepEqual(persisted, state);
  const stopped = new native.AbortController(); stopped.abort();
  await assert.rejects(writer.commit(() => ({ fixture: 'must not save' }), stopped.signal), { name: 'AbortError' });
  assert.deepEqual(persisted, state);
});

test('the app installs native cancellation compatibility before importing app screens', () => {
  const entry = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const compatibility = entry.indexOf("import './src/runtime/abortSignal'");
  assert.ok(compatibility >= 0, 'the production entry point must install compatibility');
  assert.ok(compatibility < entry.indexOf("import App from './App'"));
});
