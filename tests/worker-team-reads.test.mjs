import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../database/worker_team_message_reads.sql',import.meta.url),'utf8');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
test('recipient snapshot deduplicates, excludes sender; each own read decrements once; other day/site cannot change counts',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema app_private;
 create table auth.users(id uuid primary key);create table companies(id uuid primary key);create table sites(id uuid primary key);
 create table profiles(id uuid,company_id uuid,role text,is_active boolean);create table workers(id uuid,user_id uuid,company_id uuid,is_active boolean);
 create table site_daily_assignments(worker_id uuid,company_id uuid,site_id uuid,work_date date);
 create table worker_team_messages(id uuid primary key,company_id uuid,site_id uuid,work_date date,sender_id uuid,body text);
 insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
 insert into profiles values('${id(1)}','${id(10)}','owner',true),('${id(4)}','${id(20)}','owner',true);
 insert into workers values('${id(21)}','${id(2)}','${id(10)}',true),('${id(22)}','${id(2)}','${id(10)}',true),('${id(23)}','${id(3)}','${id(10)}',true);
 insert into site_daily_assignments values('${id(21)}','${id(10)}','${id(30)}','2026-10-22'),('${id(22)}','${id(10)}','${id(30)}','2026-10-22'),('${id(23)}','${id(10)}','${id(30)}','2026-10-22');`);
 await db.exec(sql);
 await db.exec(`insert into worker_team_messages(id,company_id,site_id,work_date,sender_id,body) values('${id(40)}','${id(10)}','${id(30)}','2026-10-22','${id(1)}','안녕하세요')`);
 const count=async()=>Number((await db.query('select * from public.team_message_read_counts($1)',[[id(40)]])).rows[0].unread_count);
 const mark=(user,site=id(30),day='2026-10-22')=>db.query('select public.mark_team_messages_read($1,$2,$3,$4,$5)',[user,id(10),site,day,[id(40)]]);
 assert.equal(await count(),2);await mark(id(2),id(31));assert.equal(await count(),2);await mark(id(2),id(30),'2026-10-23');assert.equal(await count(),2);await mark(id(4));assert.equal(await count(),2);
 await mark(id(2));assert.equal(await count(),1);const before=(await db.query('select read_at from worker_team_message_reads where user_id=$1',[id(2)])).rows[0].read_at;await mark(id(2));assert.equal(await count(),1);assert.equal(String((await db.query('select read_at from worker_team_message_reads where user_id=$1',[id(2)])).rows[0].read_at),String(before));
 await mark(id(3));assert.equal(await count(),0);
 // Re-running setup preserves reads and never adds newly assigned users to already captured recipients.
 await db.exec(`insert into workers values('${id(24)}','${id(4)}','${id(10)}',true);insert into site_daily_assignments values('${id(24)}','${id(10)}','${id(30)}','2026-10-22')`);
 await db.exec(sql);assert.equal(await count(),0);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from worker_team_message_reads'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
