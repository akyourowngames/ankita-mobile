import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutput, editOutput, deleteOutput, restoreOutputs, OUTPUT_LIMITS, createOutputCapability } from '../src/assistant/outputs.ts';
const clock = { id: () => 'generated-id', now: () => 1_000 };
const input = { id: 'work:1:result', title: 'Plan', kind: 'document', content: '# Hello' };

test('outputs persist real contents, preserve edits during replay and delete immutably', () => {
  const created = createOutput([], input, clock);
  const edited = editOutput(created.artifacts, created.record.id, { title: 'Edited', content: 'Changed' }, { ...clock, now: () => 2_000 });
  const replay = createOutput(edited.artifacts, input, clock);
  assert.equal(replay.record.content, 'Changed');
  assert.equal(replay.record.updatedAt, 2_000);
  assert.equal(replay.artifacts.length, 1);
  assert.equal(created.record.content, '# Hello');
  assert.deepEqual(restoreOutputs(JSON.parse(JSON.stringify(edited.artifacts))), edited.artifacts);
  assert.deepEqual(deleteOutput(edited.artifacts, input.id), []);
  assert.equal(edited.artifacts.length, 1);
});

test('invalid records, structured formats and unbounded restores fail explicitly', () => {
  for (const patch of [{title:''}, {id:'../escape'}, {kind:'pdf'}, {content:'\0'}, {content:'x'.repeat(OUTPUT_LIMITS.contentChars + 1)}]) assert.throws(() => createOutput([], {...input,...patch},clock));
  assert.throws(() => createOutput([], {...input,kind:'table',content:'{"columns":["A"],"rows":[["one","extra"]]}'},clock));
  assert.throws(() => createOutput([], {...input,kind:'checklist',content:'{"items":[{"text":"One","checked":"yes"}]}'},clock));
  assert.throws(() => createOutput([], {...input,kind:'calendar',content:'{"events":[{"title":"One","start":"tomorrow"}]}'},clock));
  assert.throws(() => createOutput([], {...input,kind:'calendar',content:'{"events":[{"title":"One","start":"2026-02-30T09:00:00Z"}]}'},clock));
  assert.throws(() => createOutput([],input,{...clock,now:()=>1e100}));
  assert.throws(() => restoreOutputs([{...createOutput([], input,clock).record,updatedAt:NaN}]));
  const record = createOutput([],input,clock).record;
  assert.throws(() => restoreOutputs([record,record]), /duplicate/i);
  assert.throws(() => editOutput([], 'missing', {content:'x'},clock), /found/i);
  assert.deepEqual(restoreOutputs(undefined), []);
});

test('output capability waits for persistence, returns record identity and honors cancellation', async () => {
  let state = { artifacts: [] }, saves = 0;
  const controller = new AbortController();
  const capability = createOutputCapability({store:{get:()=>state,commit:async(update,signal)=>{signal.throwIfAborted();state=update(state);saves++;}},clock,signal:controller.signal,source:{conversationId:'chat'}});
  assert.equal(capability.definition.function.name, 'output_create');
  const result = await capability.run(input);
  assert.equal(result.id,input.id); assert.equal(saves,1); assert.equal(state.artifacts[0].source.conversationId,'chat');
  await capability.run(input); assert.equal(state.artifacts.length,1);
  controller.abort(); await assert.rejects(capability.run({...input,id:'other'}));
});
