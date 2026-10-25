import test from 'node:test';
import assert from 'node:assert/strict';
import {alimtalkCompany} from '../lib/alimtalkCompany.mjs';
test('existing company contact takes priority without a secondary query',async()=>{
 const company={id:'a',phone:'02-123-4567'};assert.equal(await alimtalkCompany({},company),company);
});
test('blank contact resolves only the same company public phone',async()=>{
 const calls=[];const db={from:t=>{calls.push(t);return {select:s=>{calls.push(s);return {eq:(key,id)=>{calls.push([key,id]);return {maybeSingle:async()=>({data:{public_phone:' 010-1234-5678 '}})};}};}};}};
 const result=await alimtalkCompany(db,{id:'company-a',phone:' '});assert.equal(result.phone,'010-1234-5678');assert.deepEqual(calls[2],['company_id','company-a']);
});
test('missing public contact stays blank and lookup errors are not hidden',async()=>{
 const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})};assert.equal((await alimtalkCompany(db,{id:'a'})).phone,'');
 db.from=()=>({select:()=>({eq:()=>({maybeSingle:async()=>({error:Error('failed')})})})});await assert.rejects(alimtalkCompany(db,{id:'a'}),/failed/);
});
