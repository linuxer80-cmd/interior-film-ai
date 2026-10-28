import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=fs.readFileSync(new URL('../supabase/migrations/20261028232211_announcement_realtime_invalidation.sql',import.meta.url),'utf8');
const uid='00000000-0000-0000-0000-000000000001';
test('notice events are private, audience-specific, and never contain the notice text',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated;create role service_role bypassrls;
   create schema auth;create schema realtime;create schema app_private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function realtime.topic() returns text language sql as $$select current_setting('test.topic',true)$$;
   create table public.app_announcement(id integer primary key,message text,enabled boolean);
   create table realtime.messages(extension text,topic text,event text,payload jsonb,private boolean);
   alter table realtime.messages enable row level security;
   grant usage on schema realtime,auth,app_private to authenticated,service_role;
   grant select on realtime.messages to authenticated;
   grant all on realtime.messages,public.app_announcement to service_role;
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$insert into realtime.messages values('broadcast',$3,$2,$1,$4)$$;`);
  await db.exec(migration);
  await db.exec("set role service_role;insert into public.app_announcement values(1,'private owner notice',true),(2,'private worker notice',true);reset role;");
  const events=(await db.query('select * from realtime.messages order by topic')).rows;
  assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.topic),['announcement:owner','announcement:worker']);
  assert.ok(events.every(e=>e.private&&e.event==='changed'&&JSON.stringify(e.payload)==='{}'&&!JSON.stringify(e).includes('private owner notice')));
  async function access(user,topic){
   await db.query("select set_config('test.uid',$1,false),set_config('test.topic',$2,false)",[user,topic]);
   await db.exec('set role authenticated');try{return (await db.query('select topic from realtime.messages')).rows.map(r=>r.topic);}finally{await db.exec('reset role');}
  }
  assert.deepEqual(await access(uid,'announcement:owner'),['announcement:owner']);
  assert.deepEqual(await access(uid,'announcement:worker'),['announcement:worker']);
  assert.deepEqual(await access(uid,'announcement:other'),[]);assert.deepEqual(await access('','announcement:owner'),[]);
  await db.exec("create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$begin raise exception 'simulated unavailable realtime';end$$");
  await db.exec("set role service_role;update public.app_announcement set message='still saved' where id=1;reset role;");
  assert.equal((await db.query('select message from app_announcement where id=1')).rows[0].message,'still saved');
 }finally{await db.close();}
});
