import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../app/api/admin/assistant-receivables/route.js',import.meta.url),'utf8')
  .replace(/^import .*;$/gm,'').replaceAll('export ','');
async function run({company='company',selected='company',summary={outstanding:120000,unconfirmed:2},active=true}={}) {
  let calls=0;
  const auth=async()=>active ? {success:true,companyId:company,userId:'user',db:{rpc:async(name,args)=>{
    calls++;assert.equal(name,'manage_site_settlement');assert.equal(args.p_user,'user');assert.equal(args.p_action,'completed_list');
    return {data:{summary},error:null};
  }}} : {success:false,status:403};
  const get=new Function('authenticateAdmin','Response',source+';return GET;')(auth,Response);
  const result=await get(new Request('https://example.test',{headers:{'X-Assistant-Company':selected}}));
  return {result,calls};
}
test('returns only verified completed-site totals for selected company',async()=>{
  const {result,calls}=await run();assert.equal(result.status,200);assert.equal(calls,1);
  assert.deepEqual(await result.json(),{companyId:'company',outstanding:120000,unconfirmed:2});
});
test('rejects different company and inactive accounts before querying',async()=>{
  const a=await run({selected:'other'});assert.equal(a.result.status,403);assert.equal(a.calls,0);
  const b=await run({active:false});assert.equal(b.result.status,403);assert.equal(b.calls,0);
});
test('does not replace an unavailable or invalid amount with zero',async()=>{
  const {result}=await run({summary:{outstanding:null,unconfirmed:0}});assert.equal(result.status,503);
});
