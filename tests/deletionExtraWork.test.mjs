import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004',c='00000000-0000-4000-8000-000000000005',s='00000000-0000-4000-8000-000000000006';
test('extra work cleanup preserves billing and history; anonymous requester cannot be cancelled by another user',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);
 create table companies(id uuid primary key,is_active boolean);
 create table sites(id uuid primary key,company_id uuid,status text,contract_amount numeric);
 create table profiles(id uuid,company_id uuid,role text,is_active boolean);
 create table work_reports(id uuid,site_id uuid,company_id uuid,review_status text,approved_amount numeric,updated_at timestamptz);
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 insert into auth.users values('${u}'),('${o}');insert into companies values('${c}',true);
 insert into sites values('${s}','${c}','scheduled',500000);
 insert into profiles values('${o}','${c}','owner',true);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');`);
 await db.exec(await readFile(new URL('../database/site_extra_work.sql',import.meta.url),'utf8'));
 await db.query(`insert into site_extra_work(id,company_id,site_id,requested_by,request_id,description,status,approved_amount,reviewed_by,reviewed_at,photo_paths) values($1,$3,$4,$5,$1,'pending work','pending',null,null,null,'[]'),($2,$3,$4,$6,$2,'approved work','approved',50000,$5,now(),'["existing/photo.jpg"]')`,[r,l,c,s,u,o]);
 await db.exec(await readFile(new URL('../database/account_deletion_extra_work.sql',import.meta.url),'utf8'));
 const snapshot=async()=>(await db.query("select to_jsonb(t)-'requested_by'-'reviewed_by' value from site_extra_work t order by id")).rows;
 const before=await snapshot();const scrub=()=>db.query('select scrub_account_extra_work_actors($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);await db.query('insert into account_deletion_blocks values($1)',[u]);
 await assert.rejects(db.query('select scrub_account_extra_work_actors($1,$2)',[r,o]),/Invalid deletion lease/);
 await scrub();await scrub();assert.deepEqual(await snapshot(),before);
 assert.deepEqual((await db.query('select requested_by,reviewed_by from site_extra_work order by id')).rows,[{requested_by:null,reviewed_by:null},{requested_by:o,reviewed_by:null}]);
 await assert.rejects(db.query("select review_site_extra_work($1,$2,$3,'cancel')",[o,s,r]),/본인 요청만/);
 assert.equal((await db.query('select contract_amount from sites')).rows[0].contract_amount,'500000');
 await db.query("select review_site_extra_work($1,$2,$3,'approve',25000)",[o,s,r]);
 assert.equal((await db.query('select contract_amount from sites')).rows[0].contract_amount,'525000');
 await assert.rejects(db.query("select review_site_extra_work($1,$2,$3,'approve',25000)",[o,s,r]),/이미 처리된/);
 assert.equal((await db.query('select contract_amount from sites')).rows[0].contract_amount,'525000');
 }finally{await db.close();}
});
