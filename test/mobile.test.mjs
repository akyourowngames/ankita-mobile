import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/core/state.ts').catch(() => ({}));
const protocol = await import('../src/api/protocol.ts').catch(() => ({}));

test('conversation updates are scoped; switching chats cannot redirect streamed text', () => {
  assert.equal(typeof core.updateMessage, 'function', 'scoped message updates are missing');
  const a = core.newConversation('a'), b = core.newConversation('b');
  a.messages.push({ id: 'reply', role: 'assistant', content: '', status: 'streaming' });
  const next = core.updateMessage([a, b], 'a', 'reply', { content: 'Hello', status: 'complete' });
  assert.equal(next[0].messages[0].content, 'Hello');
  assert.equal(next[1].messages.length, 0);
  assert.equal(a.messages[0].content, '');
});

test('restoring state validates records and marks interrupted responses stopped', () => {
  assert.equal(typeof core.restoreState, 'function', 'state restoration is missing');
  const saved = { ...core.initialState(), onboardingDone: true, conversations: [{ ...core.newConversation('a'), messages: [{ id: 'm', role: 'assistant', content: 'partial', status: 'streaming' }] }] };
  const restored = core.restoreState(JSON.stringify(saved));
  assert.equal(restored.conversations[0].messages[0].status, 'stopped');
  assert.throws(() => core.restoreState('{bad'), /saved data/i);
  assert.throws(() => core.restoreState(JSON.stringify({ ...saved, providers: [{ id: 'p', apiKey: 'must-not-load' }] })), /saved data/i);
});

test('provider URL validation allows intentional local services, rejects embedded credentials and unsafe schemes', () => {
  assert.equal(typeof protocol.normalizeEndpoint, 'function', 'endpoint validation is missing');
  assert.equal(protocol.normalizeEndpoint('https://example.com/v1/'), 'https://example.com/v1');
  assert.equal(protocol.normalizeEndpoint('http://192.168.1.4:11434/v1'), 'http://192.168.1.4:11434/v1');
  for (const value of ['ftp://example.com', 'https://user:pass@example.com', 'https://example.com/?key=secret', 'https://example.com/#key']) assert.throws(() => protocol.normalizeEndpoint(value));
});

test('SSE parser handles split UTF-8 text, CRLF, multiline data and completion', () => {
  assert.equal(typeof protocol.createEventParser, 'function', 'stream parser is missing');
  const events = [], parser = protocol.createEventParser(e => events.push(e));
  parser.push('data: {"choices":[{"delta":{"content":"H');
  parser.push('éllo"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  parser.finish();
  assert.equal(events[0].choices[0].delta.content, 'Héllo');
  assert.equal(events[1], '[DONE]');
  const multi = [], another = protocol.createEventParser(e => multi.push(e));
  another.push('event: content_block_delta\ndata: {"delta":\ndata: {"text":"yes"}}\n\n');
  assert.equal(multi[0].delta.text, 'yes');
});

test('request payload respects provider protocol and never exports keys with chat data', () => {
  assert.equal(typeof protocol.buildRequest, 'function', 'provider requests are missing');
  const provider = { id: 'p', name: 'Test', kind: 'anthropic', baseUrl: 'https://example.com/v1', model: 'chosen-model', keyRequired: true };
  const req = protocol.buildRequest(provider, 'fixture-secret', [{ role: 'user', content: 'Hi' }], 'Be concise');
  assert.equal(req.url, 'https://example.com/v1/messages');
  assert.equal(req.headers['x-api-key'], 'fixture-secret');
  assert.equal(req.body.system, 'Be concise');
  assert.equal(JSON.stringify(req.body).includes('fixture-secret'), false);
  const chat = { ...core.newConversation('c'), messages: [{ id: 'm', role: 'user', content: 'Hi', status: 'complete' }] };
  const output = core.exportConversation(chat);
  assert.match(output, /Hi/);
  assert.doesNotMatch(output, /apiKey|fixture-secret/);
});
