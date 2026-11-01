import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOutput } from '../src/assistant/outputs.ts';
import { writeOutput } from '../src/outputs/fileAdapter.ts';
import { deliverOutput } from '../src/outputs/delivery.web.ts';
const artifact=createOutput([],{title:'Real exported table',kind:'table',content:'{"columns":["A"],"rows":[["Actual value"]]}'},{id:()=> 'one',now:()=>1_000}).record;

test('export adapter writes a readable real file before opening the share port', async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ankita-output-'));
  try {
    let shared=false;
    const result=await writeOutput(artifact,'csv',{
      write:async file=>{const path=join(directory,file.filename);await writeFile(path,file.content,'utf8');return path;},
      share:async(uri,file)=>{assert.equal(await readFile(uri,'utf8'),'"A"\r\n"Actual value"');assert.equal(file.mimeType,'text/csv');shared=true;},
    },true);
    assert.equal(shared,true);assert.equal(result.shared,true);assert.match(result.filename,/\.csv$/);
    await assert.rejects(writeOutput(artifact,'csv',{write:async()=>{throw Error('disk full');},share:async()=>assert.fail('must not share missing files')},true),/disk full/);
    await assert.rejects(writeOutput(artifact,'csv',{write:async()=>''}),/could not be created/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('browser download creates the actual UTF-8 blob with the generated filename', async()=>{
  const originalDocument=globalThis.document, originalCreate=URL.createObjectURL, originalRevoke=URL.revokeObjectURL;
  let blob,clicked=false,removed=false;
  const anchor={click(){clicked=true;},remove(){removed=true;}};
  globalThis.document={createElement:tag=>{assert.equal(tag,'a');return anchor;},body:{appendChild:item=>assert.equal(item,anchor)}};
  URL.createObjectURL=value=>{blob=value;return 'blob:test';};URL.revokeObjectURL=()=>{};
  try {
    assert.match(await deliverOutput(artifact,'csv'),/Download started/);
    assert.equal(clicked,true);assert.equal(removed,true);assert.equal(anchor.download,'Real exported table.csv');
    assert.equal(await blob.text(),'"A"\r\n"Actual value"');assert.equal(blob.type,'text/csv;charset=utf-8');
    await assert.rejects(deliverOutput(artifact,'csv',true),/cannot share files/);
  } finally {globalThis.document=originalDocument;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;}
});
