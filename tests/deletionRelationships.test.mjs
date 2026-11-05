import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002',w='00000000-0000-4000-8000-000000000003',r='00000000-0000-4000-8000-000000000004',l='00000000-0000-4000-8000-000000000005';
test('relationship cleanup retains work history, snapshots workers, scrubs only subject invitations and retries',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
   create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text,worker_ids uuid[] default '{}');
   create table account_deletion_blocks(user_id uuid);
   create table workers(id uuid,user_id uuid);
   create table worker_relationships(worker_id uuid,user_id uuid not null,ended_at timestamptz,accepted_at timestamptz);
   create table worker_relationship_invites(claimant uuid,expected_user uuid,claimant_email text,status text);
   create table work_history(worker_id uuid,amount integer);
   insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing','{}');
   insert into workers values('${w}','${u}');
   insert into worker_relationships values('${w}','${u}',null,'2026-01-01');
   insert into work_history values('${w}',250000);
   insert into worker_relationship_invites values('${u}','${u}','deleted@example.invalid','requested'),('${other}','${u}','keep@example.invalid','accepted');`);
  await db.exec(await readFile(new URL('../database/account_deletion_relationships.sql',import.meta.url),'utf8'));
  const scrub=()=>db.query('select scrub_account_relationships($1,$2)',[r,l]);
  await assert.rejects(scrub(),/Access block required/);
  await db.query('insert into account_deletion_blocks values($1)',[u]);
  await assert.rejects(db.query('select scrub_account_relationships($1,$2)',[r,other]),/Invalid deletion lease/);
  await scrub();await scrub();
  const relation=(await db.query('select user_id,ended_at is not null ended,accepted_at::date::text accepted from worker_relationships')).rows[0];
  assert.deepEqual(relation,{user_id:null,ended:true,accepted:'2026-01-01'});
  assert.deepEqual((await db.query('select worker_ids from account_deletion_requests')).rows[0].worker_ids,[w]);
  assert.equal((await db.query('select amount from work_history')).rows[0].amount,250000);
  const invites=(await db.query('select * from worker_relationship_invites order by status')).rows;
  assert.equal(invites[0].claimant,other);assert.equal(invites[0].claimant_email,'keep@example.invalid');
  assert.deepEqual(invites[1],{claimant:null,expected_user:null,claimant_email:null,status:'cancelled'});
  await assert.rejects(db.query('insert into worker_relationships(worker_id,user_id) values($1,$2)',[other,u]),e=>e.code==='42501');
  await assert.rejects(db.exec('insert into worker_relationships(user_id) values(null)'),e=>e.code==='23514');
 }finally{await db.close();}
});
