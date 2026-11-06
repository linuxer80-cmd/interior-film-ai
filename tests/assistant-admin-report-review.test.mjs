import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../app/api/admin/site-work-report-review/action/route.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
const company='11111111-1111-1111-1111-111111111111',site='22222222-2222-2222-2222-222222222222',reportId='33333333-3333-3333-3333-333333333333',revision='2026-11-06T10:00:00+00:00';
function fixture({race=false}={}) {
 const rows={companies:[{id:company,is_active:true}],profiles:[{id:'owner',company_id:company,role:'owner',is_active:true}],sites:[{id:site,company_id:company,site_name:'test'}],work_reports:[{id:reportId,company_id:company,site_id:site,review_status:'pending',updated_at:revision}]};let notifications=0;
 const db={auth:{async getUser(){return {data:{user:{id:'owner'}}}}},from(table){let filters=[],update=null;
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},limit(){return q},update(value){update=value;return q},async maybeSingle(){return {data:(rows[table]||[]).find(row=>filters.every(f=>f(row)))||null,error:null}},
   then(resolve,reject){if(update && race) rows.work_reports[0].updated_at='2026-11-06T11:00:00+00:00';const matches=(rows[table]||[]).filter(r=>filters.every(f=>f(r)));if(update)matches.forEach(r=>Object.assign(r,update));return Promise.resolve({data:matches,error:null}).then(resolve,reject)}};return q;}};
 const process={env:{NEXT_PUBLIC_SUPABASE_URL:'test',SUPABASE_SERVICE_ROLE_KEY:'test'}};
 const POST=new Function('NextResponse','createClient','notifyCustomerCompletion','process',source+';return POST;')({json:Response.json},()=>db,async()=>{notifications++;return {reason:'ok'}},process);
 return {POST,rows,notices:()=>notifications};
}
const payload={siteId:site,action:'approve',approvedAmount:500000,reviewMemo:'',expectedReportId:reportId,expectedUpdatedAt:revision};
async function send(f,body){return f.POST(new Request('https://example.invalid/api/admin/site-work-report-review/action',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify(body)}))}
test('unchanged report can be approved once through the existing review action',async()=>{const f=fixture(),r=await send(f,payload);assert.equal(r.status,200);assert.equal(f.rows.work_reports[0].review_status,'approved');assert.equal(f.rows.work_reports[0].approved_amount,500000);assert.equal(f.notices(),1);const repeat=await send(f,payload);assert.equal(repeat.status,409);assert.equal(f.notices(),1)});
test('stale report is rejected before review or customer notification',async()=>{const f=fixture();f.rows.work_reports[0].updated_at='2026-11-06T11:00:00+00:00';assert.equal((await send(f,payload)).status,409);assert.equal(f.rows.work_reports[0].review_status,'pending');assert.equal(f.notices(),0)});
test('revision check also prevents changes between lookup and update',async()=>{const f=fixture({race:true});assert.equal((await send(f,payload)).status,409);assert.equal(f.rows.work_reports[0].review_status,'pending');assert.equal(f.notices(),0)});
test('incomplete optimistic guard is rejected',async()=>{const f=fixture();const {expectedUpdatedAt,...incomplete}=payload;assert.equal((await send(f,incomplete)).status,400);assert.equal(f.notices(),0)});
test('legacy web requests without optional guard still work',async()=>{const f=fixture();const {expectedUpdatedAt,expectedReportId,...legacy}=payload;assert.equal((await send(f,legacy)).status,200);assert.equal(f.notices(),1)});

test('inactive company or non-owner cannot approve or trigger customer notification',async()=>{
 for(const change of [f=>{f.rows.companies[0].is_active=false},f=>{f.rows.profiles[0].role='worker'}]) {
  const f=fixture();change(f);assert.equal((await send(f,payload)).status,403);assert.equal(f.rows.work_reports[0].review_status,'pending');assert.equal(f.notices(),0);
 }
});
test('review detail API is restricted to active company owners',async()=>{
 const getSource=(await readFile(new URL('../app/api/admin/site-work-report-review/route.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
 const verify=new Function(getSource+';return verifyAdmin;')();
 function db(role='owner',active=true) { return {auth:{async getUser(){return {data:{user:{id:'owner'}}}}},from(table){let id='';const q={select(){return q},eq(_key,value){id=value;return q},async maybeSingle(){return {data:table==='profiles'?{id,company_id:company,role,is_active:true}:{id,is_active:active},error:null}}};return q;}} }
 assert.equal((await verify(db(),'token')).ok,true);
 assert.equal((await verify(db('worker'),'token')).status,403);
 assert.equal((await verify(db('owner',false),'token')).status,403);
});
test('reviewer can reject with a reason without sending a completion notification',async()=>{
 const f=fixture(),r=await send(f,{...payload,action:'reject',approvedAmount:null,reviewMemo:'완료사진을 추가해 주세요.'});
 assert.equal(r.status,200);assert.equal(f.rows.work_reports[0].review_status,'rejected');assert.equal(f.rows.work_reports[0].review_memo,'완료사진을 추가해 주세요.');assert.equal(f.notices(),0);
});
test('rejection without a reason never changes the report',async()=>{
 const f=fixture(),r=await send(f,{...payload,action:'reject',approvedAmount:null,reviewMemo:' '});assert.equal(r.status,400);assert.equal(f.rows.work_reports[0].review_status,'pending');assert.equal(f.notices(),0);
});
