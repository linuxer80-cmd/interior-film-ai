import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
 create table companies(id uuid primary key,is_active boolean);
 create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean,name text);
 create table workers(user_id uuid,company_id uuid,name text);
 create table sites(id uuid primary key,company_id uuid,site_name text,customer_name text,status text,contract_amount numeric(14,2),deposit_amount numeric);
 create table work_reports(id uuid primary key,company_id uuid,site_id uuid,review_status text,approved_amount numeric,reviewed_at timestamptz,reviewed_by uuid,created_by uuid,updated_at timestamptz,work_summary text,memo text,completed_at timestamptz,review_memo text);
 create table site_payment_accounts(site_id uuid primary key,company_id uuid,opening_paid numeric,opening_date date,due_date date,revision integer default 0,initial_request_id uuid,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz);
 create table site_payment_entries(id uuid primary key,site_id uuid,company_id uuid,direction text,phase text,amount numeric,paid_on date,method text,memo text,created_by uuid,created_at timestamptz default now(),voided_at timestamptz,voided_by uuid,void_reason text);
 create table work_report_history(id uuid default gen_random_uuid(),company_id uuid,site_id uuid,report_id uuid,event text,actor_id uuid,actor_name text,before_status text,after_status text,before_cost jsonb,after_cost jsonb,reason text,created_at timestamptz default now());
 create function app_private.report_cost_snapshot(uuid) returns jsonb language sql as $$ select '{"material":100,"expense":50}'::jsonb $$;
 create view site_receivable_balances as select s.id,s.company_id,s.site_name,s.customer_name,s.status,s.contract_amount,s.deposit_amount,
 null::numeric opening_paid,null::date opening_date,null::date due_date,0 revision,false confirmed,null::numeric paid,null::numeric outstanding,null::numeric overpaid,s.contract_amount original_contract_amount,'missing'::text amount_source from sites s;
 create table trade_clients(id uuid primary key,company_id uuid,name text);
 create table trade_site_links(site_id uuid primary key,company_id uuid,client_id uuid);
 insert into companies values('${id(1)}',true),('${id(2)}',true);
 insert into profiles values('${id(10)}','${id(1)}','owner',true,'관리자'),('${id(11)}','${id(1)}','worker',true,'시공자'),('${id(12)}','${id(2)}','owner',true,'다른 업체');
 insert into sites values('${id(20)}','${id(1)}','현재 현장',null,'completed',null,0);
 insert into work_reports(id,company_id,site_id,review_status,approved_amount,reviewed_at,reviewed_by,updated_at) values('${id(30)}','${id(1)}','${id(20)}','approved',464200,'2026-10-27Z','${id(10)}','2026-10-27Z');
 insert into site_payment_accounts(site_id,company_id,opening_paid,opening_date,revision) values('${id(20)}','${id(1)}',100000,'2026-10-01',2);
 `);
 await db.exec(sql('tests/fixtures/receivables-base.sql'));
 await db.exec(sql('supabase/migrations/20261028034930_approved_report_customer_receivable.sql'));
 await db.exec(sql('supabase/migrations/20261028040046_editable_reviewed_amount.sql'));
 await db.exec('create trigger audit_work_report after insert or update on work_reports for each row execute function app_private.audit_work_report()');
 await db.exec(sql('supabase/migrations/20261028040241_customer_trade_receivables.sql'));
 await db.exec('alter table sites add column schedule_date date');
 await db.exec(sql('supabase/migrations/20261028042143_customer_unknown_receivables.sql'));
 await db.exec(sql('supabase/migrations/20261028072850_preserve_legacy_full_payment.sql'));
 const call=async(action='get',body={},user=10)=>(await db.query('select manage_site_settlement($1,$2,$3,$4::jsonb) r',[id(user),id(20),action,JSON.stringify(body)])).rows[0].r;
 return {db,call};
}
test('payment retries preserve a single ledger entry and stale writes fail',async()=>{
 const {db,call}=await fixture();try {
  const request={amount:'50000',requestId:id(60),revision:2,paidOn:'2026-10-27',direction:'payment',phase:'balance',method:'other',memo:'잔금 입금'};
  const first=await call('add',request);const replay=await call('add',request);
  assert.equal(first.site.paid,150000);assert.equal(replay.site.paid,150000);
  assert.equal(Number((await db.query('select count(*) n from site_payment_entries')).rows[0].n),1);
  await assert.rejects(call('add',{...request,amount:'51000'}),e=>e.code==='22023');
  await assert.rejects(call('add',{...request,requestId:id(61)}),e=>e.code==='40001');
  await assert.rejects(call('add',{...request,requestId:id(62)},12),e=>e.code==='42501');
 } finally { await db.close(); }
});
test('initial payment retries preserve the original total and request id',async()=>{
 const {db,call}=await fixture();try {
  await db.exec('delete from site_payment_accounts');
  const request={amount:'20000',requestId:id(70),revision:0,paidOn:'2026-10-27'};
  const first=await call('initialize',request);const replay=await call('initialize',request);
  assert.equal(first.site.paid,20000);assert.equal(replay.site.paid,20000);
  assert.equal(Number((await db.query('select count(*) n from site_payment_accounts')).rows[0].n),1);
  await assert.rejects(call('initialize',{...request,amount:'30000'}),e=>e.code==='22023');
  await assert.rejects(call('initialize',{...request,requestId:id(71)}),e=>e.code==='22023');
 } finally { await db.close(); }
});
test('lost response retries pass through both real API handlers without duplicating an entry',async()=>{
 const {db}=await fixture();const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 try {
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  const existingSource=sql('app/api/admin/receivables/route.js').replace(/^import .*;$/gm,'').replaceAll('export ','');
  const client={auth:{getUser:async()=>({data:{user:{id:id(10)}},error:null})},rpc:async(name,args)=>{
   try { const r=await db.query('select manage_site_settlement($1,$2,$3,$4::jsonb) result',[args.p_user,args.p_site,args.p_action,JSON.stringify(args.p_body)]);return {data:r.rows[0].result,error:null}; }
   catch(error) { return {data:null,error}; }
  }};
  const realPost=new Function('createClient','after','notifyCustomerStage','Response',existingSource+';return POST;')(()=>client,()=>{},()=>{},Response);
  let loseOnce=true;
  const delegatedPost=async request=>{const response=await realPost(request);if(loseOnce){loseOnce=false;throw Error('response lost');}return response;};
  const wrapperSource=sql('app/api/admin/assistant-receivables/route.js').replace(/^import .*;$/gm,'').replaceAll('export ','');
  const wrapperPost=new Function('authenticateAdmin','Response','existingGet','existingPost',wrapperSource+';return POST;')(
   async()=>({success:true,companyId:id(1),userId:id(10)}),Response,()=>{},delegatedPost);
  const body={siteId:id(20),requestId:id(80),action:'add',amount:'50000',revision:2,paidOn:'2026-10-27',phase:'balance',direction:'payment',method:'other',memo:'잔금 입금'};
  const send=()=>wrapperPost(new Request('https://example.test/api/admin/assistant-receivables',{method:'POST',headers:{'Authorization':'Bearer test','X-Assistant-Company':id(1),'Content-Type':'application/json'},body:JSON.stringify(body)}));
  assert.equal((await send()).status,503);
  const recovered=await send();assert.equal(recovered.status,200);assert.equal((await recovered.json()).site.paid,150000);
  assert.equal(Number((await db.query('select count(*) n from site_payment_entries where id=$1',[id(80)])).rows[0].n),1);
 } finally {
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  await db.close();
 }
});
