import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDoorUpload} from '../../lib/test/doorUpload.mjs';
test('large phone photo is converted before upload and temporary previews are revoked',async()=>{
 const input={name:'phone.jpg',type:'image/jpeg',size:8000000},output={type:'image/jpeg',size:400000};let removed='';
 const got=await prepareDoorUpload(input,async(f,size)=>{assert.equal(f,input);assert.equal(size,1600);return {file:output,preview:'blob:temporary'}},u=>removed=u);
 assert.equal(got,output);assert.equal(removed,'blob:temporary');
});
test('oversized conversion retries and unsupported decode never sends original',async()=>{
 let calls=0;
 await assert.rejects(prepareDoorUpload({name:'x.png',type:'image/png',size:9000000},async()=>{calls++;return {file:{type:'image/jpeg',size:4000000}}},()=>{}),/줄이지/);
 assert.equal(calls,3);
 await assert.rejects(prepareDoorUpload({name:'x.heic',type:'image/heic',size:10000},async()=>{throw Error('decode')},()=>{}),/JPG/);
});
