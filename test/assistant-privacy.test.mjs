import test from 'node:test';
import assert from 'node:assert/strict';
import { exportAssistantRecords } from '../src/assistant/privacy.ts';
import { emptyAssistantState, saveLibraryItem } from '../src/assistant/records.ts';
test('assistant export includes actual records and excludes configured credentials and connection config', () => {
  const state = saveLibraryItem(emptyAssistantState(), { title: 'Personal note', content: 'A note with known-private-key', kind: 'note' }, { id: () => 'note', now: () => 100 }).state;
  state.desktop = { enabled: true, baseUrl: 'https://desktop.example.com' };
  const output = exportAssistantRecords(state, ['known-private-key'], 100), data = JSON.parse(output);
  assert.match(data.records.library[0].content, /redacted/); assert.doesNotMatch(output, /known-private-key|desktop\.example\.com/); assert.equal(data.records.library[0].title, 'Personal note'); assert.equal(data.version, 1);
});
