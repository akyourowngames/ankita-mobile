import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { openWorkStore } from '../server/work-store.mjs';
import { createWorkRuntime } from '../server/work-runtime.mjs';
import { createWorkServer } from '../server/work-server.mjs';

const temporary = async t => { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ankita-work-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; };
const spec = (id = 'fixture-work') => ({ id, deviceId: 'fixture-device', title: 'Research a plan', prompt: 'Prepare a useful plan', system: 'Answer clearly.', messages: [{ role: 'user', content: 'Prepare a useful plan' }], provider: { id: 'fixture', name: 'Fixture', kind: 'openai', baseUrl: 'https://provider.example/v1', model: 'fixture-model', keyRequired: true }, key: 'private-fixture-key' });
const waitUntil = async predicate => { for (let i = 0; i < 200; i++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('Work fixture did not settle'); };
test('encrypted atomic work store survives reopening without plaintext credentials or prompts', async t => {
  const root = await temporary(t), store = await openWorkStore(root);
  await store.change(state => { state.jobs.fixture = { secret: 'private-fixture-key', prompt: 'private-request-context' }; });
  const disk = await fs.readFile(path.join(root, 'state.enc'), 'utf8');
  assert.ok(!disk.includes('private-fixture-key') && !disk.includes('private-request-context'));
  const reopened = await openWorkStore(root);
  assert.equal(reopened.read().jobs.fixture.secret, 'private-fixture-key');
  await fs.writeFile(path.join(root, 'state.enc'), 'corrupt');
  await assert.rejects(openWorkStore(root), /could not be read/i);
});
test('idempotent work submission completes independently of the caller, persists results and hides credentials', async t => {
  const store = await openWorkStore(await temporary(t)); let calls = 0;
  const runtime = createWorkRuntime({ store, fetcher: async () => { calls++; await new Promise(r => setTimeout(r, 20)); return Response.json({ choices: [{ message: { content: 'The finished plan.' } }] }); } });
  t.after(() => runtime.close());
  const a = await runtime.submit(spec()), b = await runtime.submit(spec());
  assert.equal(a.id, b.id);
  await waitUntil(() => runtime.get(a.id).status === 'completed');
  assert.equal(calls, 1); assert.equal(runtime.get(a.id).reply, 'The finished plan.');
  assert.ok(!JSON.stringify(runtime.get(a.id)).includes('private-fixture-key'));
  await assert.rejects(runtime.submit({ ...spec(), prompt: 'A different request' }), /already|different|conflict/i);
  assert.equal(store.read().jobs[a.id].status, 'completed');
});
test('restart resumes from the last completed model round without replaying a completed tool', async t => {
  const root = await temporary(t), store = await openWorkStore(root); let modelCalls = 0, reads = 0;
  const fetcher = async (_url, options) => {
    modelCalls++; const body = JSON.parse(options.body);
    if (!body.messages.some(m => m.role === 'tool')) return Response.json({ choices: [{ message: { tool_calls: [{ id: 'read-one', type: 'function', function: { name: 'web_read', arguments: '{"url":"https://example.com/"}' } }] } }] });
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  };
  const runtime = createWorkRuntime({ store, fetcher, publicFetch: async () => { reads++; return new Response('<title>Example</title><p>Useful source.</p>', { headers: { 'content-type': 'text/html' } }); } });
  await runtime.submit(spec()); await waitUntil(() => modelCalls === 2);
  await runtime.close();
  const reopened = await openWorkStore(root);
  const resumed = createWorkRuntime({ store: reopened, fetcher: async () => Response.json({ choices: [{ message: { content: 'Recovered result.' } }] }), publicFetch: async () => { reads++; throw new Error('Must not repeat'); } });
  t.after(() => resumed.close());
  await resumed.ready;
  assert.equal(resumed.get('fixture-work').status, 'interrupted');
  await resumed.resume('fixture-work'); await waitUntil(() => resumed.get('fixture-work').status === 'completed');
  assert.equal(reads, 1); assert.equal(resumed.get('fixture-work').reply, 'Recovered result.');
});
test('cancelled work cannot accept a late provider result or create a completion notice', async t => {
  const store = await openWorkStore(await temporary(t)); let release;
  const runtime = createWorkRuntime({ store, fetcher: () => new Promise(resolve => { release = resolve; }) });
  t.after(() => runtime.close()); await runtime.submit(spec()); await waitUntil(() => !!release);
  await runtime.cancel('fixture-work');
  release(Response.json({ choices: [{ message: { content: 'Late result' } }] }));
  await new Promise(r => setTimeout(r, 30));
  assert.equal(runtime.get('fixture-work').status, 'cancelled'); assert.equal(runtime.get('fixture-work').reply, '');
  assert.equal(Object.keys(store.read().outbox).length, 0);
});
test('real HTTP worker authenticates, rejects cross-origin calls and returns durable results after reconnect', async t => {
  const store = await openWorkStore(await temporary(t)), runtime = createWorkRuntime({ store, fetcher: async () => Response.json({ choices: [{ message: { content: 'HTTP result' } }] }) });
  const server = createWorkServer({ runtime, token: 'fixture-pairing-token' });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await runtime.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const root = `http://127.0.0.1:${server.address().port}/work/v1`;
  assert.equal((await fetch(`${root}/capabilities`)).status, 401);
  const headers = { authorization: 'Bearer fixture-pairing-token', 'content-type': 'application/json' };
  assert.equal((await fetch(`${root}/capabilities`, { headers: { ...headers, origin: 'https://untrusted.example' } })).status, 403);
  const accepted = await fetch(`${root}/jobs`, { method: 'POST', headers, body: JSON.stringify(spec()) });
  assert.equal(accepted.status, 202);
  await waitUntil(() => runtime.get('fixture-work').status === 'completed');
  const result = await (await fetch(`${root}/jobs/fixture-work`, { headers })).json();
  assert.equal(result.reply, 'HTTP result'); assert.ok(!JSON.stringify(result).includes('private-fixture-key'));
});
test('provider call IDs reused across rounds do not reuse unrelated tool results', async t => {
  const store = await openWorkStore(await temporary(t)); let calls = 0, results;
  const runtime = createWorkRuntime({ store, fetcher: async (_url, options) => {
    calls++;
    if (calls < 3) return Response.json({ choices: [{ message: { tool_calls: [{ id: 'call_0', type: 'function', function: { name: 'calculate', arguments: JSON.stringify({ expression: calls === 1 ? '1+1' : '2+2' }) } }] } }] });
    results = JSON.parse(options.body).messages.filter(message => message.role === 'tool').map(message => JSON.parse(message.content).value);
    return Response.json({ choices: [{ message: { content: 'Both calculations finished.' } }] });
  } });
  t.after(() => runtime.close()); await runtime.submit(spec()); await waitUntil(() => runtime.get('fixture-work').status === 'completed');
  assert.deepEqual(results, [2, 4]);
});
test('a long final reply is retained and split into valid editable outputs', async t => {
  const store = await openWorkStore(await temporary(t)), reply = 'x'.repeat(100001);
  const runtime = createWorkRuntime({ store, fetcher: async () => Response.json({ choices: [{ message: { content: reply } }] }) });
  t.after(() => runtime.close()); await runtime.submit(spec()); await waitUntil(() => ['completed', 'failed'].includes(runtime.get('fixture-work').status));
  const result = runtime.get('fixture-work');
  assert.equal(result.status, 'completed'); assert.equal(result.reply, reply);
  assert.equal(result.artifacts.map(item => item.content).join(''), reply);
});

test('storage failures pause work without an unhandled rejection or starting queued jobs', async t => {
  const durable = await openWorkStore(await temporary(t)); let blocked = false, failures = 0, requests = 0, release;
  const store = { ...durable, change: update => durable.change(state => {
    update(state);
    if (blocked && failures < 2) { failures++; throw Object.assign(new Error('ENOSPC private disk path'), { code: 'ENOSPC' }); }
  }) };
  const runtime = createWorkRuntime({ store, fetcher: async () => {
    requests++; await new Promise(resolve => { release = resolve; });
    return Response.json({ choices: [{ message: { content: 'Unsaved result' } }] });
  } });
  t.after(() => runtime.close());
  await runtime.submit(spec()); await waitUntil(() => !!release);
  await runtime.submit(spec('queued-work'));
  blocked = true; release(); await waitUntil(() => failures > 0);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(runtime.health?.().ok, false, 'storage failure is exposed to callers');
  assert.match(runtime.health().error, /storage|checkpoint/i);
  assert.equal(runtime.health().recovery, 'restart');
  assert.equal(runtime.get('fixture-work').status, 'interrupted');
  assert.match(runtime.get('fixture-work').error, /saved checkpoint|last saved/i);
  assert.equal(runtime.get('fixture-work').reply, '');
  assert.equal(runtime.get('queued-work').status, 'queued'); assert.equal(requests, 1);
  assert.ok(!JSON.stringify(runtime.health()).includes('private disk path'));
  await assert.rejects(runtime.submit(spec('rejected-work')), /storage/i);
  blocked = false;
  assert.equal(runtime.health().ok, false, 'storage repair does not silently rerun work');
});

test('close waits for an active execution to persist interruption before flushing', async t => {
  const durable = await openWorkStore(await temporary(t)); let started = false, saving = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  const store = { ...durable, async change(update) {
    const next = durable.read(); update(next);
    if (next.jobs['fixture-work']?.status === 'interrupted') { saving = true; await gate; }
    return durable.change(state => Object.assign(state, next));
  } };
  const runtime = createWorkRuntime({ store, fetcher: async () => { started = true; return new Promise(() => {}); } });
  t.after(async () => { release(); await runtime.close(); });
  await runtime.submit(spec()); await waitUntil(() => started);
  let closed = false; const closing = runtime.close().then(() => { closed = true; });
  await waitUntil(() => saving); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(closed, false, 'close must wait for the interruption write');
  release(); await closing;
  assert.equal(durable.read().jobs['fixture-work'].status, 'interrupted');
});
