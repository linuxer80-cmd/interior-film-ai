import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../app/api/admin/assistant-receivables/route.js',import.meta.url),'utf8')
  .replace(/^import .*;$/gm,'').replaceAll('export ','');
async function run({company='company',selected='company',summary={outstanding:120000,unconfirmed:2},active=true,unknownError=false}={}) {
  let calls=0;
  const auth=async()=>active ? {success:true,companyId:company,userId:'user',db:{rpc:async(name,args)=>{
    calls++;assert.equal(name,'manage_site_settlement');assert.equal(args.p_user,'user');assert.equal(args.p_action,'completed_list');
    return {data:{summary},error:null};
  },from(name){assert.equal(name,'site_receivable_balances');const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},async is(k,v){filters.push([k,v]);assert.deepEqual(filters,[['company_id',company],['status','completed'],['contract_amount',null]]);return unknownError ? {count:null,error:{code:'error'}} : {count:1,error:null}}};return q}}} : {success:false,status:403};
  const get=new Function('authenticateAdmin','Response',source+';return GET;')(auth,Response);
  const result=await get(new Request('https://example.test',{headers:{'X-Assistant-Company':selected}}));
  return {result,calls};
}
test('returns only verified completed-site totals for selected company',async()=>{
  const {result,calls}=await run();assert.equal(result.status,200);assert.equal(calls,1);
  assert.deepEqual(await result.json(),{companyId:'company',outstanding:120000,unconfirmed:2,unknownContract:1});
});
test('rejects different company and inactive accounts before querying',async()=>{
  const a=await run({selected:'other'});assert.equal(a.result.status,403);assert.equal(a.calls,0);
  const b=await run({active:false});assert.equal(b.result.status,403);assert.equal(b.calls,0);
});
test('does not replace an unavailable or invalid amount with zero',async()=>{
  const {result}=await run({summary:{outstanding:null,unconfirmed:0}});assert.equal(result.status,503);
  const missing=await run({unknownError:true});assert.equal(missing.result.status,503);
});

const exampleSite={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',company_id:'company',status:'completed',site_name:'현장',customer_name:'고객',confirmed:true,contract_amount:110000,paid:10000,outstanding:100000};
async function runItems({company='company',selected='company',active=true,item=exampleSite,path='?view=items&filter=unpaid&page=1&q=%ED%98%84%EC%9E%A5',count=12}={}) {
  let calls=[];
  const auth=async()=>active ? {success:true,companyId:company,userId:'user',db:{rpc:async(name,args)=>{calls.push({name,args});return {data:{items:item===null?[]:[item],count},error:null}}}} : {success:false,status:403};
  const get=new Function('authenticateAdmin','Response',source+';return GET;')(auth,Response);
  const result=await get(new Request('https://example.test/'+path,{headers:{'X-Assistant-Company':selected}}));
  return {result,calls};
}
test('lists authorized completed sites with bounded filters and only required fields',async()=>{
  const {result,calls}=await runItems();assert.equal(result.status,200);
  assert.deepEqual(calls[0].args.p_body,{filter:'unpaid',page:'1',q:'현장'});
  const body=await result.json();assert.equal(body.companyId,'company');assert.equal(body.page,1);assert.equal(body.count,12);
  assert.deepEqual(body.items,[{id:exampleSite.id,site_name:'현장',customer_name:'고객',confirmed:true,contract_amount:110000,paid:10000,outstanding:100000}]);
});
test('unconfirmed amounts remain null instead of becoming zero',async()=>{
  const {result}=await runItems({item:{...exampleSite,confirmed:false,paid:null,outstanding:null}});
  assert.equal(result.status,200);const site=(await result.json()).items[0];assert.equal(site.paid,null);assert.equal(site.outstanding,null);
});
test('rejects other companies, non-completed sites and malformed financial rows',async()=>{
  for(const item of [{...exampleSite,company_id:'other'}, {...exampleSite,status:'scheduled'}, {...exampleSite,outstanding:null,paid:undefined}]) {
    const {result}=await runItems({item});assert.equal(result.status,503);
  }
  const denied=await runItems({selected:'other'});assert.equal(denied.result.status,403);assert.equal(denied.calls.length,0);
  const inactive=await runItems({active:false});assert.equal(inactive.result.status,403);assert.equal(inactive.calls.length,0);
});
test('invalid filter, page and long searches are rejected before database access',async()=>{
  for(const path of ['?view=items&filter=unknown','?view=items&page=-1','?view=items&page=100001','?view=items&q='+('a'.repeat(101))]) {
    const {result,calls}=await runItems({path});assert.equal(result.status,400);assert.equal(calls.length,0);
  }
});
