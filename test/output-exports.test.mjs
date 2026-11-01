import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutput } from '../src/assistant/outputs.ts';
import { exportOutput, outputFormats } from '../src/outputs/formats.ts';
const clock = {id:()=> 'file',now:()=>1_000};
const artifact = (kind,content,title='Export') => createOutput([],{kind,content:typeof content==='string'?content:JSON.stringify(content),title},clock).record;

test('HTML exports escape executable markup, include CSP and use safe fixed extensions', () => {
  const file = exportOutput(artifact('document','<script>alert(1)</script><img src="https://tracking.invalid">','../../evil.exe'),'html');
  assert.equal(file.mimeType,'text/html'); assert.match(file.filename,/\.html$/); assert.ok(!/[\\/]/.test(file.filename));
  assert.ok(!file.content.includes('<script>')); assert.ok(!file.content.includes('<img'));
  assert.match(file.content,/&lt;script&gt;/); assert.match(file.content,/default-src 'none'/);
  assert.ok(!outputFormats(artifact('document','Hi')).includes('pdf'));
  assert.throws(()=>exportOutput(artifact('document','Hi'),'csv'));
});

test('CSV exports quote delimiters/newlines and neutralize spreadsheet formula injection', () => {
  const file=exportOutput(artifact('table',{columns:['Name','Value'],rows:[['A,"B"\nC','=HYPERLINK("https://evil")'],['normal',' \t+1']]}),'csv');
  assert.match(file.content,/"A,""B""\nC"/);
  assert.ok(file.content.includes('"\'=HYPERLINK(""https://evil"")"'));
  assert.ok(file.content.includes('"\' \t+1"'));
  assert.equal(file.mimeType,'text/csv');
});

test('ICS exports escape line injection, use UTC dates and fold UTF-8 lines safely', () => {
  const file=exportOutput(artifact('calendar',{events:[{title:'Meet\nBEGIN:VEVENT,\\;',start:'2026-10-26T12:00:00+05:30',description:'é'.repeat(120)}]}),'ics');
  assert.ok(file.content.includes('DTSTART:20261026T063000Z'));
  assert.ok(file.content.includes('SUMMARY:Meet\\nBEGIN:VEVENT\\,\\\\\\;'));
  assert.equal(file.content.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,1);
  for(const line of file.content.split('\r\n')) assert.ok(new TextEncoder().encode(line).length<=75);
  assert.ok(!file.content.includes('\ufffd'));
});

test('JSON, checklist and text exports contain actual edited data', () => {
  const data={nested:{real:true},text:'<b>safe</b>'};
  assert.deepEqual(JSON.parse(exportOutput(artifact('json',data),'json').content),data);
  assert.match(exportOutput(artifact('checklist',{items:[{text:'Done',checked:true},{text:'Next',checked:false}]}),'md').content,/\[x\] Done\n- \[ \] Next/);
  assert.equal(exportOutput(artifact('document','Hello'),'txt').content,'Hello');
});
