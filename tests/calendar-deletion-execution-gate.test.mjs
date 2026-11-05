import test from 'node:test';import assert from 'node:assert/strict';
import {runAutoSync} from '../lib/calendarAutoSync.mjs';
test('company freeze stops a claimed sync before reading credentials or calling Google',async()=>{
 const calls=[];let network=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{network++;throw new Error('unexpected network');};
 try{
 const update={eq(){return this;},then(resolve){return Promise.resolve({error:null,data:null}).then(resolve);}};
 const db={rpc:async(name,args)=>{
  calls.push(name);
  if(name==='calendar_auto_claim')return {data:[{user_id:'fixture-user',generation:'fixture-generation',lease_id:'fixture-lease'}]};
  if(name==='calendar_company_sync_allowed'){assert.equal(args.p_user,'fixture-user');return {data:false};}
  throw new Error('unexpected RPC');
 },from:name=>{assert.equal(name,'calendar_auto_connections');return {update:body=>{assert.equal(body.lease_id,null);return update;}};}};
 assert.deepEqual(await runAutoSync(db),{failed:true,reconnect:false});
 assert.deepEqual(calls,['calendar_auto_claim','calendar_company_sync_allowed']);assert.equal(network,0);
 }finally{globalThis.fetch=original;}
});
