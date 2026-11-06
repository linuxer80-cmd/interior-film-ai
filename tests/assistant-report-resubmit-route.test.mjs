import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../app/api/worker/site-work-report/resubmit/route.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
const C='11111111-1111-1111-1111-111111111111',S='22222222-2222-2222-2222-222222222222',W='33333333-3333-3333-3333-333333333333',U='44444444-4444-4444-4444-444444444444',R='55555555-5555-5555-5555-555555555555';
const body={siteId:S,reportId:R,updatedAt:'2026-11-06T09:00:00Z',summary:'문 시공',region:'문',memo:'사진 추가'};
function fixture({allowed=true,error=null}={}){
 const calls=[];let sync=0;const db={async rpc(name,args){calls.push({name,args});return error?{error}:{data:{reportId:R,review_status:'pending'}}}};
 const post=new Function('privateAuth','privateJson','uuid','resolveWorkerSite','syncAfterReport',source+';return POST;')(
  async()=>({db,user:{id:U}}),(v,status=200)=>Response.json(v,{status}),s=>typeof s==='string' && /^[\da-f-]{36}$/i.test(s),
  async()=>({canSubmit:allowed,site:{status:'in_progress'},worker:{id:W,company_id:C}}),async()=>{sync++;return ''});return {post,calls,sync:()=>sync};
}
async function send(f,b){return f.post(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(b)}))}
test('safe endpoint submits exact authenticated identity and revision without replacing costs',async()=>{const f=fixture();const response=await send(f,body);assert.equal(response.status,200);assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'assistant_resubmit_report');assert.equal(f.calls[0].args.p_worker_id,W);assert.equal(f.calls[0].args.p_user_id,U);assert.equal(f.calls[0].args.p_expected_updated_at,body.updatedAt);assert.equal('p_expenses' in f.calls[0].args,false);assert.equal(f.sync(),1)});
test('invalid inputs and revoked assignments never reach the database function',async()=>{const f=fixture({allowed:false});assert.equal((await send(f,body)).status,403);assert.equal(f.calls.length,0);const g=fixture();assert.equal((await send(g,{...body,reportId:'invalid'})).status,400);assert.equal(g.calls.length,0)});
test('missing safe migration fails closed with no destructive fallback',async()=>{const f=fixture({error:{code:'PGRST202'}});const r=await send(f,body);assert.equal(r.status,503);assert.equal(f.calls.length,1);assert.equal(f.sync(),0)});
test('changed report or materials returns a conflict without retrying',async()=>{const f=fixture({error:{code:'P0001',message:'보고서가 변경되었습니다.'}});assert.equal((await send(f,body)).status,409);assert.equal(f.calls.length,1);assert.equal(f.sync(),0)});
