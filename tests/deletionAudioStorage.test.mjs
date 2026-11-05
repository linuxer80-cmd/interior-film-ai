import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteUserCallAudio } from '../lib/deletionAudioStorage.mjs';
const user='00000000-0000-4000-8000-000000000001';
const company='00000000-0000-4000-8000-000000000002';
const filename='00000000-0000-4000-8000-000000000003.m4a';
const path=`${company}/${user}/${filename}`;
const lease=async()=>{};
function fixture(initial){
 let files=[...initial]; const removed=[];
 const storage={from(bucket){assert.equal(bucket,'site-call-audio-private');return {remove:async paths=>{removed.push(...paths);files=files.filter(p=>!paths.includes(p));return {error:null};}};}};
 return {storage,removed,inventory:async()=>[...files]};
}
test('removes former-company recordings and supports an empty retry',async()=>{
 const m=fixture([path,path.replace(company,'00000000-0000-4000-8000-000000000004')]);
 assert.equal((await deleteUserCallAudio(m.storage,user,m.inventory,lease)).deleted,2);
 assert.equal((await deleteUserCallAudio(m.storage,user,m.inventory,lease)).deleted,0);
});
test('rejects another user, malformed path or unknown suffix before any deletion',async()=>{
 for(const bad of [path.replace(user,company),`${path}/extra`,path.replace('.m4a','.jpg'),'../'+path]){
  const m=fixture([path,bad]);
  await assert.rejects(deleteUserCallAudio(m.storage,user,m.inventory,lease),/requires review/);
  assert.deepEqual(m.removed,[]);
 }
});
test('batch failure stops and retry removes remaining files',async()=>{
 const paths=Array.from({length:201},(_,i)=>`${company}/${user}/00000000-0000-4000-8000-${String(i).padStart(12,'0')}.wav`);
 const m=fixture(paths);const from=m.storage.from;let calls=0;
 m.storage.from=b=>({remove:async p=>{if(++calls===2)return {error:new Error('failed batch')};return from(b).remove(p);}});
 await assert.rejects(deleteUserCallAudio(m.storage,user,m.inventory,lease),/failed batch/);
 assert.equal((await m.inventory()).length,101);
 assert.equal((await deleteUserCallAudio(m.storage,user,m.inventory,lease)).deleted,101);
});
test('expired lease, unavailable inventory and remaining objects never count as completion',async()=>{
 const m=fixture([path]);let n=0;
 await assert.rejects(deleteUserCallAudio(m.storage,user,m.inventory,async()=>{if(++n===2)throw Error('expired');}),/expired/);
 assert.deepEqual(m.removed,[]);
 await assert.rejects(deleteUserCallAudio(m.storage,user,async()=>null,lease),/requires review/);
 await assert.rejects(deleteUserCallAudio({from:()=>({remove:async()=>({error:null})})},user,m.inventory,lease),/not be verified/);
});
