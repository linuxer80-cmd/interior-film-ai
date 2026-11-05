import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { siteBasicPatch } from '../lib/siteBasicPatch.mjs';

const source=readFileSync(new URL('../app/api/admin/site-basic-conditional/route.js',import.meta.url),'utf8')
  .replace(/^import .*;$/gm,'').replaceAll('export ','');
const company='11111111-1111-4111-8111-111111111111';
const siteId='22222222-2222-4222-8222-222222222222';
const version='2026-11-05T12:00:00.000Z';
function setup({ ownerCompany=company, active=true, versionNow=version }={}) {
  const row={id:siteId,company_id:company,status:'consulting',updated_at:versionNow,address:'기존 주소',memo:'기존 메모'};
  let writes=0;
  const db={from(table) {
    assert.equal(table,'sites');
    return {update(patch) {
      const filters=[];
      const q={eq(key,value){filters.push([key,value]);return q},is(key,value){filters.push([key,value]);return q},
        select(){return q},async maybeSingle(){
          if(!filters.every(([key,value])=>row[key]===value))return {data:null,error:null};
          Object.assign(row,patch);writes++;return {data:{...row},error:null};
        }};
      return q;
    }};
  }};
  const auth=async()=>active ? {success:true,companyId:ownerCompany,db} : {success:false,status:403};
  const post=new Function('authenticateAdmin','siteBasicPatch','Response',source+';return POST;')(auth,siteBasicPatch,Response);
  const request=body=>post(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  return {row,request,get writes(){return writes}};
}
const body=(fields={address:'새 주소'})=>({siteId,expectedStatus:'consulting',expectedUpdatedAt:version,fields});

test('saves only the confirmed fields for the authorized company and matching version',async()=>{
  const t=setup(),r=await t.request(body({address:'새 주소',memo:'기존 메모\n방문 견적: 토요일 오전'}));
  assert.equal(r.status,200);assert.equal(t.writes,1);assert.equal(t.row.address,'새 주소');
  assert.equal(t.row.memo,'기존 메모\n방문 견적: 토요일 오전');assert.equal(t.row.status,'consulting');
});
test('rejects a stale version instead of overwriting a concurrent change',async()=>{
  const t=setup({versionNow:'2026-11-05T12:01:00.000Z'}),r=await t.request(body());
  assert.equal(r.status,409);assert.equal(t.writes,0);assert.equal(t.row.address,'기존 주소');
});
test('blocks another company, inactive users and fields outside the allowlist',async()=>{
  const foreign=setup({ownerCompany:'33333333-3333-4333-8333-333333333333'});
  assert.equal((await foreign.request(body())).status,409);assert.equal(foreign.writes,0);
  const inactive=setup({active:false});assert.equal((await inactive.request(body())).status,403);assert.equal(inactive.writes,0);
  const t=setup();assert.equal((await t.request(body({company_id:'other'}))).status,400);assert.equal(t.writes,0);
  const missing=body();delete missing.expectedUpdatedAt;assert.equal((await t.request(missing)).status,400);
});
