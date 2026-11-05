import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
const id='00000000-0000-4000-8000-000000000001';
test('verified submissions enter processing atomically without reclaiming active or expired leases',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table account_deletion_requests(id uuid primary key,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz,attempts int default 0,updated_at timestamptz);insert into account_deletion_requests(id,user_id,identity_verified,scope,status) values('${id}','${id}',true,'personal_account','review_required');`);
 await db.exec(await readFile(new URL('../database/account_deletion_retry_safety.sql',import.meta.url),'utf8'));
 const claim=()=>db.query('select * from claim_account_deletion_request($1)',[id]);
 const first=(await claim()).rows[0];assert.equal(first.status,'processing');assert.equal(first.attempts,1);assert.ok(first.lease_token);assert.equal(first.subject_id,id);
 assert.equal((await claim()).rows.length,0);
 await db.exec("update account_deletion_requests set lease_until=clock_timestamp()-interval '1 minute'");assert.equal((await claim()).rows.length,0);
 for(const change of ["identity_verified=false,status='review_required'","identity_verified=true,scope='company',status='review_required'","identity_verified=true,scope='personal_account',status='completed'"]){await db.exec('update account_deletion_requests set lease_token=null,'+change);assert.equal((await claim()).rows.length,0);}
 assert.equal((await db.query("select has_function_privilege('authenticated','claim_account_deletion_request(uuid)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
