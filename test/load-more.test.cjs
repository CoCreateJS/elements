const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/setDataHandler.js'),'utf8');
const loadMore=vm.runInNewContext('('+source.slice(source.indexOf('async function loadMore('),source.indexOf('\nasync function checkFilters'))+')');
test('append deduplicates without mutating shared cache/server responses',async()=>{
 const response={object:[{_id:'a'},{_id:'b'},{_id:'b'}],filter:{index:3,startingIndex:1}};
 const original=JSON.stringify(response);let rendered;
 await loadMore({getData:async()=>({object:[{_id:'a'}]}),renderValue:async data=>{rendered=data;}},response,'object');
 assert.equal(JSON.stringify(response),original);
 assert.equal(rendered.object.length,1);assert.equal(rendered.object[0]._id,'b');
 assert.equal(rendered.filter.loadMore,true);assert.equal(rendered.filter.overwrite,false);
});
test('duplicate-only response leaves existing render untouched',async()=>{
 let called=false;
 await loadMore({getData:async()=>({object:[{_id:'a'}]}),renderValue:async()=>{called=true;}},{object:[{_id:'a'}]},'object');
 assert.equal(called,false);
});
