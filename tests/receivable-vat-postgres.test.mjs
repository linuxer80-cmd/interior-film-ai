import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('receivables collect customer contract plus VAT without changing supply, payments or report fallback',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create table sites(id text,company_id text,site_name text,customer_name text,status text,contract_amount numeric(14,2),deposit_amount numeric);
   create table site_payment_accounts(site_id text,company_id text,opening_paid numeric,opening_date date,due_date date,revision integer);
   create table work_reports(id text,site_id text,company_id text,review_status text,approved_amount numeric,updated_at timestamptz);
   create table site_payment_entries(site_id text,company_id text,direction text,amount numeric,voided_at timestamptz);
   create view site_receivable_balances as select s.id,s.company_id,s.site_name,s.customer_name,s.status,s.contract_amount,s.deposit_amount,
    null::numeric opening_paid,null::date opening_date,null::date due_date,0 revision,false confirmed,
    null::numeric paid,null::numeric outstanding,null::numeric overpaid,s.contract_amount original_contract_amount,'missing'::text amount_source from sites s;
   insert into sites values('contract','owner','contract site',null,'completed',1950000,0),('report','owner','report site',null,'completed',null,0),('missing','owner','missing site',null,'completed',null,0),('round','owner','rounding site',null,'completed',10005,0);
   insert into site_payment_accounts values('contract','owner',200000,current_date,null,1),('report','owner',100000,current_date,null,0);
   insert into work_reports values('r1','report','owner','approved',250000,now()),('r2','contract','owner','approved',280000,now());
   insert into site_payment_entries values('contract','owner','payment',350000,null),('contract','owner','refund',50000,null),('contract','other','payment',9999999,null),('contract','owner','payment',9999999,now());
  `);
  const source=fs.readFileSync(new URL('../database/site_receivable_approved_amount.sql',import.meta.url),'utf8');
  await db.exec(source);
  const get=async id=>(await db.query('select * from site_receivable_balances where id=$1',[id])).rows[0];
  const row=await get('contract');
  assert.equal(Number(row.supply_amount),1950000);assert.equal(Number(row.vat_amount),195000);
  assert.equal(Number(row.contract_amount),2145000);assert.equal(Number(row.original_contract_amount),1950000);
  assert.equal(Number(row.paid),500000);assert.equal(Number(row.outstanding),1645000);assert.equal(Number(row.overpaid),0);
  assert.equal(Number((await db.query("select contract_amount from sites where id='contract'")).rows[0].contract_amount),1950000);
  const fallback=await get('report');assert.equal(fallback.amount_source,'approved_report');
  assert.equal(Number(fallback.contract_amount),250000);assert.equal(fallback.vat_amount,null);assert.equal(Number(fallback.outstanding),150000);
  const missing=await get('missing');assert.equal(missing.contract_amount,null);assert.equal(missing.vat_amount,null);assert.equal(missing.outstanding,null);
  const rounded=await get('round');assert.equal(Number(rounded.vat_amount),1001);assert.equal(Number(rounded.contract_amount),11006);assert.equal(rounded.paid,null);
  // A full-payment action uses the returned payable contract amount. Supply-only payment remains unpaid.
  await db.exec("update site_payment_accounts set opening_paid=1650000 where site_id='contract'");
  assert.equal(Number((await get('contract')).outstanding),195000);
  await db.exec("update site_payment_accounts set opening_paid=1845000 where site_id='contract'");
  assert.equal(Number((await get('contract')).outstanding),0);
  await db.exec("update site_payment_accounts set opening_paid=1900000 where site_id='contract'");
  assert.equal(Number((await get('contract')).overpaid),55000);
  await db.exec(source); // Reapplying the definition must not add VAT twice.
  assert.equal(Number((await get('contract')).contract_amount),2145000);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261028034930_approved_report_customer_receivable.sql',import.meta.url),'utf8'));
  const reviewed=await get('report');
  assert.equal(Number(reviewed.supply_amount),250000);assert.equal(Number(reviewed.vat_amount),25000);assert.equal(Number(reviewed.contract_amount),275000);assert.equal(Number(reviewed.paid),100000);assert.equal(Number(reviewed.outstanding),175000);
  assert.equal(Number((await get('contract')).contract_amount),2145000);
  await db.exec("update work_reports set review_status='pending' where id='r1'");assert.equal((await get('report')).supply_amount,null);
  await db.exec("update work_reports set review_status='approved',approved_amount=0 where id='r1'");assert.equal((await get('report')).supply_amount,null);
  const options=(await db.query("select reloptions from pg_class where oid='site_receivable_balances'::regclass")).rows[0].reloptions;
  assert.ok(options.includes('security_invoker=true'));
 }finally{await db.close();}
});
