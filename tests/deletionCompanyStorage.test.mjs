import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteCompanyFiles, validateCompanyFileInventory } from '../lib/deletionCompanyStorage.mjs';
const c='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
const manifest = files => ({companyId:c,chatThreadIds:[c],files,complete:true});
const photo = path => ({bucket:'work-photos',path});
test('company ownership excludes other companies, personal avatars, samples and unsafe paths',()=>{
 for(const f of [photo(`sites/${other}/x.jpg`),photo(`sites/${c}/../x.jpg`),photo(`sites/${c}/%2e/x.jpg`),{bucket:'labor-avatars',path:`${c}/x.jpg`},{bucket:'film-samples',path:`${c}/x.jpg`},{bucket:'customer-chat',path:`${other}/x.jpg`}]) assert.throws(()=>validateCompanyFileInventory(c,manifest([f])));
 assert.equal(validateCompanyFileInventory(c,manifest([photo(`sites/${c}/x.jpg`),{bucket:'customer-chat',path:`${c}/x.jpg`}])).length,2);
});
test('validates whole manifest before any deletion and refuses incomplete inventory',async()=>{
 let writes=0;const args={storage:{from:()=>({remove:async()=>{writes++;return {};}})},companyId:c,assertLease:async()=>true,assertFrozen:async()=>true};
 for(const m of [manifest([photo(`sites/${c}/ok.jpg`),photo(`sites/${other}/bad.jpg`)]),{...manifest([]),complete:false},{...manifest([]),sharedFiles:[photo(`sites/${c}/shared.jpg`)]}]) await assert.rejects(deleteCompanyFiles({...args,inventory:async()=>m}));
 assert.equal(writes,0);
});
test('deletes in bounded batches, verifies absence and retries after partial failure',async()=>{
 let files=Array.from({length:205},(_,i)=>photo(`history/${c}/${i}.jpg`));let calls=0,fail=true;const sizes=[];
 const args={companyId:c,assertLease:async()=>true,assertFrozen:async()=>true,inventory:async()=>manifest([...files]),storage:{from:bucket=>({remove:async paths=>{calls++;sizes.push(paths.length);if(fail&&calls===2)return {error:true};files=files.filter(f=>f.bucket!==bucket||!paths.includes(f.path));return {};}})}};
 await assert.rejects(deleteCompanyFiles(args));assert.equal(files.length,105);fail=false;
 assert.deepEqual(await deleteCompanyFiles(args),{deleted:105,verified:true});assert.equal(files.length,0);assert.ok(sizes.every(n=>n<=100));
});
test('lost lease or company write freeze stops subsequent batches',async()=>{
 let writes=0,checks=0;
 await assert.rejects(deleteCompanyFiles({companyId:c,inventory:async()=>manifest(Array.from({length:101},(_,i)=>photo(`history/${c}/${i}.jpg`))),assertLease:async()=>++checks<3,assertFrozen:async()=>true,storage:{from:()=>({remove:async()=>{writes++;return {};}})}}));assert.equal(writes,1);
});
test('retained objects cannot report success',async()=>{
 await assert.rejects(deleteCompanyFiles({companyId:c,inventory:async()=>manifest([photo(`history/${c}/x.jpg`)]),assertLease:async()=>true,assertFrozen:async()=>true,storage:{from:()=>({remove:async()=>({})})}}),/not verified/);
});
test('shared originals delete only after reference removal, with independent verification',async()=>{
 const file=photo(`history/${c}/shared.jpg`);let files=[file],refs=true;const events=[];
 const args={companyId:c,assertLease:async()=>true,assertFrozen:async()=>true,
 inventory:async()=>({...manifest([...files]),sharedFiles:refs?[file]:[],sharedFilePolicy:'delete_original_and_references'}),
 detachSharedReferences:async(id,items)=>{assert.equal(id,c);assert.deepEqual(items,[file]);events.push('detach');refs=false;return true;},
 verifySharedReferences:async()=>{events.push('verify');return !refs;},
 storage:{from:()=>({remove:async()=>{assert.equal(refs,false);events.push('delete');files=[];return {};}})}};
 assert.deepEqual(await deleteCompanyFiles(args),{deleted:1,verified:true});assert.ok(events.indexOf('detach')<events.indexOf('delete'));assert.equal(events.at(-1),'verify');
});
test('unconfirmed shared cleanup and reappearing references prevent physical deletion',async()=>{
 const file=photo(`history/${c}/shared.jpg`);let writes=0;
 const args={companyId:c,assertLease:async()=>true,assertFrozen:async()=>true,
 inventory:async()=>({...manifest([file]),sharedFiles:[file],sharedFilePolicy:'delete_original_and_references'}),storage:{from:()=>({remove:async()=>{writes++;return {};}})}};
 await assert.rejects(deleteCompanyFiles(args),/cleanup required/);
 await assert.rejects(deleteCompanyFiles({...args,detachSharedReferences:async()=>false,verifySharedReferences:async()=>true}),/not confirmed/);
 await assert.rejects(deleteCompanyFiles({...args,detachSharedReferences:async()=>true,verifySharedReferences:async()=>false}),/references remain/);
 let calls=0;
 await assert.rejects(deleteCompanyFiles({...args,detachSharedReferences:async()=>true,verifySharedReferences:async()=>++calls===1}),/references remain/);
 assert.equal(writes,0);
});
test('another company original cannot be authorized by placing it in sharedFiles',async()=>{
 const f=photo(`history/${other}/x.jpg`);
 await assert.rejects(deleteCompanyFiles({companyId:c,assertLease:async()=>true,assertFrozen:async()=>true,inventory:async()=>({...manifest([]),sharedFiles:[f],sharedFilePolicy:'delete_original_and_references'}),storage:{}}),/Unrecognized/);
});
