import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {readSolapiBalance} from '../lib/solapiBalance.mjs';
const config={apiKey:'test-key',secret:'test-secret'};
test('balance includes net deposit already; point is added once, and private fields never leave the server',async()=>{
 let path;const result=await readSolapiBalance({config,fetcher:async(url)=>{path=url;return Response.json({balance:240000,point:3000,deposit:100000,balanceOnly:150000,accountId:'private-account',lowBalanceAlert:{channels:['private']}});}});
 assert.equal(path,'https://api.solapi.com/cash/v1/balance');assert.equal(result.total,243000);assert.equal(result.balance,240000);assert.equal(result.point,3000);assert.ok(result.checkedAt);assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('zero is valid, missing or malformed balances and provider failures never masquerade as zero',async()=>{
 assert.equal((await readSolapiBalance({config,fetcher:async()=>Response.json({balance:0,point:0})})).total,0);
 for(const payload of [{point:0},{balance:null,point:0},{balance:'100',point:0},{balance:100}]){const r=await readSolapiBalance({config,fetcher:async()=>Response.json(payload)});assert.equal(r.available,false);assert.equal(r.total,undefined);}
 assert.equal((await readSolapiBalance({config,fetcher:async()=>Response.json({apiKey:'private'},{status:401})})).available,false);
 assert.equal((await readSolapiBalance({config,fetcher:async()=>{throw Error('private provider error');}})).available,false);
 assert.equal((await readSolapiBalance({config:{},fetcher:async()=>{throw Error('should not call');}})).available,false);
});
test('only active super-admins can reach the balance provider',async()=>{
 const source=fs.readFileSync(new URL('../app/api/super-admin/solapi-balance/route.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export ','');
 let login=false,superAdmin=false,failed=false,calls=0;
 const db={from(table){assert.equal(table,'super_admins');const checks=[];const q={select(){return q;},eq(k,v){checks.push([k,v]);return q;},maybeSingle:async()=>({error:failed?{code:'db'}:null,data:superAdmin&&checks.some(([k,v])=>k==='is_active'&&v===true)?{user_id:'user'}:null})};return q;}};
 const ctx=vm.createContext({privateAuth:async()=>login?{db,user:{id:'user'}}:{error:'로그인 필요',status:401},json:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}}),readSolapiBalance:async()=>{calls++;return {available:true,total:100};}});vm.runInContext(source+'\nglobalThis.get=GET;',ctx);
 assert.equal((await ctx.get({})).status,401);login=true;assert.equal((await ctx.get({})).status,403);failed=true;assert.equal((await ctx.get({})).status,503);assert.equal(calls,0);failed=false;superAdmin=true;const response=await ctx.get({});assert.equal(response.status,200);assert.equal(calls,1);assert.match(response.headers.get('cache-control'),/no-store/);
});
