import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, newConversation } from '../src/core/state.ts';
import { applyWorkResult } from '../src/work/delivery.ts';
import { restoreWorkState } from '../src/work/records.ts';

test('reply, editable outputs and one notice reconcile idempotently; deleted chats stay deleted', () => {
  const state = initialState(), now = Date.now();
  state.conversations = [{ ...newConversation('chat'), messages: [{ id: 'reply', role: 'assistant', status: 'complete', content: '', workId: 'job' }] }];
  state.work.jobs = [{ id: 'job', title: 'Plan', status: 'running', progress: '', reply: '', error: '', artifacts: [], createdAt: now, updatedAt: now, request: {}, conversationId: 'chat', messageId: 'reply', teammateId: 'chief', submitted: true, delivered: false }];
  const result = { id: 'job', title: 'Plan', status: 'completed', progress: 'Finished', reply: 'Real result', error: '', artifacts: [{ id: 'output-job', kind: 'document', title: 'Plan', content: 'Original', createdAt: now, updatedAt: now }], createdAt: now, updatedAt: now };
  let delivered = applyWorkResult(state, 'job', result);
  assert.equal(delivered.conversations[0].messages[0].content, 'Real result');
  delivered.assistant.artifacts[0].content = 'User edit';
  delivered = applyWorkResult(delivered, 'job', result);
  assert.equal(delivered.assistant.artifacts.length, 1); assert.equal(delivered.assistant.artifacts[0].content, 'User edit'); assert.equal(delivered.work.notices.length, 1);
  assert.equal(applyWorkResult({ ...state, conversations: [] }, 'job', result).conversations.length, 0);
});
test('old data migrates work metadata and corrupt/private request fields fail instead of persisting secrets', () => {
  const state = restoreWorkState(undefined); assert.equal(state.jobs.length, 0);
  assert.throws(() => restoreWorkState({ ...state, notices: [{ id: 'bad' }] }), /could not be read/);
  assert.throws(() => restoreWorkState({ ...state, connection: { ...state.connection, key: 'private-pairing' } }), /could not be read/);
  assert.throws(() => restoreWorkState({ ...state, notifications: { ...state.notifications, token: 'private-push' } }), /could not be read/);
  const pending = { ...state, notifications: { ...state.notifications, revokePending: true } };
  assert.equal(restoreWorkState(pending).notifications.revokePending, true);
});
