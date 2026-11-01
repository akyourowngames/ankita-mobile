import test from 'node:test';
import assert from 'node:assert/strict';
import { followTranscript } from '../src/core/transcriptScroll.ts';

const SLOP = 60; // dp: fixture bottom-follow tolerance, independent of UI tokens.
test('restoring variable-height rows keeps following while estimates grow', () => {
  // Captured live failure: 240 saved messages, only early rows mounted.
  assert.equal(followTranscript(true, 3000, { offset: 3848, viewport: 376, content: 5453 }, SLOP), true);
  assert.equal(followTranscript(true, 3848, { offset: 5200, viewport: 376, content: 7000 }, SLOP), true);
});
test('reading older replies pauses following until the user returns to the bottom', () => {
  assert.equal(followTranscript(true, 6000, { offset: 5400, viewport: 376, content: 6376 }, SLOP), false);
  assert.equal(followTranscript(false, 5400, { offset: 5600, viewport: 376, content: 6376 }, SLOP), false);
  assert.equal(followTranscript(false, 5600, { offset: 6000, viewport: 376, content: 6376 }, SLOP), true);
});
