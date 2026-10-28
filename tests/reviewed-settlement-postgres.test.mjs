import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {customerStageState} from '../lib/customerStages.mjs';
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
 const call=async(action='get',body={},user=10)=>(await db.query('select manage_site_settlement($1,$2,$3,$4::jsonb) r',[id(user),id(20),action,JSON.stringify(body)])).rows[0].r;
 return {db,call};
}
test('review amount edits recalculate VAT/customer balance atomically, preserve payments and audit exactly once',async()=>{
 const {db,call}=await fixture();try{
 const before=await call();assert.equal(before.approvedReport.amount,464200);
 const request={amount:'500000',reportId:before.approvedReport.id,reportUpdatedAt:before.approvedReport.updatedAt,revision:2};
 const updated=await call('revise_approved_amount',request);
 assert.equal(updated.site.supply_amount,500000);assert.equal(updated.site.vat_amount,50000);assert.equal(updated.site.contract_amount,550000);
 assert.equal(updated.site.paid,100000);assert.equal(updated.site.outstanding,450000);assert.equal(updated.site.revision,3);assert.equal(updated.entries.length,0);
 const state=customerStageState({status:'completed',contract_amount:null},[{review_status:'approved',reviewed_at:'2026-10-27'}],updated.site,'2026-10-28');
 assert.equal(state.totalAmount,550000);assert.equal(state.outstanding,450000);
 const report=(await db.query('select * from work_reports')).rows[0];assert.equal(report.review_status,'approved');assert.equal(new Date(report.reviewed_at).toISOString(),'2026-10-27T00:00:00.000Z');
 const history=(await db.query('select * from work_report_history')).rows;
 assert.equal(history.length,1);assert.equal(history[0].event,'edit');assert.equal(history[0].before_cost.approved_amount,464200);assert.equal(history[0].after_cost.approved_amount,500000);assert.equal(history[0].actor_id,id(10));
 await call('revise_approved_amount',request);assert.equal((await db.query('select count(*) n from work_report_history')).rows[0].n,1);assert.equal((await call()).site.revision,3);
 await assert.rejects(call('revise_approved_amount',{...request,amount:'600000'}),e=>e.code==='40001');
 for(const amount of ['','0','-1','1.5','NaN','Infinity','1000000000001'])await assert.rejects(call('revise_approved_amount',{...request,amount}),e=>e.code.startsWith('22'));
 for(const user of [11,12])await assert.rejects(call('revise_approved_amount',request,user),e=>e.code==='42501');
 // Existing payment write still delegates to the real production ledger function.
 const paid=await call('add',{amount:50000,requestId:id(60),revision:3,paidOn:'2026-10-27',direction:'payment',phase:'balance',method:'bank',memo:'입금'});
 assert.equal(paid.site.paid,150000);assert.equal(paid.approvedReport.amount,500000);
 await db.exec(`update sites set contract_amount=800000 where id='${id(20)}'`);
 const current=await call();const changed=await call('revise_approved_amount',{amount:400000,reportId:id(30),reportUpdatedAt:current.approvedReport.updatedAt,revision:current.site.revision});
 assert.equal(changed.site.amount_source,'contract');assert.equal(changed.site.contract_amount,880000);assert.equal(changed.approvedReport.amount,400000);
 await db.exec('delete from site_payment_accounts;update sites set contract_amount=null');
 const unknown=await call();const corrected=await call('revise_approved_amount',{amount:300000,reportId:id(30),reportUpdatedAt:unknown.approvedReport.updatedAt,revision:0});
 assert.equal(corrected.site.confirmed,false);assert.equal(corrected.site.paid,null);assert.equal(corrected.site.outstanding,null);
 await db.exec("update work_reports set review_status='pending'");assert.equal((await call()).approvedReport,null);
 await assert.rejects(call('revise_approved_amount',request),e=>e.code==='22023');
 for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','manage_site_settlement(uuid,uuid,text,jsonb)','execute') ok`)).rows[0].ok,false);
 }finally{await db.close();}
});
test('customer trade debt keeps unknown balances out of totals while showing scoped billing details',async()=>{
 const {db}=await fixture();try{
 await db.exec(`insert into trade_clients values('${id(40)}','${id(1)}','거래처'),('${id(41)}','${id(1)}','다른 거래처'),('${id(42)}','${id(2)}','다른 업체 거래처');
 insert into trade_site_links values('${id(20)}','${id(1)}','${id(40)}');`);
 for(const [n,status,confirmed,client,company] of [[21,'completed',true,40,1],[22,'completed',false,40,1],[23,'cancelled',true,40,1],[24,'scheduled',true,40,1],[25,'completed',true,41,1],[26,'completed',true,42,2],[27,'completed',true,40,1]]){
  await db.query('insert into sites values($1,$2,$3,null,$4,100000,0)',[id(n),id(company),'현장'+n,status]);
  await db.query('insert into trade_site_links values($1,$2,$3)',[id(n),id(company),id(client)]);
  if(confirmed)await db.query("insert into site_payment_accounts(site_id,company_id,opening_paid,opening_date) values($1,$2,$3,'2026-10-01')",[id(n),id(company),n===27?110000:30000]);
 }
 const load=async(company=1,site=20)=>(await db.query('select customer_trade_receivables($1,$2) r',[id(company),id(site)])).rows[0].r;
 const result=await load();assert.equal(result.previousTotal,80000);assert.equal(result.count,1);assert.equal(result.unknownCount,1);
 assert.equal(result.items[0].siteName,'현장21');assert.equal(result.items[0].supplyAmount,100000);assert.equal(result.items[0].vatAmount,10000);
 assert.deepEqual(Object.keys(result.items[0]).sort(),['siteName','supplyAmount','vatAmount','totalAmount','paid','outstanding'].sort());
 assert.equal(result.unknownItems.length,1);assert.equal(result.unknownItems[0].siteName,'현장22');
 assert.equal(result.unknownItems[0].totalAmount,110000);assert.equal(result.unknownItems[0].paid,null);assert.equal(result.unknownItems[0].outstanding,null);
 assert.deepEqual(Object.keys(result.unknownItems[0]).sort(),['siteName','scheduleDate','supplyAmount','vatAmount','totalAmount','paid','outstanding'].sort());
 assert.equal(await load(2,20),null);assert.equal(await load(1,99),null);
 // Current site's paid amount must not offset previous debt, and VAT must not be added a second time.
 await db.exec(`update site_payment_accounts set opening_paid=999999 where site_id='${id(20)}'`);assert.equal((await load()).previousTotal,80000);
 await db.exec(`update site_payment_accounts set opening_paid=110000 where site_id='${id(21)}'`);assert.equal((await load()).previousTotal,0);
 for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','customer_trade_receivables(uuid,uuid)','execute') ok`)).rows[0].ok,false);
 }finally{await db.close();}
});
