import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAccountDeletion } from '../lib/accountDeletionExecutor.mjs';
function fixture() {
  const calls = [];
  const a = { claim: async () => ({ userId: 'test', lease: 'lease', status: 'processing', identityVerified: true, scope: 'personal_account' }),
    preflight: async () => ({ complete: true, blockers: [] }), assertExecutionLease: async () => true };
  for (const name of ['review','blockAccess','revokeSessions','removePushSubscriptions','deletePrivateFiles','scrubPersonalData','verifyBeforeAuthDeletion','deleteAuthUser','verifyComplete','complete','fail','release']) {
    a[name] = async () => { calls.push(name); return true; };
  }
  return { a, calls };
}
test('completion follows access blocking, data cleanup and verification', async () => {
  const { a, calls } = fixture();
  assert.deepEqual(await executeAccountDeletion(a, 'request'), { status: 'completed' });
  assert.deepEqual(calls, ['blockAccess','revokeSessions','removePushSubscriptions','deletePrivateFiles','scrubPersonalData','verifyBeforeAuthDeletion','deleteAuthUser','verifyComplete','complete','release']);
});
test('shared authentication never starts destructive processing', async () => {
  const { a, calls } = fixture();
  a.preflight = async () => ({ complete: true, sharedAuth: true, blockers: [] });
  assert.equal((await executeAccountDeletion(a, 'request')).status, 'review_required');
  assert.deepEqual(calls, ['review','release']);
});
test('failed files do not delete auth; retry reruns cleanup', async () => {
  const { a, calls } = fixture();
  a.deletePrivateFiles = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(executeAccountDeletion(a, 'request'));
  assert.ok(!calls.includes('deleteAuthUser'));
  assert.ok(calls.includes('fail'));
  a.deletePrivateFiles = async () => true;
  assert.equal((await executeAccountDeletion(a, 'request')).status, 'completed');
});
test('failed final verification cannot mark completion', async () => {
  const { a, calls } = fixture();
  a.verifyComplete = async () => false;
  await assert.rejects(executeAccountDeletion(a, 'request'));
  assert.ok(!calls.includes('complete'));
  assert.equal(calls.at(-1), 'release');
});

test('malformed execution claims never authorize cleanup or status writes',async()=>{
 for(const job of [true,[],{}, {userId:'test',lease:'',status:'processing'}, {userId:'',lease:'lease',status:'processing'}, {userId:'test',lease:'lease',status:'review_required'}]){
  const {a,calls}=fixture();a.claim=async()=>job;
  await assert.rejects(executeAccountDeletion(a,'request'),/Invalid deletion execution claim/);
  assert.deepEqual(calls,[]);
 }
});
test('busy request does not mutate or release another execution lease',async()=>{
 const {a,calls}=fixture();a.claim=async()=>null;
 assert.deepEqual(await executeAccountDeletion(a,'request'),{status:'busy'});assert.deepEqual(calls,[]);
});
test('completed claim is not executed again',async()=>{
 const {a,calls}=fixture();a.claim=async()=>({userId:'test',lease:'lease',status:'completed'});
 assert.deepEqual(await executeAccountDeletion(a,'request'),{status:'completed'});assert.deepEqual(calls,['release']);
});
test('missing identity verification cannot reach preflight or destructive steps',async()=>{
 const {a,calls}=fixture();a.claim=async()=>({userId:'test',lease:'lease',status:'processing',scope:'personal_account'});
 a.preflight=async()=>{calls.push('preflight');return {complete:true,blockers:[]};};
 await assert.rejects(executeAccountDeletion(a,'request'),/Verified personal account/);
 assert.deepEqual(calls,['fail','release']);
});
test('original cleanup failure survives both failure-write and release outages',async()=>{
 const {a,calls}=fixture();const original=Error('storage failed');a.deletePrivateFiles=async()=>{throw original;};
 a.fail=async(id,lease,code)=>{assert.equal(code,'deletion_incomplete');throw Error('status store unavailable');};
 a.release=async()=>{throw Error('lease release unavailable');};
 await assert.rejects(executeAccountDeletion(a,'request'),e=>e===original);
 assert.ok(!calls.includes('deleteAuthUser'));assert.ok(!calls.includes('complete'));
});
test('malformed and incomplete preflight plans require review without account blocking',async()=>{
 for(const plan of [null,{}, {complete:true,blockers:null}, {complete:true,blockers:['pending_order']}, {complete:true,blockers:[],soleOwner:true}]){
  const {a,calls}=fixture();a.preflight=async()=>plan;
  assert.deepEqual(await executeAccountDeletion(a,'request'),{status:'review_required'});assert.deepEqual(calls,['review','release']);
 }
});

test('lease loss at every execution boundary stops the next step',async()=>{
 const steps=['blockAccess','revokeSessions','removePushSubscriptions','deletePrivateFiles','scrubPersonalData','verifyBeforeAuthDeletion','deleteAuthUser','verifyComplete','complete'];
 for(let boundary=0;boundary<steps.length;boundary++){
  const {a,calls}=fixture();let checks=0;
  a.assertExecutionLease=async()=>++checks!==boundary+1;
  await assert.rejects(executeAccountDeletion(a,'request'),/lease not confirmed/);
  assert.deepEqual(calls,[...steps.slice(0,boundary),'fail','release']);
 }
});
test('missing lease checker cannot start account blocking',async()=>{
 const {a,calls}=fixture();delete a.assertExecutionLease;
 await assert.rejects(executeAccountDeletion(a,'request'),/lease not confirmed/);assert.deepEqual(calls,['fail','release']);
});

test('company cleanup is an execution stage followed by fresh personal eligibility', async () => {
 const {a,calls}=fixture();let checked=0;
 a.preflight=async()=>({complete:true,blockers:[],soleOwner:checked++===0});
 a.deleteCompany=async(user,plan,id,lease)=>{assert.equal(user,'test');assert.equal(id,'request');assert.equal(lease,'lease');calls.push('company');return true;};
 assert.equal((await executeAccountDeletion(a,'request')).status,'completed');
 assert.equal(checked,2);assert.deepEqual(calls.slice(0,2),['company','blockAccess']);
});
test('unconfirmed company or post-company scope never starts personal deletion', async () => {
 for(const failure of ['company','incomplete','owner','shared']){
  const {a,calls}=fixture();let checked=0;
  a.preflight=async()=>checked++===0?{complete:true,soleOwner:true,blockers:[]}:
   {complete:failure!=='incomplete',soleOwner:failure==='owner',sharedAuth:failure==='shared',blockers:[]};
  a.deleteCompany=async()=>failure!=='company';
  await assert.rejects(executeAccountDeletion(a,'request'));
  assert.deepEqual(calls,['fail','release']);
 }
});
test('incomplete ownership inventory cannot call company deletion',async()=>{
 const {a,calls}=fixture();a.preflight=async()=>({complete:false,soleOwner:true,blockers:[]});
 a.deleteCompany=async()=>{calls.push('company');return true;};
 assert.equal((await executeAccountDeletion(a,'request')).status,'review_required');
 assert.deepEqual(calls,['review','release']);
});
