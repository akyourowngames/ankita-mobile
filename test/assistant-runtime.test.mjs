import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { agentLoop } from '../src/api/agentLoop.ts';
import { createPhoneToolSession } from '../src/assistant/tools.ts';
import { emptyAssistantState } from '../src/assistant/records.ts';
import { ASSISTANT_LIMITS as L, TOOL_NAMES as N } from '../src/assistant/config.ts';

const provider = { id: 'fixture', name: 'Fixture', kind: 'openai', baseUrl: 'https://example.test/v1', model: 'fixture-model', keyRequired: false };
const call = (id, name, args = {}) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const reply = calls => Response.json({ choices: [{ message: { tool_calls: calls } }] });
const done = () => Response.json({ choices: [{ message: { content: 'Finished using actual tools.' } }] });
const session = execute => ({ tools: async () => [{ type: 'function', function: { name: 'READ', description: 'Read fixture', parameters: { type: 'object' } } }], execute });
const deadline = () => AbortSignal.timeout(5000); // Milliseconds: bounded local fixture wait.

test('tool failures and unavailable calls each get a paired result, allowing model recovery', async () => {
  const bodies = []; let executed = 0;
  const result = await agentLoop(provider, '', [], '', async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    return bodies.length === 1 ? reply([call('first', 'UNKNOWN'), call('second', 'READ')]) : done();
  }, deadline(), () => {}, session(async () => { executed++; throw new Error('private provider credential'); }));
  assert.equal(result, 'Finished using actual tools.'); assert.equal(executed, 1);
  const results = bodies[1].messages.filter(message => message.role === 'tool');
  assert.deepEqual(results.map(message => message.tool_call_id), ['first', 'second']);
  assert.ok(results.every(message => JSON.parse(message.content).ok === false));
  assert.ok(!JSON.stringify(results).includes('private provider credential'));
});
test('identical reordered arguments stop tool repetition and force an honest tools-free summary', async () => {
  let requests = 0, executions = 0;
  const result = await agentLoop(provider, '', [], '', async (_url, options) => {
    const body = JSON.parse(options.body); requests++;
    if (!body.tools?.length) return done();
    return reply([call(`repeat-${requests}`, 'READ', requests % 2 ? { a: 1, b: 2 } : { b: 2, a: 1 })]);
  }, deadline(), () => {}, session(async () => { executions++; return '{"value":"real result"}'; }));
  assert.equal(result, 'Finished using actual tools.'); assert.equal(executions, L.identicalCalls); assert.equal(requests, L.identicalCalls + 2);
});
test('total call budget includes every rejected remainder without executing over budget', async () => {
  let requests = 0, executions = 0; const bodies = [];
  await agentLoop(provider, '', [], '', async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body); requests++;
    return requests === 1 ? reply(Array.from({ length: L.toolCalls + 2 }, (_, i) => call(`batch-${i}`, 'READ', { i }))) : done();
  }, deadline(), () => {}, session(async () => { executions++; return '{}'; }));
  assert.equal(executions, L.toolCalls);
  const results = bodies[1].messages.filter(message => message.role === 'tool');
  assert.equal(results.length, L.toolCalls + 2); assert.equal(JSON.parse(results.at(-1).content).error.code, 'execution_limit');
});
test('malformed duplicate IDs are rejected before any side effect', async () => {
  let executions = 0;
  await assert.rejects(agentLoop(provider, '', [], '', async () => reply([call('same', 'READ'), call('same', 'READ')]), deadline(), () => {}, session(async () => { executions++; return '{}'; })), /duplicate tool/i);
  assert.equal(executions, 0);
});
for (const kind of ['openai', 'anthropic']) test(`${kind}: real HTTP model calls a built-in memory tool without Composio and continues with its persisted result`, async t => {
  const bodies = []; let stored = emptyAssistantState(), sequence = 0;
  const server = http.createServer((req, res) => { const chunks = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => {
    bodies.push(JSON.parse(Buffer.concat(chunks))); res.setHeader('content-type', 'application/json');
    const args = { text: 'Prefers concise answers', category: 'preference', source_quote: 'I prefer concise answers' };
    res.end(JSON.stringify(bodies.length === 1 ? kind === 'openai' ? { choices: [{ message: { tool_calls: [call('memory-call', N.memorySave, args)] } }] } : { content: [{ type: 'tool_use', id: 'memory-call', name: N.memorySave, input: args }] } : kind === 'openai' ? { choices: [{ message: { content: 'Remembered with approval.' } }] } : { content: [{ type: 'text', text: 'Remembered with approval.' }] }));
  }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const signal = deadline(), receipts = [], tools = createPhoneToolSession({ store: { get: () => stored, commit: async change => { stored = change(stored); } }, clock: { id: () => `memory-${++sequence}`, now: Date.now }, signal, user: { conversationId: 'fixture-chat', messageId: 'fixture-user', text: 'Remember that I prefer concise answers.' }, approve: async () => true, event: receipt => receipts.push(receipt) });
  const actual = { ...provider, kind, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
  assert.equal(await agentLoop(actual, '', [{ role: 'user', content: 'Remember that I prefer concise answers.' }], '', fetch, signal, () => {}, tools), 'Remembered with approval.');
  assert.equal(stored.memories.length, 1); assert.equal(receipts.at(-1).status, 'succeeded');
  assert.match(JSON.stringify(bodies[1]), /Prefers concise answers/); assert.equal(bodies.length, 2);
});
