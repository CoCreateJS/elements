const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/srcHandler.js'),'utf8');
test('deferred SSR source fetches, renders and clears its 304 marker',async()=>{
 const attrs=new Map([['src','/component.html'],['error','304']]);let content,requests=0;
 const el={tagName:'DIV',getAttribute:key=>attrs.get(key)??null,hasAttribute:key=>attrs.has(key),removeAttribute:key=>attrs.delete(key),setValue:value=>{content=value;}};
 const init=vm.runInNewContext(source.slice(source.indexOf('async function initElements('),source.indexOf('async function initMediaSource('))+'\ninitElements',{initializing:new WeakMap(),isSameOrigin:()=>true,sessionStorage:{getItem:()=>null},fetch:async()=>{requests++;return {status:200,ok:true,text:async()=>'<p>Cached or fetched content</p>'};},console,ObjectId:()=>''});
 await init([el]);assert.equal(requests,1);assert.equal(content,'<p>Cached or fetched content</p>');assert.equal(attrs.has('error'),false);
});
