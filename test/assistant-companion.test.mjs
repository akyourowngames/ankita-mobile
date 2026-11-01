import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionServer } from '../server/companion.mjs';
import { desktopRun, discoverDesktop, companionURL } from '../src/assistant/desktop.ts';
import { createDesktopRuntime } from '../server/desktop-runtime.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createPhoneToolSession } from '../src/assistant/tools.ts';
import { emptyAssistantState } from '../src/assistant/records.ts';
import { TOOL_NAMES as N } from '../src/assistant/config.ts';

const TOKEN = 'fixture-desktop-pairing-token'; // Test-only credential and ephemeral local endpoint.
const prompt = 'Perform a fixture desktop action';
const options = { enabled: true, baseUrl: '' };
async function fixture(runtime) {
  const server = createCompanionServer({ token: TOKEN, runtime });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { server, config: { ...options, baseUrl }, close: () => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); } };
}
test('pairing is required, versioned and exposes capabilities without credentials', async () => {
  const f = await fixture({ capabilities: async () => ['read_file'], run: async () => '' });
  try {
    await assert.rejects(discoverDesktop(f.config, 'wrong', fetch, new AbortController().signal));
    const data = await discoverDesktop(f.config, TOKEN, fetch, new AbortController().signal);
    assert.equal(data.version, 1); assert.deepEqual(data.tools, ['read_file']); assert.ok(!JSON.stringify(data).includes(TOKEN));
    assert.throws(() => companionURL('http://192.168.1.2:3000'));
    assert.throws(() => companionURL('https://user:pass@example.com'));
  } finally { await f.close(); }
});
test('actual HTTP delegation forwards approval, denial and completed receipts', async () => {
  let executed = 0;
  const f = await fixture({ capabilities: async () => ['fixture_write'], run: async (text, hooks) => {
    assert.equal(text, prompt);
    const allowed = await hooks.approve('fixture_write', 'Write the fixture file');
    if (!allowed) return 'Permission denied; no write performed.';
    executed++; hooks.event({ type: 'tool_result', name: 'fixture_write', detail: 'Actual action completed' }); return 'Completed the approved action.';
  } });
  try {
    const events = [];
    const declined = await desktopRun(prompt, f.config, TOKEN, fetch, new AbortController().signal, async () => false, event => events.push(event));
    assert.match(declined.reply, /denied/); assert.equal(executed, 0);
    const done = await desktopRun(prompt, f.config, TOKEN, fetch, new AbortController().signal, async () => true, event => events.push(event));
    assert.match(done.reply, /Completed/); assert.equal(executed, 1); assert.ok(events.some(event => event.type === 'tool_result'));
    const foreign = await fetch(`${f.config.baseUrl}/v1/ankita-companion/runs/${done.id}`, { headers: { authorization: 'Bearer wrong' } }); assert.equal(foreign.status, 401);
  } finally { await f.close(); }
});
test('Stop cancels a desktop run waiting for approval and rejects late approval', async () => {
  let approvalId, writes = 0;
  const f = await fixture({ capabilities: async () => ['fixture_write'], run: async (text, hooks) => {
    const ok = await hooks.approve('fixture_write', 'Never write after Stop'); if (ok && !hooks.signal.aborted) writes++; return 'Stopped';
  } });
  try {
    const controller = new AbortController();
    await assert.rejects(desktopRun(prompt, f.config, TOKEN, fetch, controller.signal, async request => { approvalId = request.id; controller.abort(); return true; }));
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(writes, 0); assert.ok(approvalId);
  } finally { await f.close(); }
});
test('desktop failures never return private runtime errors or a fake success', async () => {
  const f = await fixture({ capabilities: async () => [], run: async () => { throw new Error(TOKEN); } });
  try { await assert.rejects(desktopRun(prompt, f.config, TOKEN, fetch, new AbortController().signal, async () => true), error => !error.message.includes(TOKEN)); }
  finally { await f.close(); }
});

test('nested desktop receipts settle as cancelled when Stop interrupts an actual remote call', async () => {
  const f = await fixture({ capabilities: async () => ['fixture_wait'], run: async (text, hooks) => {
    hooks.event({ type: 'tool_call', name: 'fixture_wait', detail: '{}' });
    await new Promise(resolve => hooks.signal.addEventListener('abort', resolve, { once: true })); return 'Stopped';
  } });
  const state = { ...emptyAssistantState(), desktop: f.config }, controller = new AbortController(), receipts = []; let sequence = 0;
  const session = createPhoneToolSession({ store: { get: () => state, commit: async () => assert.fail('No phone mutation') }, clock: { id: () => `fixture-${++sequence}`, now: Date.now }, signal: controller.signal, user: { conversationId: 'fixture-chat', messageId: 'fixture-message', text: prompt }, approve: async () => true, desktopFetch: fetch, desktopKey: TOKEN, event: receipt => { receipts.push(receipt); if (receipt.name === 'fixture_wait' && receipt.status === 'running') controller.abort(); } });
  try {
    await assert.rejects(session.execute(N.desktopRun, { prompt }));
    const deadline = Date.now() + 1000; // Test-only settling deadline, not a production action budget.
    while (!receipts.some(receipt => receipt.name === 'fixture_wait' && receipt.status === 'cancelled') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(receipts.some(receipt => receipt.name === 'fixture_wait' && receipt.status === 'cancelled'));
  } finally { await f.close(); }
});

test('the installed desktop Agent executes an approved real file write through HTTP', async () => {
  const desktopRoot = process.env.ANKITA_DESKTOP_REPO || path.resolve('..', 'copilot-chat'); // Test discovery only; production requires explicit paths.
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ankita-companion-test-'));
  const requests = [];
  const provider = http.createServer((req, res) => {
    if (req.url.endsWith('/models')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: 'fixture-model' }] })); }
    const chunks = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks)); requests.push(body);
      const last = body.messages.at(-1);
      res.setHeader('content-type', 'text/event-stream');
      const delta = last.role === 'tool' ? { content: last.content.includes('denied') ? 'The desktop write was denied.' : 'The actual desktop file was written.' } : { tool_calls: [{ index: 0, id: 'desktop-fixture-write', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'actual.txt', content: 'Actual desktop runtime output' }) } }] };
      res.end(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const envFile = path.join(directory, 'fixture.env');
  await fs.writeFile(envFile, `PROVIDER=custom\nAPI_BASE=http://127.0.0.1:${provider.address().port}/v1\nMODEL=fixture-model\nMEMORY_CONSOLIDATION=off\n`);
  const runtime = await createDesktopRuntime({ desktopRoot, workspace: directory, configFile: envFile, environment: { ...process.env, CONFIG_DIR: path.join(directory, 'profile') } });
  const f = await fixture(runtime);
  try {
    const declined = await desktopRun('Write actual.txt', f.config, TOKEN, fetch, new AbortController().signal, async () => false);
    assert.match(declined.reply, /denied/); await assert.rejects(fs.access(path.join(directory, 'actual.txt')));
    let preview;
    const done = await desktopRun('Write actual.txt', f.config, TOKEN, fetch, new AbortController().signal, async request => { preview = request.arguments; return true; });
    assert.match(preview, /actual.txt/); assert.match(done.reply, /written/);
    assert.equal(await fs.readFile(path.join(directory, 'actual.txt'), 'utf8'), 'Actual desktop runtime output');
    assert.ok(requests.some(request => request.messages.some(message => message.role === 'tool')));
    console.log(`DESKTOP_RUNTIME_OK: actual Agent; denied write absent; approved file read back; ${requests.length} provider HTTP requests`);
  } finally { await f.close(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); }
});
