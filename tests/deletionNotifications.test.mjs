import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004',w='00000000-0000-4000-8000-000000000005';
test('notification cleanup removes only personal inbox and receipts, preserving company alerts and delivery ledger',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,worker_ids uuid[],lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table workers(id uuid,user_id uuid);
 create table notifications(id int primary key,recipient_type text,recipient_user_id uuid,recipient_worker_id uuid);
 create table labor_notifications(user_id uuid);
 create table site_change_receipts(worker_id uuid);
 create table alimtalk_deliveries(notification_id int references notifications(id) on delete set null,status text);
 insert into account_deletion_requests values('${r}','${u}',array['${w}'::uuid],'${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into workers values('${w}',null);
 insert into notifications values(1,'worker','${u}',null),(2,'worker',null,'${w}'),(3,'company_admin',null,null),(4,'worker','${o}',null);
 insert into labor_notifications values('${u}'),('${o}');insert into site_change_receipts values('${w}'),('${o}');
 insert into alimtalk_deliveries values(1,'success');`);
 await db.exec(await readFile(new URL('../database/account_deletion_notifications.sql',import.meta.url),'utf8'));
 const scrub=()=>db.query('select scrub_account_notifications($1,$2)',[r,l]);await assert.rejects(scrub(),/Access block required/);
 await db.query('insert into account_deletion_blocks values($1)',[u]);
 await db.query("insert into notifications values(5,'worker',$1,$2)",[o,w]);await assert.rejects(scrub(),/Conflicting notification recipient/);
 assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,5);
 await db.query('delete from notifications where id=5');await scrub();await scrub();
 assert.deepEqual((await db.query('select id from notifications order by id')).rows,[{id:3},{id:4}]);
 assert.deepEqual((await db.query('select * from labor_notifications')).rows,[{user_id:o}]);
 assert.deepEqual((await db.query('select * from site_change_receipts')).rows,[{worker_id:o}]);
 assert.deepEqual((await db.query('select * from alimtalk_deliveries')).rows,[{notification_id:null,status:'success'}]);
 }finally{await db.close();}
});
