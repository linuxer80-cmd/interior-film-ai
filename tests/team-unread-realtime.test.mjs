import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration=fs.readFileSync(new URL('../supabase/migrations/20261028225047_team_unread_realtime_notifications.sql',import.meta.url),'utf8');
const user1='00000000-0000-0000-0000-000000000001',user2='00000000-0000-0000-0000-000000000002';
test('unread events are private, content-free and coalesce each read batch per user',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema realtime; create schema app_private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function realtime.topic() returns text language sql as $$select current_setting('test.topic',true)$$;
   create table public.worker_team_message_reads(message_id uuid,user_id uuid,read_at timestamptz,primary key(message_id,user_id));
   create table realtime.messages(extension text,topic text,event text,payload jsonb,private boolean);
   alter table realtime.messages enable row level security;
   grant usage on schema realtime,auth to authenticated; grant select on realtime.messages to authenticated;
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$insert into realtime.messages values ('broadcast',$3,$2,$1,$4)$$;`);
  await db.exec(migration);
  await db.query(`insert into worker_team_message_reads values
   ('00000000-0000-0000-0000-000000000011',$1,null),('00000000-0000-0000-0000-000000000012',$1,null),
   ('00000000-0000-0000-0000-000000000013',$2,null)`,[user1,user2]);
  let events=(await db.query('select * from realtime.messages')).rows;
  assert.equal(events.length,2);assert.ok(events.every(e=>e.private&&e.event==='changed'&&JSON.stringify(e.payload)==='{}'));
  await db.query('update worker_team_message_reads set read_at=now() where user_id=$1',[user1]);
  events=(await db.query('select * from realtime.messages')).rows;assert.equal(events.length,3);
  await db.query('update worker_team_message_reads set read_at=read_at where user_id=$1',[user1]);
  assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n,3);
  await db.query('delete from worker_team_message_reads where user_id=$1',[user1]);
  assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n,4);
  async function access(uid,topic){
   await db.query("select set_config('test.uid',$1,false),set_config('test.topic',$2,false)",[uid,topic]);
   await db.exec('set role authenticated');try{return (await db.query('select count(*)::int n from realtime.messages')).rows[0].n;}finally{await db.exec('reset role');}
  }
  assert.equal(await access(user1,'team-unread:'+user1),4);
  assert.equal(await access(user2,'team-unread:'+user1),0);
  assert.equal(await access(user1,'team-unread:'+user2),0);
 }finally{await db.close();}
});
