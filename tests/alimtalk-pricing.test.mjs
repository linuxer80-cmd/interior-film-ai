import test from 'node:test';
import assert from 'node:assert/strict';
import {ALIMTALK_PACKAGES,alimtalkChargeAmount} from '../lib/alimtalkPricing.mjs';
test('charge packages and custom quantities use exact 30 won total',()=>{
 assert.deepEqual(ALIMTALK_PACKAGES,[{quantity:100,amount:3000},{quantity:500,amount:15000},{quantity:1000,amount:30000}]);assert.equal(alimtalkChargeAmount(123),3690);
 for(const value of [0,-1,1.5,NaN,1000001,'100'])assert.equal(alimtalkChargeAmount(value),null);
});

import fs from 'node:fs';
import vm from 'node:vm';
test('server checks amount before granting and records charge amount',async()=>{
 const source=fs.readFileSync(new URL('../app/api/super-admin/alimtalk/route.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export ','');
 const calls=[];const db={from:()=>({select:()=>({eq(){return this;},maybeSingle:async()=>({data:{id:'company'}})})}),rpc:async(name,args)=>{calls.push(args);return {data:{accepted:true}};}};
 const context=vm.createContext({Request,Response,URL,console:{error(){}},alimtalkChargeAmount,uuid:()=>true,privateAuth:async()=>({db,user:{id:'actor'}}),json:(data,status=200)=>Response.json(data,{status})});
 vm.runInContext(source+';globalThis.post=POST;',context);
 const body={companyId:'company',action:'grant',operationId:'operation',quantity:100,creditType:'paid',paidAmount:1,reason:'입금 확인'};
 const send=()=>context.post(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await send()).status,400);assert.equal(calls.length,0);
 body.paidAmount=3000;assert.equal((await send()).status,200);assert.match(calls[0].p_reason,/3000원 \/ 100건/);
});
