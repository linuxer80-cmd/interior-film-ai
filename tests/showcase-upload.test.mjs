import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app/admin/customer-page/page.js',import.meta.url),'utf8');
const upload=source.slice(source.indexOf('  async function uploadPhotos('),source.indexOf('  async function saveCase('));
function fixture({failAt=0,busy=false}={}){
 let count=0;const state={draft:{before_paths:[],after_paths:[]},message:''};
 const context=vm.createContext({ready:true,busy,companyId:'company',SHOWCASE_BUCKET:'company-showcase',uploadLock:{current:false},draft:state.draft,crypto:{randomUUID:()=>String(count+1)},setBusy:()=>{},setMessage:v=>state.message=v,setDraft:fn=>state.draft=fn(state.draft),supabase:{storage:{from:()=>({upload:async()=>({error:++count===failAt?Error('connection failed'):null})})}}});
 vm.runInContext(upload+';globalThis.run=uploadPhotos;',context);
 const input={value:'selected',files:[{name:'a.jpg',type:'image/jpeg',size:100},{name:'b.jpg',type:'image/jpeg',size:100}]};
 return {state,input,run:()=>context.run({target:input},'after_paths')};
}
test('successful photo selection retains uploaded paths after native file input reset',async()=>{const f=fixture();await f.run();assert.equal(f.state.draft.after_paths.length,2);assert.equal(f.input.value,'');});
test('partial upload failure retains successful photos and explains failure',async()=>{const f=fixture({failAt:2});await f.run();assert.equal(f.state.draft.after_paths.length,1);assert.match(f.state.message,/업로드 실패/);assert.equal(f.input.value,'selected');});
test('busy or invalid file selection is never silently cleared',async()=>{const f=fixture({busy:true});await f.run();assert.equal(f.input.value,'selected');const invalid=fixture();invalid.input.files[0].size=6*1024*1024;await invalid.run();assert.equal(invalid.input.value,'selected');assert.match(invalid.state.message,/5MB/);});
