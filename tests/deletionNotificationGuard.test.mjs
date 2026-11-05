import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',w='00000000-0000-4000-8000-000000000003';
test('late notifications skip deleted recipients without stopping other recipients or business work',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema app_private;
 create table account_deletion_requests(subject_id uuid,user_id uuid,worker_ids uuid[],identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table workers(id uuid,user_id uuid);
 create table notifications(recipient_user_id uuid,recipient_type text,recipient_worker_id uuid);
 create table labor_notifications(user_id uuid);
 create table material_pilot_notifications(user_id uuid);
 create table site_change_receipts(worker_id uuid);
 create table business_state(value int);
 insert into workers values('${w}','${u}');insert into account_deletion_blocks values('${u}');
 insert into account_deletion_requests values('${u}','${u}',array['${w}'::uuid],true,'personal_account','processing');`);
 await db.exec(await readFile(new URL('../database/account_deletion_notification_guard.sql',import.meta.url),'utf8'));
 async function send(){await db.query("insert into notifications values($1,'worker',null),($2,'worker',null),(null,'worker',$3),(null,'company_admin',null)",[u,o,w]);for(const t of ['labor_notifications','material_pilot_notifications'])await db.query(`insert into ${t} values($1),($2)`,[u,o]);await db.query('insert into site_change_receipts values($1),($2)',[w,o]);}
 await db.exec('begin;insert into business_state values(1);');await send();await db.exec('commit;');
 assert.equal((await db.query('select count(*)::int n from business_state')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,2);
 for(const t of ['labor_notifications','material_pilot_notifications'])assert.deepEqual((await db.query(`select * from ${t}`)).rows,[{user_id:o}]);
 assert.deepEqual((await db.query('select * from site_change_receipts')).rows,[{worker_id:o}]);
 await db.query('delete from account_deletion_blocks');await db.query('update workers set user_id=null');await db.query("update account_deletion_requests set user_id=null,status='completed'");await send();
 assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,4);
 await db.query('update labor_notifications set user_id=$1 where user_id=$2',[u,o]);
 assert.equal((await db.query('select count(*)::int n from labor_notifications where user_id=$1',[u])).rows[0].n,0);
 }finally{await db.close();}
});
