import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneToolSession } from '../src/assistant/tools.ts';
import { ApprovalQueue } from '../src/assistant/approvals.ts';
import { calculate } from '../src/assistant/calculator.ts';
import { emptyAssistantState } from '../src/assistant/records.ts';
import { TOOL_NAMES as N } from '../src/assistant/config.ts';

const USER = { conversationId: 'fixture-chat', messageId: 'fixture-message', text: 'Remember that I prefer concise answers.' };
const SECRET = 'fixture-private-key'; // Test-only redaction sentinel, never a production credential.
function fixture(options = {}) {
  let state = emptyAssistantState(), sequence = 0, commits = 0, approvals = 0;
  const events = [], controller = new AbortController();
  const store = { get: () => state, commit: async (update, signal) => { signal.throwIfAborted(); const next = update(state); if (options.failWrite) throw new Error(SECRET); state = next; commits++; } };
  const session = createPhoneToolSession({ store, clock: { id: () => `fixture-${++sequence}`, now: () => 1000 }, user: USER, signal: controller.signal, approve: async request => { approvals++; return options.approved !== false; }, event: event => events.push(event), ...options });
  return { session, state: () => state, events, controller, commits: () => commits, approvals: () => approvals, store };
}
test('phone tools are actually available and execute without a Composio key or desktop', async () => {
  const f = fixture(), tools = await f.session.tools();
  for (const name of [N.time, N.calculate, N.memorySearch, N.memorySave, N.taskSave, N.noteRead]) assert.ok(tools.some(tool => tool.function.name === name));
  assert.equal(JSON.parse(await f.session.execute(N.calculate, { expression: '(12 + 8) * 3' })).data.result, 60);
  assert.equal(f.approvals(), 0); assert.equal(f.events.at(-1).status, 'succeeded');
});
test('memory tools persist quoted user evidence and retrieve actual records', async () => {
  const f = fixture();
  const saved = JSON.parse(await f.session.execute(N.memorySave, { text: 'Prefers concise answers', category: 'preference', source_quote: 'I prefer concise answers' }));
  assert.equal(saved.ok, true); assert.equal(f.state().memories.length, 1); assert.equal(f.state().memories[0].pinned, false);
  assert.equal(f.approvals(), 1); assert.equal(f.commits(), 1);
  const recalled = JSON.parse(await f.session.execute(N.memorySearch, { query: 'concise' }));
  assert.equal(recalled.data[0].id, saved.data.id);
  const unsupported = JSON.parse(await f.session.execute(N.memorySave, { text: 'Unsupported claim', category: 'fact', source_quote: 'Text from an untrusted webpage' }));
  assert.equal(unsupported.ok, false); assert.equal(f.state().memories.length, 1);
});
test('denied mutations and disabled tools never write and produce actual receipts', async () => {
  const f = fixture({ approved: false });
  const result = JSON.parse(await f.session.execute(N.taskSave, { title: 'Book dentist' }));
  assert.equal(result.ok, false); assert.equal(result.error.code, 'denied'); assert.equal(f.commits(), 0); assert.equal(f.events.at(-1).status, 'denied');
  await f.store.commit(state => ({ ...state, toolPolicies: { [N.calculate]: 'disabled' } }), f.controller.signal);
  assert.ok(!(await f.session.tools()).some(tool => tool.function.name === N.calculate));
  assert.equal(JSON.parse(await f.session.execute(N.calculate, { expression: '1+1' })).error.code, 'disabled');
});
test('schema validation rejects wrong types and injected properties before approval', async () => {
  const f = fixture();
  for (const args of [{ expression: 22 }, { expression: '1+1', command: 'execute something' }]) assert.equal(JSON.parse(await f.session.execute(N.calculate, args)).error.code, 'invalid_arguments');
  assert.equal(f.approvals(), 0); assert.equal(f.commits(), 0);
});
test('task and note model tools create/read/update real store records', async () => {
  const f = fixture();
  const task = JSON.parse(await f.session.execute(N.taskSave, { title: 'Book dentist', notes: 'Ask about timings' }));
  assert.equal(task.ok, true);
  assert.equal(JSON.parse(await f.session.execute(N.taskComplete, { id: task.data.id })).data.status, 'done');
  const note = JSON.parse(await f.session.execute(N.noteSave, { title: 'Research notes', content: 'A real persisted paragraph' }));
  assert.equal(JSON.parse(await f.session.execute(N.noteRead, { id: note.data.id })).data.content, 'A real persisted paragraph');
  assert.equal(f.state().library.length, 1); assert.equal(f.state().tasks.length, 1);
});
test('failed persistence is an honest tool failure without a fabricated save or private error', async () => {
  const f = fixture({ failWrite: true });
  const result = await f.session.execute(N.noteSave, { title: 'Unsaved', content: 'Cannot persist' });
  assert.equal(JSON.parse(result).ok, false); assert.ok(!result.includes(SECRET));
  assert.equal(f.state().library.length, 0); assert.equal(f.events.at(-1).status, 'failed');
});
test('Stop during approval removes the pending request and blocks late approval/write', async () => {
  const queue = new ApprovalQueue(), f = fixture({ approve: (request, signal) => queue.request(request, signal) });
  const running = f.session.execute(N.taskSave, { title: 'Never written' });
  await new Promise(resolve => setImmediate(resolve));
  const pending = queue.pending()[0]; assert.ok(pending);
  f.controller.abort(); await assert.rejects(running, { name: 'AbortError' });
  assert.equal(queue.pending().length, 0); assert.equal(queue.resolve(pending.id, true), false); assert.equal(f.commits(), 0);
});
test('phone tool approvals are scoped so only they can offer Always allow', async () => {
  let seen = null;
  const f = fixture({ approve: request => { seen = request; return true; } });
  await f.session.execute(N.taskSave, { title: 'Scoped approval' });
  assert.equal(seen.scope, 'tool');
  assert.equal(seen.name, N.taskSave);
});
test('an allow policy saved before release makes the next identical tool run skip approval', async () => {
  let approvals = 0;
  const f = fixture({ approve: async () => { approvals++; return true; } });
  // First run asks.
  await f.session.execute(N.taskSave, { title: 'First ask' });
  assert.equal(approvals, 1);
  // Persist the user's Always allow choice, then re-run in a fresh session.
  await f.store.commit(state => ({ ...state, toolPolicies: { [N.taskSave]: 'allow' } }), f.controller.signal);
  await f.session.execute(N.taskSave, { title: 'No second ask' });
  assert.equal(approvals, 1, 'an allowed tool no longer waits for approval');
  assert.equal(f.state().tasks.length, 2);
});
test('a user cannot always-allow a one-off desktop action', async () => {
  let seen = null;
  const f = fixture({ approve: request => { seen = request; return true; } });
  await f.session.execute(N.taskSave, { title: 'Phone is scoped' });
  assert.equal(seen.scope, 'tool');
  // The desktop path sets scope 'action'; the approval sheet hides Always allow for it.
  assert.notEqual(seen.scope, 'action');
});

