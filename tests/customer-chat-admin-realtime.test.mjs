import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=fs.readFileSync(new URL('../supabase/migrations/20261028225610_customer_chat_admin_realtime.sql',import.meta.url),'utf8');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('customer chat invalidations contain no chat data and require an active owner of that company',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;create schema app_private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function realtime.topic() returns text language sql as $$select current_setting('test.topic',true)$$;
   create table companies(id uuid primary key,is_active boolean);
   create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
   create table customer_chat_threads(id uuid primary key,company_id uuid,customer_name text,owner_read_at timestamptz,last_preview text);
   create table customer_chat_messages(id uuid primary key,thread_id uuid,body text);
   create table realtime.messages(extension text,topic text,event text,payload jsonb,private boolean);
   alter table realtime.messages enable row level security;
   grant usage on schema realtime,auth,app_private to authenticated;grant select on realtime.messages to authenticated;
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$insert into realtime.messages values('broadcast',$3,$2,$1,$4)$$;`);
  await db.exec(migration);
  await db.query('insert into companies values ($1,true),($2,true)',[id(1),id(2)]);
  await db.query("insert into profiles values ($1,$2,'owner',true),($3,$4,'owner',true),($5,$2,'worker',true)",[id(10),id(1),id(11),id(2),id(12)]);
  await db.query("insert into customer_chat_threads(id,company_id,customer_name,last_preview) values ($1,$2,'private name','private preview')",[id(20),id(1)]);
  await db.query("insert into customer_chat_messages values($1,$2,'private message')",[id(30),id(20)]);
  await db.query('update customer_chat_threads set owner_read_at=now() where id=$1',[id(20)]);
  const events=(await db.query('select * from realtime.messages')).rows;
  assert.equal(events.length,3);
  assert.ok(events.every(e=>e.private&&e.event==='changed'&&JSON.stringify(e.payload)==='{}'&&!JSON.stringify(e).includes('private message')&&!JSON.stringify(e).includes('private name')&&!JSON.stringify(e).includes('private preview')));
  async function access(user,company){
   await db.query("select set_config('test.uid',$1,false),set_config('test.topic',$2,false)",[user,'customer-chat-admin:'+company]);
   await db.exec('set role authenticated');try{return (await db.query('select count(*)::int n from realtime.messages')).rows[0].n;}finally{await db.exec('reset role');}
  }
  assert.equal(await access(id(10),id(1)),3);assert.equal(await access(id(11),id(1)),0);assert.equal(await access(id(12),id(1)),0);
  await db.query('update profiles set is_active=false where id=$1',[id(10)]);assert.equal(await access(id(10),id(1)),0);
  await db.query('update profiles set is_active=true where id=$1',[id(10)]);await db.query('update companies set is_active=false where id=$1',[id(1)]);assert.equal(await access(id(10),id(1)),0);
  await db.exec("create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$begin raise exception 'simulated transport failure'; end$$");
  await db.query("insert into customer_chat_messages values($1,$2,'still saved')",[id(31),id(20)]);
  assert.equal((await db.query('select count(*)::int n from customer_chat_messages where id=$1',[id(31)])).rows[0].n,1);
 }finally{await db.close();}
});
