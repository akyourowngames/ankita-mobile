import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { initialState, restoreState, exportConversation, newConversation, withoutProvider, teammateOwnsChat } from '../src/core/state.ts';
import { assistantPrompt } from '../src/core/assistant.ts';
import { agentLoop } from '../src/api/agentLoop.ts';
import { LEGACY_DEFAULT_SYSTEM_PROMPT } from '../src/constants/appConfig.ts';
import { ASSISTANT_LIMITS } from '../src/assistant/config.ts';
test('teammates, model cache and app settings survive restoration while key fields do not', () => {
  const state = initialState();
  state.providers.push({ id: 'provider', name: 'Test', kind: 'openai', model: 'selected', baseUrl: 'https://example.test/v1', keyRequired: true, models: ['selected', 'other'], modelsUpdatedAt: Date.now() });
  state.teammates.push({ id: 'writer', name: 'Writer', description: 'Writing partner', instructions: 'Use short sentences', providerId: 'provider', model: 'other' });
  state.activeTeammateId = 'writer'; state.settings.systemPrompt = 'Use British spelling';
  const restored = restoreState(JSON.stringify(state));
  assert.deepEqual(restored.teammates, state.teammates); assert.deepEqual(restored.providers[0].models, ['selected', 'other']);
  const prompt = assistantPrompt(restored.settings, restored.teammates[1]);
  assert.match(prompt, /You are Writer/); assert.match(prompt, /British spelling/); assert.match(prompt, /short sentences/);
  const legacy = { ...state }; delete legacy.teammates; delete legacy.activeTeammateId; delete legacy.integrations;
  assert.equal(restoreState(JSON.stringify(legacy)).teammates[0].name, 'Chief');
  const chat = newConversation(); chat.messages = [{ role: 'assistant', content: 'Reply', status: 'complete' }];
  assert.match(exportConversation(chat, 'Writer'), /Writer\nReply/);
  state.providers[0].modelsUpdatedAt = 'invalid';
  assert.throws(() => restoreState(JSON.stringify(state)), /could not be read/);
});

