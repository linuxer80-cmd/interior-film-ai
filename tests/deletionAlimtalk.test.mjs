import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('alimtalk cleanup retains credits and delivery accounting, isolates other actors and permits retry',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table alimtalk_credit_entries(id int,actor_id uuid not null,quantity int,reason text);
 create table alimtalk_deliveries(id int,created_by uuid,status text,accounting text,receipt_id text);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into alimtalk_credit_entries values(1,'${u}',100,'purchase'),(2,'${o}',200,'purchase');
 insert into alimtalk_deliveries values(1,'${u}','success','charged','receipt1'),(2,'${o}','failed','refunded','receipt2'),(3,'${u}','reserved','reserved',null);`);
 await db.exec(await readFile(new URL('../database/account_deletion_alimtalk.sql',import.meta.url),'utf8'));
 const snapshot=async()=>Promise.all(['alimtalk_credit_entries','alimtalk_deliveries'].map(async t=>(await db.query(`select to_jsonb(t)-'actor_id'-'created_by' value from ${t} t order by id`)).rows));
 const before=await snapshot();const scrub=()=>db.query('select scrub_account_alimtalk_actors($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);await db.query('insert into account_deletion_blocks values($1)',[u]);
 await assert.rejects(db.query('select scrub_account_alimtalk_actors($1,$2)',[r,o]),/Invalid deletion lease/);
 await scrub();await scrub();assert.deepEqual(await snapshot(),before);
 assert.deepEqual((await db.query('select actor_id from alimtalk_credit_entries order by id')).rows,[{actor_id:null},{actor_id:o}]);
 assert.deepEqual((await db.query('select created_by from alimtalk_deliveries order by id')).rows,[{created_by:null},{created_by:o},{created_by:null}]);
 assert.equal((await db.query("select has_function_privilege('authenticated','scrub_account_alimtalk_actors(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
