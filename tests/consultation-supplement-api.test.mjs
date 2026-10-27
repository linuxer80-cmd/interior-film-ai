import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeSupplement,consultationSupplement} from '../lib/consultationSupplement.mjs';
const source=fs.readFileSync(new URL('../app/api/admin/site-consultation/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const id='00000000-0000-4000-8000-000000000001',requestId='00000000-0000-4000-8000-000000000002';
function fixture({denied=false,foreign=false,readError=false,priceError=false,conflict=false}={}) {
 const calls=[],filters=[];
 const site={id,company_id:'co',status:'scheduled',work_description:'방문',contract_amount:null,updated_at:'2026-10-27T00:00:00Z'};
 const db={from(table){calls.push(table);const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle:async()=>({data:foreign?null:site,error:readError?Error('failure'):null})};return q;},async rpc(name,args){calls.push({name,args});return conflict?{error:{code:'40001',message:'다시 저장해주세요.'}}:{data:{site:{...site,...args.p_patch},merged:true,materials:args.p_materials}};}};
 const handler=new Function('createHash','privateAuth','json','uuid','preparePlannedMaterials','normalizeSupplement','consultationSupplement',source+';return POST;')(
  createHash,async()=>denied?{error:'로그인 필요',status:401}:{db,user:{id:'owner'},companyId:'co'},(v,s=200)=>Response.json(v,{status:s}),v=>/^[\da-f-]{36}$/.test(v),async()=>{calls.push('prepare');if(priceError)throw Error('price failure');return [{price_type:'non_fire',unit_price:5800}];},normalizeSupplement,consultationSupplement);
 return {calls,filters,run:(patch={})=>handler(new Request('https://test/api/admin/site-consultation',{method:'POST',body:JSON.stringify({siteId:id,requestId,data:{contract_amount:1000000,work_description:'문틀'},materials:[],...patch})}))};
}
test('supplement API authenticates and checks tenant before preparing or writing, with explicit failures',async()=>{
 for(const [options,status] of [[{denied:true},401],[{foreign:true},404],[{readError:true},500],[{priceError:true},500],[{conflict:true},409]]) {
  const f=fixture(options);assert.equal((await f.run()).status,status);
  if(!options.conflict)assert.equal(f.calls.some(c=>c.name==='supplement_site_consultation'),false);
  if(options.denied)assert.equal(f.calls.length,0);
  if(options.foreign)assert.equal(f.calls.includes('prepare'),false);
 }
});
test('supplement API passes server-computed patch, actor, version and stable request fingerprint to atomic save',async()=>{
 const f=fixture();const response=await f.run();assert.equal(response.status,200);
 const call=f.calls.find(c=>c.name);assert.deepEqual(f.filters,[['id',id],['company_id','co']]);
 assert.equal(call.args.p_user,'owner');assert.equal(call.args.p_request,requestId);assert.equal(call.args.p_expected,'2026-10-27T00:00:00Z');
 assert.equal(call.args.p_patch.contract_amount,1000000);assert.equal(call.args.p_patch.work_description,'방문\n문틀');assert.equal(call.args.p_patch.company_id,undefined);assert.equal(call.args.p_patch.status,undefined);
 const first=call.args.p_fingerprint;await f.run();assert.equal(f.calls.filter(c=>c.name)[1].args.p_fingerprint,first);
 assert.equal((await f.run({data:{contract_amount:-1}})).status,400);
});
