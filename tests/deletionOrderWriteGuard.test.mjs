import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002';
test('order actor guards reject new and rebound deleted identities, retain shared updates and allow cleanup',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema app_private;
 create table account_deletion_blocks(user_id uuid);
 create table account_deletion_requests(subject_id uuid,user_id uuid,identity_verified boolean,scope text,status text);
 create table material_pilot_orders(id int,buyer_id uuid,status text);
 create table material_pilot_events(id int,actor_id uuid,action text);
 create table material_shipping_addresses(id int,created_by uuid,address text);`);
 await db.exec(await readFile(new URL('../database/account_deletion_order_write_guard.sql',import.meta.url),'utf8'));
 const tables=[['material_pilot_orders','buyer_id','status'],['material_pilot_events','actor_id','action'],['material_shipping_addresses','created_by','address']];
 for(const [t,k,v] of tables)await db.query(`insert into ${t} values(1,$1,'old'),(2,$2,'other')`,[u,o]);
 await db.query('insert into account_deletion_blocks values($1)',[u]);
 for(const [t,k,v] of tables){
 await assert.rejects(db.query(`insert into ${t} values(3,$1,'late')`,[u]),/Account deletion in progress/);
 await assert.rejects(db.query(`update ${t} set ${k}=$1 where id=2`,[u]),/Account deletion in progress/);
 await db.query(`update ${t} set ${k}=${k},${v}='updated' where id=1`);
 await db.query(`update ${t} set ${k}=null where id=1`);
 await assert.rejects(db.query(`update ${t} set ${k}=$1 where id=1`,[u]),/Account deletion in progress/);
 await db.query(`insert into ${t} values(4,$1,'allowed')`,[o]);
 }
 await db.query('delete from account_deletion_blocks');
 await db.query("insert into account_deletion_requests values($1,null,true,'personal_account','completed')",[u]);
 for(const [t] of tables)await assert.rejects(db.query(`insert into ${t} values(5,$1,'stale token')`,[u]),/Account deletion in progress/);
 assert.equal((await db.query("select has_function_privilege('authenticated','app_private.guard_deleting_order_actor()','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
