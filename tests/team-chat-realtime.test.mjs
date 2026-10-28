import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration=fs.readFileSync(new URL('../supabase/migrations/20261028224606_team_chat_realtime_notifications.sql',import.meta.url),'utf8');
const ids={company:'00000000-0000-0000-0000-000000000001',site:'00000000-0000-0000-0000-000000000002',owner:'00000000-0000-0000-0000-000000000003',worker:'00000000-0000-0000-0000-000000000004',workerId:'00000000-0000-0000-0000-000000000005',other:'00000000-0000-0000-0000-000000000006',msg:'00000000-0000-0000-0000-000000000007'};
test('private team chat events enforce site and date access and carry no message data',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema realtime; create schema app_private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function realtime.topic() returns text language sql as $$select current_setting('test.topic',true)$$;
   create table public.companies(id uuid primary key,is_active boolean);
   create table public.sites(id uuid primary key,company_id uuid,status text,work_dates date[]);
   create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
   create table public.workers(id uuid primary key,company_id uuid,user_id uuid,is_active boolean);
   create table public.site_daily_assignments(company_id uuid,site_id uuid,worker_id uuid,work_date date);
   create table public.worker_team_messages(id uuid primary key,site_id uuid,work_date date,body text);
   create table public.worker_team_message_reads(message_id uuid,user_id uuid,read_at timestamptz);
   create table realtime.messages(extension text,topic text,event text,payload jsonb,private boolean);
   alter table realtime.messages enable row level security;
   grant usage on schema realtime to authenticated; grant select on realtime.messages to authenticated;
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$insert into realtime.messages values ('broadcast',$3,$2,$1,$4)$$;`);
  await db.exec(migration);
  await db.query('insert into companies values ($1,true)',[ids.company]);
  await db.query("insert into sites values ($1,$2,'active',array['2026-10-29'::date])",[ids.site,ids.company]);
  await db.query("insert into profiles values ($1,$2,'owner',true)",[ids.owner,ids.company]);
  await db.query('insert into workers values ($1,$2,$3,true)',[ids.workerId,ids.company,ids.worker]);
  await db.query("insert into site_daily_assignments values ($1,$2,$3,'2026-10-29')",[ids.company,ids.site,ids.workerId]);
  await db.query("insert into worker_team_messages values ($1,$2,'2026-10-29','private text')",[ids.msg,ids.site]);
  await db.query('insert into worker_team_message_reads values ($1,$2,null)',[ids.msg,ids.worker]);
  await db.query('update worker_team_message_reads set read_at=now() where message_id=$1',[ids.msg]);
  const events=(await db.query('select * from realtime.messages')).rows;
  assert.equal(events.length,2);assert.ok(events.every(e=>e.private&&e.event==='changed'&&JSON.stringify(e.payload)==='{}'&&!JSON.stringify(e).includes('private text')));
  async function access(user,date){
   await db.query("select set_config('test.uid',$1,false),set_config('test.topic',$2,false)",[user,`team-chat:${ids.site}:${date}`]);
   await db.exec('set role authenticated');
   try{return (await db.query('select count(*)::int as n from realtime.messages')).rows[0].n;}finally{await db.exec('reset role');}
  }
  assert.equal(await access(ids.worker,'2026-10-29'),2);
  assert.equal(await access(ids.worker,'2026-10-30'),0);
  assert.equal(await access(ids.other,'2026-10-29'),0);
  assert.equal(await access(ids.owner,'2026-10-29'),2);
  await db.query('update workers set is_active=false where id=$1',[ids.workerId]);
  assert.equal(await access(ids.worker,'2026-10-29'),0);
  await db.query('update companies set is_active=false where id=$1',[ids.company]);
  assert.equal(await access(ids.owner,'2026-10-29'),0);
 }finally{await db.close();}
});