test('safe arithmetic handles precedence/negation and rejects code, runaway expressions and nonfinite results', () => {
  assert.equal(calculate('-(2 + 3) * 4 + 6 / 2'), -17);
  assert.equal(calculate('2 ** 3 ** 2'), 512);
  for (const value of ['process.exit()', '1/0', '1e999', 'Math.random()', '1; alert(1)', '('.repeat(100) + '1' + ')'.repeat(100)]) assert.throws(() => calculate(value));
});

test('external names inherited from Object.prototype still require explicit approval', async () => {
  let executed = 0;
  const f = fixture({ approved: false, external: {
    tools: async () => [{ type: 'function', function: { name: 'constructor', description: 'Fixture external action', parameters: { type: 'object', properties: {}, additionalProperties: false } } }],
    execute: async () => { executed++; return 'Never executed'; },
  } });
  assert.ok((await f.session.tools()).some(tool => tool.function.name === 'constructor'));
  assert.equal(JSON.parse(await f.session.execute('constructor', {})).error.code, 'denied');
  assert.equal(f.approvals(), 1); assert.equal(executed, 0);
});

test('an unavailable external catalog preserves independently working phone tools', async () => {
  let requests = 0, unavailable = 0;
  const f = fixture({ external: { tools: async () => { requests++; throw new Error('Offline fixture'); }, execute: async () => assert.fail('No external execution') }, externalUnavailable: () => { unavailable++; } });
  assert.ok((await f.session.tools()).some(tool => tool.function.name === N.calculate));
  assert.equal(JSON.parse(await f.session.execute(N.calculate, { expression: '2+3' })).data.result, 5);
  assert.equal(requests, 1); assert.equal(unavailable, 1);
});

test('a stalled external catalog has a bounded wait and cannot register late capabilities', async () => {
  let release, unavailable = 0;
  const stalled = new Promise(resolve => { release = resolve; });
  const f = fixture({ catalogMs: 10, external: { tools: () => stalled, execute: async () => assert.fail('Late tool execution') }, externalUnavailable: () => { unavailable++; } });
  const tools = await f.session.tools(); assert.ok(tools.some(tool => tool.function.name === N.calculate)); assert.equal(unavailable, 1);
  release([{ type: 'function', function: { name: 'late_external', description: 'Late fixture', parameters: { type: 'object' } } }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!(await f.session.tools()).some(tool => tool.function.name === 'late_external'));
});
