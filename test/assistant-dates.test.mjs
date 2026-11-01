import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateField, localDateInstant } from '../src/assistant/dates.ts';
test('local date picker round trip preserves local time and optional empty values', () => {
  const date = new Date(2026, 9, 6, 15, 30).getTime();
  assert.equal(localDateInstant(localDateField(date)), date); assert.equal(localDateField(null), ''); assert.equal(localDateInstant(''), null); assert.throws(() => localDateInstant('invalid'));
});
