import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../supabase/migrations/20261106084935_assistant_safe_report_resubmission.sql',import.meta.url),'utf8');
const C='11111111-1111-1111-1111-111111111111',S='22222222-2222-2222-2222-222222222222',W='33333333-3333-3333-3333-333333333333',U='44444444-4444-4444-4444-444444444444',R='55555555-5555-5555-5555-555555555555';
const sig='public.assistant_resubmit_report(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,text)';
async function fixture(){
 const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table companies(id uuid primary key,is_active boolean);create table profiles(id uuid primary key,is_active boolean);
 create table workers(id uuid primary key,company_id uuid,user_id uuid,is_active boolean);
 create table sites(id uuid primary key,company_id uuid,status text);
 create table work_reports(id uuid primary key,company_id uuid,site_id uuid,worker_id uuid,work_region text,work_summary text,memo text,completed_at timestamptz,created_by uuid,updated_at timestamptz,review_status text,reviewed_at timestamptz,reviewed_by uuid,approved_amount numeric,review_memo text);
 create table site_photos(id uuid,company_id uuid,site_id uuid,photo_type text);
 create table site_materials(id uuid,company_id uuid,site_id uuid,material_type text,removed_at timestamptz,film_product_id uuid,brand text,product_code text,product_name text,quantity numeric,unit text,unit_price numeric,memo text,price_type text);
 create table site_expenses(id uuid,company_id uuid,site_id uuid,amount numeric,created_by uuid,reimbursement_worker_id uuid,description text);
 create table assignments(site_id uuid,worker_id uuid,user_id uuid,role text);
 create function public.site_operation_workers(p_site uuid) returns table(worker_id uuid,user_id uuid,role text) language sql as 'select worker_id,user_id,role from public.assignments where site_id=p_site';
 create table settlement(site_id uuid,items jsonb);
 create function public.report_material_settlement(p_company uuid,p_site uuid) returns jsonb language sql as 'select items from public.settlement where site_id=p_site';
 `);await db.exec(sql);await db.exec(sql);
 await db.query(`insert into companies values($1,true);`,[C]);await db.query(`insert into profiles values($1,true)`,[U]);
 await db.query(`insert into sites values($1,$2,'in_progress')`,[S,C]);await db.query(`insert into workers values($1,$2,$3,true)`,[W,C,U]);
 await db.query(`insert into assignments values($1,$2,$3,'leader')`,[S,W,U]);
 await db.query(`insert into work_reports(id,company_id,site_id,worker_id,work_summary,updated_at,review_status,review_memo) values($1,$2,$3,$4,'old','2026-11-06T09:00:00Z','rejected','사진 추가')`,[R,C,S,W]);
 await db.query(`insert into site_photos values('66666666-6666-6666-6666-666666666666',$1,$2,'after')`,[C,S]);
 await db.query(`insert into site_materials(id,company_id,site_id,material_type,brand,product_code,quantity,unit,unit_price,memo,price_type) values('77777777-7777-7777-7777-777777777777',$1,$2,'actual','현대','S115',2,'m',5000,'기록','non_fire')`,[C,S]);
 await db.query(`insert into site_expenses values('88888888-8888-8888-8888-888888888888',$1,$2,12000,$3,$4,'완료보고/주차비')`,[C,S,U,W]);return db;
}
const args=[C,S,W,U,R,'2026-11-06T09:00:00Z','문','수정된 시공 내용','메모'];
const call=db=>db.query(`select ${sig.split('(')[0]}($1,$2,$3,$4,$5,$6,$7,$8,$9) as result`,args);
test('rejected report can be resubmitted without replacing any cost rows or identities',async()=>{const db=await fixture();try{
 const beforeM=await db.query('select * from site_materials');const beforeE=await db.query('select * from site_expenses');
 const result=await call(db);assert.equal(result.rows[0].result.review_status,'pending');
 assert.deepEqual((await db.query('select * from site_materials')).rows,beforeM.rows);assert.deepEqual((await db.query('select * from site_expenses')).rows,beforeE.rows);
 const report=(await db.query('select * from work_reports')).rows[0];assert.equal(report.work_summary,'수정된 시공 내용');assert.equal(report.review_memo,null);
 await assert.rejects(call(db),/보고서가 변경/);
}finally{await db.close()}});
test('roles, revision, site status and photo gates fail closed',async()=>{for(const mutate of [
 `update assignments set role='member';insert into assignments values('${S}','99999999-9999-9999-9999-999999999999','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','leader')`,
 `update work_reports set updated_at='2026-11-06T10:00:00Z'`,`delete from site_photos`,`update sites set status='cancelled'`,`update companies set is_active=false`
 ]){const db=await fixture();try{await db.exec(mutate);await assert.rejects(call(db));assert.equal((await db.query('select review_status from work_reports')).rows[0].review_status,'rejected');assert.equal((await db.query('select count(*)::int n from site_expenses')).rows[0].n,1)}finally{await db.close()}}});
test('changed planned material settlement is blocked rather than overwriting existing costs',async()=>{const db=await fixture();try{
 await db.query(`insert into site_materials(id,company_id,site_id,material_type) values('99999999-9999-9999-9999-999999999999',$1,$2,'planned')`,[C,S]);
 await db.query(`insert into settlement values($1,$2::jsonb)`,[S,JSON.stringify([{brand:'현대',product_code:'S115',quantity:4,unit:'m',unit_price:5000,memo:'기록',price_type:'non_fire'}])]);
 await assert.rejects(call(db),/필름 반출/);assert.equal((await db.query('select review_status from work_reports')).rows[0].review_status,'rejected');
 await db.query(`update settlement set items=$2::jsonb where site_id=$1`,[S,JSON.stringify([{brand:'현대',product_code:'S115',quantity:2,unit:'m',unit_price:5000,memo:'기록',price_type:'non_fire'}])]);
 assert.equal((await call(db)).rows[0].result.review_status,'pending');
}finally{await db.close()}});
test('only service role can execute the function',async()=>{const db=await fixture();try{
 for(const [role,expected] of [['anon',false],['authenticated',false],['service_role',true]]) assert.equal((await db.query(`select has_function_privilege($1,$2,'execute') as allowed`,[role,sig])).rows[0].allowed,expected);
}finally{await db.close()}});

test('a newer or already pending report prevents resubmitting an older rejected report',async()=>{const db=await fixture();try{
 await db.query(`insert into work_reports(id,company_id,site_id,updated_at,review_status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',$1,$2,'2026-11-06T10:00:00Z','pending')`,[C,S]);
 await assert.rejects(call(db),/다른 최신 보고서/);
 assert.equal((await db.query(`select review_status from work_reports where id=$1`,[R])).rows[0].review_status,'rejected');
}finally{await db.close()}});
test('real material settlement matches the original saved snapshot before preserving costs',async()=>{const db=await fixture();try{
 const source=await readFile(new URL('../supabase/migrations/20261026215408_material_cost_audit.sql',import.meta.url),'utf8');
 const match=source.match(/CREATE OR REPLACE FUNCTION public\.report_material_settlement[\s\S]*?\$function\$\s*;/i);assert.ok(match);
 await db.exec(`create table public.site_material_returns(material_id uuid,site_id uuid,company_id uuid,quantity numeric);
 create table public.site_material_issues(material_id uuid,site_id uuid,company_id uuid,quantity numeric,voided_at timestamptz);`);
 await db.exec(match[0]);
 const P='99999999-9999-9999-9999-999999999999';
 await db.query(`insert into site_materials(id,company_id,site_id,material_type,brand,product_code,quantity,unit,unit_price,price_type) values($1,$2,$3,'planned','현대','S115',5,'m',5000,'non_fire')`,[P,C,S]);
 await db.query(`insert into site_material_issues values($1,$2,$3,3,null);`,[P,S,C]);await db.query(`insert into site_material_returns values($1,$2,$3,1);`,[P,S,C]);
 await db.query(`update site_materials set memo='반출반입 정산: 3 - 1 m' where site_id=$1 and material_type='actual'`,[S]);
 const before=(await db.query('select * from site_expenses')).rows;assert.equal((await call(db)).rows[0].result.review_status,'pending');assert.deepEqual((await db.query('select * from site_expenses')).rows,before);
}finally{await db.close()}});
test('real resubmission route and database preserve existing costs and reject retries',async()=>{const db=await fixture();try{
 const source=(await readFile(new URL('../app/api/worker/site-work-report/resubmit/route.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
 const before=(await db.query('select * from site_expenses')).rows;let synced=0;
 const adapter={rpc:async(_name,p)=>{try {const q=await db.query('select public.assistant_resubmit_report($1,$2,$3,$4,$5,$6,$7,$8,$9) as value',
  [p.p_company_id,p.p_site_id,p.p_worker_id,p.p_user_id,p.p_report_id,p.p_expected_updated_at,p.p_work_region,p.p_work_summary,p.p_memo]);return {data:q.rows[0].value};}catch(error){return {error}}}};
 const post=new Function('privateAuth','privateJson','uuid','resolveWorkerSite','syncAfterReport',source+';return POST;')(
  async()=>({db:adapter,user:{id:U}}),(v,status=200)=>Response.json(v,{status}),v=>typeof v==='string'&&/^[\da-f-]{36}$/i.test(v),
  async()=>({canSubmit:true,site:{status:'in_progress'},worker:{id:W,company_id:C}}),async()=>{synced++;return ''});
 const request=()=>new Request('https://test.invalid',{method:'POST',body:JSON.stringify({siteId:S,reportId:R,updatedAt:args[5],region:'문',summary:'수정된 시공 내용',memo:'메모'})});
 assert.equal((await post(request())).status,200);assert.deepEqual((await db.query('select * from site_expenses')).rows,before);
 assert.equal((await post(request())).status,409);assert.equal(synced,1);
}finally{await db.close()}});
test('competing resubmissions preserve costs and only one may transition the report',async()=>{const db=await fixture();try{
 const before=(await db.query('select * from site_expenses')).rows;
 const attempts=await Promise.allSettled([call(db),call(db)]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
 assert.deepEqual((await db.query('select * from site_expenses')).rows,before);
 assert.equal((await db.query('select review_status from work_reports')).rows[0].review_status,'pending');
}finally{await db.close()}});
