import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeActivity } from '../src/core/activitySummary.ts';

const receipt = (id, status, title = id) => ({ id, status, title, name: 'tool', arguments: '{}', result: '', startedAt: 1 });

test('no receipts means no activity summary', () => {
  assert.equal(summarizeActivity([]), null);
});

test('completed receipt counts describe actions without inventing sources', () => {
  const result = summarizeActivity([receipt('one', 'succeeded'), receipt('two', 'succeeded')]);
  assert.equal(result.label, '2 actions completed');
  assert.equal(result.count, 2);
  assert.equal(result.attention, false);
});

test('latest active action remains visible when a newer action already finished', () => {
  const receipts = [receipt('approval', 'waiting', 'Send message'), receipt('running', 'running', 'Read page'), receipt('done', 'succeeded')];
  const result = summarizeActivity(receipts);
  assert.equal(result.latest.id, 'running');
  assert.equal(result.label, '3 actions · In progress: Read page · 1 waiting for approval');
  assert.equal(result.attention, true);
  assert.deepEqual(receipts.map(item => item.id), ['approval', 'running', 'done']);
});

test('an earlier failed action stays discoverable after a successful action', () => {
  const result = summarizeActivity([receipt('failed', 'failed'), receipt('done', 'succeeded', 'Read file')]);
  assert.equal(result.label, '2 actions · Completed: Read file · 1 could not complete');
  assert.equal(result.attention, true);
});

test('single pending and failed actions retain their actual title and status', () => {
  assert.equal(summarizeActivity([receipt('one', 'waiting', 'Save file')]).label, 'Waiting for approval: Save file');
  assert.equal(summarizeActivity([receipt('one', 'failed', 'Save file')]).label, 'Could not complete: Save file');
});

test('declined and stopped actions are never summarized as completed', () => {
  assert.equal(summarizeActivity([receipt('one', 'denied', 'Save file')]).label, 'Declined: Save file');
  assert.equal(summarizeActivity([receipt('one', 'cancelled', 'Save file')]).label, 'Stopped: Save file');
});