const toolReply = name => Response.json({ choices: [{ message: { tool_calls: [{ id: 'fixture-call', function: { name, arguments: '{}' } }] } }] });
const fixtureProvider = { id: 'test', name: 'Test', kind: 'openai', baseUrl: 'https://example.test/v1', model: 'fixture', keyRequired: false };
test('provider removal clears teammate bindings and preserves a surviving provider', () => {
  const state = initialState(); state.providers = [fixtureProvider, { ...fixtureProvider, id: 'other' }]; state.activeProviderId = fixtureProvider.id;
  state.teammates[0].providerId = fixtureProvider.id; state.teammates[0].model = 'override';
  const next = withoutProvider(state, fixtureProvider.id);
  assert.equal(next.activeProviderId, 'other'); assert.equal(next.teammates[0].providerId, null); assert.equal(next.teammates[0].model, '');
  assert.equal(state.providers.length, 2); assert.equal(state.teammates[0].providerId, fixtureProvider.id);
});
test('teammate ownership distinguishes unrelated active chats during deletion', () => {
  const state = initialState(); const chat = { ...newConversation(), teammateId: 'research' }; state.conversations = [chat];
  assert.equal(teammateOwnsChat(state, 'research', chat.id), true);
  assert.equal(teammateOwnsChat(state, 'other', chat.id), false);
  assert.equal(teammateOwnsChat(state, 'research', null), false);
});
test('default and legacy instructions do not override a custom teammate identity', () => {
  const state = initialState(), teammate = { ...state.teammates[0], name: 'Research desk' };
  assert.match(assistantPrompt(state.settings, teammate), /You are Research desk/);
  assert.doesNotMatch(assistantPrompt(state.settings, teammate), /You are Chief/);
  state.settings.systemPrompt = LEGACY_DEFAULT_SYSTEM_PROMPT;
  assert.doesNotMatch(assistantPrompt(state.settings, teammate), /You are Chief/);
  state.settings.systemPrompt = 'Custom user instructions';
  assert.match(assistantPrompt(state.settings, teammate), /Custom user instructions/);
});
const fixtureSession = execute => ({ tools: async () => [{ type: 'function', function: { name: 'READ', parameters: { type: 'object' } } }], execute });
test('agent pairs unavailable tools without executing and bounds repeated calls', async () => {
  let calls = 0, requests = 0;
  await agentLoop(fixtureProvider, '', [], '', async () => ++requests === 1 ? toolReply('UNKNOWN') : Response.json({ choices: [{ message: { content: 'Unavailable.' } }] }), AbortSignal.timeout(5000), () => {}, fixtureSession(async () => { calls++; return '{}'; }));
  assert.equal(calls, 0);
  await assert.rejects(agentLoop(fixtureProvider, '', [], '', async () => toolReply('READ'), AbortSignal.timeout(5000), () => {}, fixtureSession(async () => { calls++; return '{}'; })), /execution limit/);
  assert.equal(calls, ASSISTANT_LIMITS.identicalCalls);
});
test('Stop settles an unresponsive tool and cannot send another model request', async () => {
  const controller = new AbortController(); let requests = 0;
  const running = agentLoop(fixtureProvider, '', [], '', async () => { requests++; return toolReply('READ'); }, controller.signal, () => {}, fixtureSession(async () => { controller.abort(); return new Promise(() => {}); }));
  await assert.rejects(running, { name: 'AbortError' }); assert.equal(requests, 1);
});
test('rate limits produce a safe message without retrying the provider', async () => {
  let requests = 0;
  await assert.rejects(agentLoop(fixtureProvider, '', [], '', async () => { requests++; return new Response('private-account-details', { status: 429 }); }, AbortSignal.timeout(5000), () => {}), error => error.code === 'rate_limit' && error.status === 429 && !error.message.includes('private-account-details'));
  assert.equal(requests, 1);
});
for (const kind of ['openai', 'anthropic']) test(`${kind} real HTTP round trip sends personal/teammate instructions, executes a tool and continues with its result`, async t => {
  const bodies = []; let executed = 0;
  const server = http.createServer((req, res) => { const chunks = []; req.on('data', part => chunks.push(part)); req.on('end', () => {
    bodies.push(JSON.parse(Buffer.concat(chunks))); res.setHeader('content-type', 'text/event-stream');
    if (bodies.length === 1) res.end(kind === 'openai' ? 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_fixture","function":{"name":"FETCH_DATA","arguments":"{\\"query\\":\\"hello\\"}"}}]}}]}\n\ndata: [DONE]\n\n' : 'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_fixture","name":"FETCH_DATA","input":{}}}\n\ndata: {"type":"content_block_delta","index":0,"delta":{"partial_json":"{\\"query\\":\\"hello\\"}"}}\n\ndata: {"type":"message_stop"}\n\n');
    else res.end(kind === 'openai' ? 'data: {"choices":[{"delta":{"content":"Tool finished."}}]}\n\ndata: [DONE]\n\n' : 'data: {"type":"content_block_delta","delta":{"text":"Tool finished."}}\n\ndata: {"type":"message_stop"}\n\n');
  }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const state = initialState(); state.settings.systemPrompt = 'Personal instruction fixture';
  const teammate = { id: 'research', name: 'Research desk', description: 'Research', instructions: 'Teammate instruction fixture', providerId: null, model: '' };
  const provider = { id: 'fixture', name: 'Fixture', kind, baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture-model', keyRequired: false };
  const chunks = [], session = { tools: async () => [{ type: 'function', function: { name: 'FETCH_DATA', description: 'Read fixture', parameters: { type: 'object', properties: { query: { type: 'string' } } } } }], execute: async (name, args) => { assert.equal(name, 'FETCH_DATA'); assert.deepEqual(args, { query: 'hello' }); executed++; return '{"found":"fixture-result"}'; } };
  assert.equal(await agentLoop(provider, '', [{ role: 'user', content: 'Read data' }], assistantPrompt(state.settings, teammate), fetch, AbortSignal.timeout(5000), delta => chunks.push(delta), session), 'Tool finished.');
  assert.equal(executed, 1); assert.equal(bodies.length, 2); assert.equal(chunks.join(''), 'Tool finished.');
  const system = kind === 'openai' ? bodies[0].messages[0].content : bodies[0].system;
  assert.match(system, /Personal instruction fixture/); assert.match(system, /Teammate instruction fixture/); assert.match(JSON.stringify(bodies[1].messages), /fixture-result/); assert.ok(bodies[0].tools.length);
});
