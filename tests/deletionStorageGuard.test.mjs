import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const user='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
test('private storage rejects blocked inserts, overwrites and moves, including after Auth deletion',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema app_private;create schema storage;
   create table storage.objects(id serial primary key,bucket_id text,name text,metadata jsonb);
   create table account_deletion_blocks(user_id uuid);
   create table account_deletion_requests(subject_id uuid,user_id uuid,identity_verified boolean,scope text,status text);`);
  await db.exec(await readFile(new URL('../database/account_deletion_storage_guard.sql',import.meta.url),'utf8'));
  const insert=(bucket,path)=>db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,path]);
  await insert('labor-avatars',`${user}/old.jpg`);
  await db.query('insert into account_deletion_blocks values($1)',[user]);
  for(const [bucket,path] of [['labor-avatars',`${user}/new.jpg`],['site-call-audio-private',`company/${user}/new.wav`]]){
   await assert.rejects(insert(bucket,path),e=>e.code==='42501');
  }
  await assert.rejects(db.query("update storage.objects set metadata='{}' where id=1"),e=>e.code==='42501');
  await assert.rejects(db.query('update storage.objects set name=$1 where id=1',[`${other}/moved.jpg`]),e=>e.code==='42501');
  await insert('labor-avatars',`${other}/allowed.jpg`);
  await insert('site-call-audio-private',`company/${other}/allowed.wav`);
  await insert('work-photos',`${user}/shared.jpg`);
  await db.exec('delete from account_deletion_blocks');
  await db.query("insert into account_deletion_requests values($1,null,true,'personal_account','completed')",[user]);
  await assert.rejects(insert('labor-avatars',`${user}/late.jpg`),e=>e.code==='42501');
  await assert.rejects(insert('site-call-audio-private',`company/${user}/late.wav`),e=>e.code==='42501');
  // Cleanup through the Storage service must remain possible.
  await db.exec('delete from storage.objects where id=1');
  assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,3);
 }finally{await db.close();}
});
