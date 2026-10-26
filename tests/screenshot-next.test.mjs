import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const child=fs.readFileSync(new URL('../app/admin/site-register/ScreenshotSiteInput.js',import.meta.url),'utf8');
const parent=fs.readFileSync(new URL('../app/admin/SiteRegisterModal.js',import.meta.url),'utf8');
function fixture(draft,dates=''){
 const applied=[];let currentStep=0,error='';
 const context=vm.createContext({draft,dates,reviewFields:{current:{open:false}},applied:{current:false},disabled:false,lock:{current:false},requestId:{current:'request'},
 validScreenshotDate:value=>/^\d{4}-\d{2}-\d{2}$/.test(value),onApply:value=>applied.push(value),setDraft(){},setFiles(){},setError:value=>{error=value},setMessage(){},
 blocked:false,checkLock:{current:false},step:0,inputMode:'screenshot',screenshotApplyRef:{current:null},form:{work_description:''},consultationText:'',field(){},setStep:value=>{currentStep=value}});
 vm.runInContext(child.slice(child.indexOf('  function apply() {'),child.indexOf('  // The wizard'))+'\nscreenshotApplyRef.current=apply;',context);
 vm.runInContext(parent.slice(parent.indexOf('  async function nextStep() {'),parent.indexOf('  const blocked ='))+'\nglobalThis.next=nextStep;',context);
 return {context,applied,step:()=>currentStep,error:()=>error};
}
test('Next applies reviewed screenshot address, detail and phone before advancing',async()=>{
 const f=fixture({address:'테스트구 테스트로 12',address_detail:'101동 202호',customer_phone:'010-0000-0000',region:'테스트구'},'2026-10-27');
 await f.context.next();
 assert.equal(f.step(),1);assert.equal(f.applied.length,1);
 assert.equal(f.applied[0].address,'테스트구 테스트로 12');
 assert.equal(f.applied[0].address_detail,'101동 202호');
 assert.equal(f.applied[0].customer_phone,'010-0000-0000');
 assert.deepEqual(Array.from(f.applied[0].work_dates),['2026-10-27']);
});
test('invalid reviewed dates or amounts keep the review open without losing extraction',async()=>{
 for(const [draft,dates] of [[{address:'주소'},'내일'],[{address:'주소',contract_amount:'잘못된 금액'},'']]){
  const f=fixture(draft,dates);await f.context.next();
  assert.equal(f.step(),0);assert.equal(f.applied.length,0);assert.ok(f.error());assert.equal(f.context.draft.address,'주소');
  assert.equal(f.context.reviewFields.current.open,true);
 }
});
test('Next after manual apply advances without applying a second time',async()=>{
 const f=fixture({address:'주소'});f.context.screenshotApplyRef.current=null;
 await f.context.next();assert.equal(f.step(),1);assert.equal(f.applied.length,0);
});
