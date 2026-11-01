import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationSections } from '../src/core/history.ts';
test('library groups actual local dates, pinned records and full-message search without mutating history', () => {
  const now = new Date(2026, 8, 27, 10), earlier = new Date(2026, 8, 26, 23);
  const chat = (id, at, pinned = false) => ({ id, title: id, updatedAt: +at, pinned, messages: [{ content: 'find this message' }] });
  const chats = [chat('yesterday', earlier), chat('today', now), chat('keep', earlier, true)];
  assert.deepEqual(conversationSections(chats, '', false, now).map(s => s.title), ['Pinned', 'Today', 'Yesterday']);
  assert.equal(conversationSections(chats, 'message', true, now)[0].data[0].id, 'keep');
  assert.equal(conversationSections(chats, 'absent', false, now).length, 0);
  assert.equal(chats[0].id, 'yesterday');
});
