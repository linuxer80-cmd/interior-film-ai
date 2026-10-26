import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('stage reservation charges each eligible stage once and requires confirmed full payment',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid,company_id uuid,role text,is_active boolean);
 create table companies(id uuid,is_active boolean);
 create table sites(id uuid,company_id uuid,status text,work_dates date[],schedule_end timestamptz,schedule_start timestamptz,schedule_date date,contract_amount numeric);
 create table work_reports(company_id uuid,site_id uuid,review_status text,reviewed_at timestamptz);
 create table site_receivable_balances(id uuid,company_id uuid,paid numeric,confirmed boolean);
 create table alimtalk_accounts(company_id uuid,enabled boolean,available_count int,updated_at timestamptz);
 create table alimtalk_deliveries(id uuid,company_id uuid,site_id uuid,kind text,recipient_mask text,template_code text,content_hash text,created_by uuid,credit_exempt boolean);
 insert into companies values('10000000-0000-4000-8000-000000000001',true);
 insert into profiles values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner',true);
 insert into sites values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','completed',array[current_date-1],null,null,null,1000);
 insert into work_reports values('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','pending',null);
 insert into site_receivable_balances values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',300,true);
 insert into alimtalk_accounts values('10000000-0000-4000-8000-000000000001',true,5,now());`);
 await db.exec(fs.readFileSync(new URL('../database/customer_stage_alimtalk.sql',import.meta.url),'utf8'));
 const reserve=stage=>db.query(`select reserve_customer_stage('40000000-0000-4000-8000-00000000000${stage==='complete'?1:2}','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','${stage}','010-****-0000','template',repeat('a',64)) as r`);
 assert.equal((await reserve('complete')).rows[0].r.accepted,false);
 await db.exec("update work_reports set review_status='approved',reviewed_at=now()");
 assert.equal((await reserve('complete')).rows[0].r.accepted,true);
 assert.equal((await reserve('complete')).rows[0].r.reason,'duplicate');
 assert.equal((await reserve('care')).rows[0].r.accepted,false);
 await db.exec("update site_receivable_balances set paid=1000");
 assert.equal((await reserve('care')).rows[0].r.accepted,true);
 assert.equal((await reserve('care')).rows[0].r.reason,'duplicate');
 assert.equal((await db.query('select available_count from alimtalk_accounts')).rows[0].available_count,3);
 assert.equal((await db.query("select has_function_privilege('anon','reserve_customer_stage(uuid,uuid,uuid,uuid,text,text,text,text)','execute') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
