import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {serializeInputs} from '../lib/core.mjs';
const all=JSON.parse(fs.readFileSync(new URL('../content/input-schemas.json',import.meta.url))).questions;
const bank=JSON.parse(fs.readFileSync(new URL('../questions.seed.json',import.meta.url)));
for (const lang of ['PY','JA']) for(const task of ['3A','3B']) {
 const id=`PB-${lang}-${task}`, schema=all[id];
 test(`${id} serializes valid and conditional retry correctly`,()=>{
  assert.ok(schema && schema.length===5);
  const base={input1:'10',input2:'20',input3:'25',input4:'5',input5:'24'};
  const valid=serializeInputs(schema,base);
  assert.equal(valid.stdin,'10\n20\n5\n24\n');
  assert.ok(!('input3' in valid.values));
  const retry=serializeInputs(schema,{...base,input2:'9'});
  assert.equal(retry.stdin,'10\n9\n25\n5\n24\n');
  assert.throws(()=>serializeInputs(schema,{...base,input2:'9',input3:''}));
  assert.throws(()=>serializeInputs(schema,{...base,input2:'9',input3:'not a number'}));
 });
}
test('all 36 matched question records exist with 3 modes per language and family',()=>{
 const q=bank.filter(x=>/^PB-(PY|JA)-[1-6][ABC]$/.test(x.id));
 assert.equal(q.length,36);
 for(const lang of ['PY','JA']) for(let n=1;n<=6;n++) {
  const triad=q.filter(x=>x.id.startsWith(`PB-${lang}-${n}`));
  assert.deepEqual(new Set(triad.map(x=>x.modality_id)),new Set(['problem-solving','debugging','code-explanation']));
  for(const item of triad) if(item.modality_id!=='code-explanation') assert.ok(all[item.id]?.length>0,`missing schema ${item.id}`);
 }
});
