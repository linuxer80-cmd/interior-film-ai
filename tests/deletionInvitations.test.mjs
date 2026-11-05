import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('invitation cleanup cancels pending invitations and preserves accepted recipients and unrelated records',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table worker_relationship_invites(created_by uuid not null,status text,claimant uuid);
 create table worker_connection_requests(created_by uuid not null,target_user_id uuid,message text,revision int,updated_at timestamptz,status text);
 create table direct_worker_invitations(created_by uuid not null,accepted_user_id uuid,status text);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into worker_relationship_invites values('${u}','pending',null),('${u}','accepted','${o}'),('${o}','pending',null);
 insert into worker_connection_requests values('${u}','${o}','private',1,now(),'pending'),('${o}','${o}','keep',1,now(),'accepted');
 insert into direct_worker_invitations values('${u}','${o}','accepted'),('${u}',null,'pending');`);
 await db.exec(await readFile(new URL('../database/account_deletion_invitations.sql',import.meta.url),'utf8'));
 const scrub=()=>db.query('select scrub_account_invitations($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);
 await db.query('insert into account_deletion_blocks values($1)',[u]);
 await assert.rejects(db.query('select scrub_account_invitations($1,$2)',[r,o]),/Invalid deletion lease/);
 await scrub();await scrub();
 const relation=(await db.query('select * from worker_relationship_invites order by status')).rows;
 assert.deepEqual(relation,[{created_by:null,status:'accepted',claimant:o},{created_by:null,status:'cancelled',claimant:null},{created_by:o,status:'pending',claimant:null}]);
 const connection=(await db.query("select created_by,target_user_id,message,revision from worker_connection_requests where status='cancelled'")).rows[0];
 assert.deepEqual(connection,{created_by:null,target_user_id:o,message:'',revision:2});
 assert.equal((await db.query("select message from worker_connection_requests where status='accepted'")).rows[0].message,'keep');
 assert.deepEqual((await db.query("select * from direct_worker_invitations where status='accepted'")).rows[0],{created_by:null,accepted_user_id:o,status:'accepted'});
 await assert.rejects(db.exec("insert into direct_worker_invitations values(null,null,'pending')"),e=>e.code==='23514');
 }finally{await db.close();}
});
