import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('personal badges are removed while company credits, other receipts and usage ledger survive',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text,subject_id uuid);
 create table account_deletion_blocks(user_id uuid);
 create table achievement_awards(subject_key text primary key);
 create table achievement_receipts(user_id uuid,subject_key text references achievement_awards);
 create table achievement_preferences(user_id uuid,subject_key text);
 create table badge_ai_credits(subject_key text,granted int,used int);
 create table badge_ai_requests(request_id uuid,actor uuid,units int);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing','${u}');
 insert into achievement_awards values('user:${u}'),('user:${o}'),('company:shared');
 insert into achievement_receipts values('${u}','user:${u}'),('${u}','company:shared'),('${o}','company:shared');
 insert into achievement_preferences values('${u}','company:shared'),('${o}','company:shared');
 insert into badge_ai_credits values('user:${u}',10,2),('user:${o}',8,1),('company:shared',20,7);
 insert into badge_ai_requests values('${r}','${u}',2),('${l}','${o}',1);`);
 await db.exec(await readFile(new URL('../database/account_deletion_badges.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../database/account_deletion_badge_write_guard.sql',import.meta.url),'utf8'));
 const scrub=()=>db.query('select scrub_account_badges($1,$2)',[r,l]);await assert.rejects(scrub(),/Access block required/);
 await db.query('insert into account_deletion_blocks values($1)',[u]);await assert.rejects(db.query('select scrub_account_badges($1,$2)',[r,o]),/Invalid deletion lease/);
 await assert.rejects(db.query('insert into achievement_preferences values($1,$2)',[u,'company:shared']),/Account deletion in progress/);
 await assert.rejects(db.query('update badge_ai_credits set used=used+1 where subject_key=$1',['user:'+u]),/Account deletion in progress/);
 await scrub();await scrub();
 assert.deepEqual((await db.query('select * from badge_ai_credits order by subject_key')).rows,[{subject_key:'company:shared',granted:20,used:7},{subject_key:'user:'+o,granted:8,used:1}]);
 assert.deepEqual((await db.query('select * from achievement_receipts')).rows,[{user_id:o,subject_key:'company:shared'}]);
 assert.deepEqual((await db.query('select * from achievement_preferences')).rows,[{user_id:o,subject_key:'company:shared'}]);
 assert.equal((await db.query('select count(*)::int n from achievement_awards')).rows[0].n,2);
 assert.deepEqual((await db.query('select * from badge_ai_requests order by request_id')).rows,[{request_id:r,actor:null,units:2},{request_id:l,actor:o,units:1}]);
 await db.query("update badge_ai_credits set used=8 where subject_key='company:shared'");
 await db.query('delete from account_deletion_blocks');
 await db.query("update account_deletion_requests set user_id=null,status='completed'");
 for(const statement of [
  'insert into achievement_awards values($1)',
  "insert into badge_ai_credits values($1,10,0)"
 ])await assert.rejects(db.query(statement,['user:'+u]),/Account deletion in progress/);
 await assert.rejects(db.query('insert into achievement_receipts values($1,$2)',[u,'company:shared']),/Account deletion in progress/);
 await assert.rejects(db.query('insert into badge_ai_requests values($1,$2,1)',[r,u]),/Account deletion in progress/);
 }finally{await db.close();}
});
