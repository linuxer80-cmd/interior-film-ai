import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('referral cleanup preserves earned counts and other recipient, revokes links and rejects reuse',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid,created_at timestamptz);
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table app_referrals(id uuid primary key default gen_random_uuid(),token text default gen_random_uuid()::text,inviter uuid not null,subject_key text,recipient uuid,created_at timestamptz default now(),expires_at timestamptz default now()+interval '30 days',shared_at timestamptz,joined_at timestamptz);
 create function referral_subject(uuid,text) returns text language sql as $$select 'user:'||$1::text$$;
 insert into auth.users values('${u}',now()),('${o}',now());
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into app_referrals(token,inviter,subject_key,recipient,shared_at,joined_at) values('incoming','${o}','user:${o}','${u}',now(),now()),('outgoing','${u}','user:${u}','${o}',now(),now()),('unused','${u}','user:${u}',null,null,null);`);
 await db.exec(await readFile(new URL('../database/account_deletion_referrals.sql',import.meta.url),'utf8'));
 const metrics=async()=>(await db.query("select referral_metrics($1,'worker') m",['user:'+o])).rows[0].m;
 const before=await metrics();const scrub=()=>db.query('select scrub_account_referrals($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);await db.query('insert into account_deletion_blocks values($1)',[u]);
 await assert.rejects(db.query('select scrub_account_referrals($1,$2)',[r,o]),/Invalid deletion lease/);
 await scrub();const snapshot=(await db.query('select * from app_referrals order by id')).rows;await scrub();assert.deepEqual((await db.query('select * from app_referrals order by id')).rows,snapshot);
 assert.deepEqual(await metrics(),before);
 assert.equal((await db.query('select count(*)::int n from app_referrals where inviter=$1 or recipient=$1 or subject_key=$2',[u,'user:'+u])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from app_referrals where recipient=$1',[o])).rows[0].n,1);
 for(const token of ['incoming','outgoing','unused'])await assert.rejects(db.query("select referral_action($1,'claim',jsonb_build_object('token',$2::text))",[o,token]),/유효하지 않은/);
 const token=snapshot.find(x=>x.recipient_deleted).token;
 await assert.rejects(db.query("select referral_action($1,'claim',jsonb_build_object('token',$2::text))",[r,token]),/이미 사용되었거나/);
 await assert.rejects(db.query("select referral_action($1,'create')",[u]),/Account deletion in progress/);
 }finally{await db.close();}
});
