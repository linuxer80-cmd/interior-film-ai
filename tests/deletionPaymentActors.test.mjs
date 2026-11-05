import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('payment actor cleanup preserves ledger amounts, cancellation timestamps, other actors and retry results',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table labor_payment_records(id int,created_by uuid not null,cancelled_by uuid,cancelled_at timestamptz,amount bigint,memo text, constraint labor_payment_records_check check((cancelled_at is null)=(cancelled_by is null)));
 create table site_payment_accounts(created_by uuid not null,updated_by uuid not null,opening_paid numeric,revision int);
 create table site_payment_entries(created_by uuid not null,voided_by uuid,voided_at timestamptz,amount numeric,direction text);
 create table trade_payment_batches(created_by uuid not null,amount numeric,voided_at timestamptz);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into labor_payment_records values(1,'${o}','${u}','2026-01-01',250000,'retain'),(2,'${u}',null,null,300000,'paid'),(3,'${o}','${o}','2026-02-01',100000,'other');
 insert into site_payment_accounts values('${u}','${o}',100000,3);
 insert into site_payment_entries values('${o}','${u}','2026-01-01',10000,'refund'),('${u}',null,null,200000,'payment');
 insert into trade_payment_batches values('${u}',200000,null);`);
 await db.exec(await readFile(new URL('../database/account_deletion_payment_actors.sql',import.meta.url),'utf8'));
 const snapshot=async()=>Promise.all(['labor_payment_records','site_payment_accounts','site_payment_entries','trade_payment_batches'].map(async table=>(await db.query(`select to_jsonb(t)-'created_by'-'updated_by'-'cancelled_by'-'voided_by'-'cancelled_actor_deleted' as row from ${table} t`)).rows));
 const before=await snapshot();const scrub=()=>db.query('select scrub_account_payment_actors($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);
 await db.query('insert into account_deletion_blocks values($1)',[u]);
 await assert.rejects(db.query('select scrub_account_payment_actors($1,$2)',[r,o]),/Invalid deletion lease/);
 await scrub();await scrub();
 // UPDATE may change physical row order; compare canonical serialized records.
 const canonical=sets=>sets.map(rows=>rows.map(r=>JSON.stringify(r)).sort());
 assert.deepEqual(canonical(await snapshot()),canonical(before));
 assert.deepEqual((await db.query('select id,created_by,cancelled_by,cancelled_actor_deleted from labor_payment_records order by id')).rows,[{id:1,created_by:o,cancelled_by:null,cancelled_actor_deleted:true},{id:2,created_by:null,cancelled_by:null,cancelled_actor_deleted:false},{id:3,created_by:o,cancelled_by:o,cancelled_actor_deleted:false}]);
 await assert.rejects(db.exec("insert into labor_payment_records(created_by,cancelled_at) values('"+o+"',now())"),e=>e.code==='23514');
 await assert.rejects(db.exec('update labor_payment_records set cancelled_at=null where id=1'),e=>e.code==='23514');
 }finally{await db.close();}
});
