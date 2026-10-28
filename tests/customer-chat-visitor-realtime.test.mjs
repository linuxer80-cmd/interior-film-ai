import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=fs.readFileSync(new URL('../supabase/migrations/20261028230409_customer_chat_visitor_realtime.sql',import.meta.url),'utf8');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('visitor events use private unguessable topics and never expose chat content or other topics',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;create schema app_private;create schema extensions;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function realtime.topic() returns text language sql as $$select current_setting('test.topic',true)$$;
   create function extensions.gen_random_bytes(int) returns bytea language sql volatile as $$select decode(md5(random()::text)||md5(random()::text),'hex')$$;
   create table public.customer_chat_threads(id uuid primary key,customer_name text);
   create table public.customer_chat_messages(id uuid primary key,thread_id uuid,sender text,body text);
   create table realtime.messages(extension text,topic text,event text,payload jsonb,private boolean);
   alter table realtime.messages enable row level security;
   grant usage on schema realtime,auth to anon,authenticated;grant select on realtime.messages to anon,authenticated;
   create function app_private.can_receive_customer_chat_admin(text) returns boolean language sql as $$select $1='admin:mine'$$;
   create function app_private.can_receive_team_chat(text) returns boolean language sql as $$select false$$;
   grant usage on schema app_private to authenticated; grant execute on function app_private.can_receive_customer_chat_admin(text),app_private.can_receive_team_chat(text) to authenticated;
   create policy "customer chat admin receive invalidations" on realtime.messages for select to authenticated using (app_private.can_receive_customer_chat_admin((select realtime.topic())));
   create policy "team chat receive invalidations" on realtime.messages for select to authenticated using (app_private.can_receive_team_chat((select realtime.topic())));
   create policy "team unread receive own invalidations" on realtime.messages for select to authenticated using ((select realtime.topic())='team-unread:'||(select auth.uid())::text);
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$insert into realtime.messages values('broadcast',$3,$2,$1,$4)$$;`);
  await db.query("insert into customer_chat_threads values($1,'private name')",[id(1)]);
  await db.exec(migration);
  await db.query("insert into customer_chat_threads(id,customer_name) values($1,'private second name')",[id(2)]);
  const topics=(await db.query('select id,visitor_realtime_topic from customer_chat_threads order by id')).rows;
  assert.match(topics[0].visitor_realtime_topic,/^customer-chat-visitor:[a-f0-9]{64}$/);assert.notEqual(topics[0].visitor_realtime_topic,topics[1].visitor_realtime_topic);
  await db.query("insert into customer_chat_messages values($1,$2,'customer','customer private text'),($3,$2,'owner','owner private reply'),($4,$5,'owner','other private reply')",[id(11),id(1),id(12),id(13),id(2)]);
  await db.query("select realtime.send('{}'::jsonb,'changed','admin:mine',true)");
  const all=(await db.query('select * from realtime.messages')).rows;assert.equal(all.length,3);
  assert.ok(all.every(e=>e.private&&JSON.stringify(e.payload)==='{}'&&!JSON.stringify(e).includes('private reply')));
  async function access(role,topic){
   await db.query("select set_config('test.topic',$1,false),set_config('test.uid',$2,false)",[topic,id(40)]);
   await db.exec('set role '+role);try{return (await db.query('select topic from realtime.messages')).rows.map(r=>r.topic);}finally{await db.exec('reset role');}
  }
  assert.deepEqual(await access('anon',topics[0].visitor_realtime_topic),[topics[0].visitor_realtime_topic]);
  assert.deepEqual(await access('anon','customer-chat-visitor:'+'0'.repeat(64)),[]);
  assert.deepEqual(await access('authenticated','admin:mine'),['admin:mine']);
  assert.deepEqual(await access('authenticated',topics[0].visitor_realtime_topic),[]);
  await db.exec('set role anon');await assert.rejects(()=>db.query('select thread_id from customer_chat_capabilities.topics'),/permission denied/);await db.exec('reset role');
  await db.query('delete from customer_chat_threads where id=$1',[id(1)]);
  assert.equal((await db.query('select count(*)::int n from customer_chat_capabilities.topics where topic=$1',[topics[0].visitor_realtime_topic])).rows[0].n,0);
 }finally{await db.close();}
});
