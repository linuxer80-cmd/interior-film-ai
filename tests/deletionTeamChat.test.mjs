import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004',m='00000000-0000-4000-8000-000000000005',n='00000000-0000-4000-8000-000000000006';
test('team cleanup removes private body and receipts, preserves others and refreshes once',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table worker_team_messages(id uuid primary key,sender_id uuid not null,body text not null);
 create table worker_team_message_reads(message_id uuid,user_id uuid,read_at timestamptz);
 create table refresh_events(id uuid);
 create function app_private.notify_team_chat_change() returns trigger language plpgsql as $$begin insert into public.refresh_events values(new.id);return null;end;$$;
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into worker_team_messages values('${m}','${u}','private phone'),('${n}','${o}','keep');
 insert into worker_team_message_reads values('${m}','${o}',null),('${n}','${u}',now()),('${n}','${o}',null);`);
 await db.exec(await readFile(new URL('../database/account_deletion_team_chat.sql',import.meta.url),'utf8'));
 const scrub=()=>db.query('select scrub_account_team_chat($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);
 await db.query('insert into account_deletion_blocks values($1)',[u]);
 await assert.rejects(db.query('select scrub_account_team_chat($1,$2)',[r,o]),/Invalid deletion lease/);
 await scrub();await scrub();
 assert.deepEqual((await db.query('select * from worker_team_messages order by id')).rows,[{id:m,sender_id:null,body:'탈퇴로 삭제된 메시지입니다.'},{id:n,sender_id:o,body:'keep'}]);
 assert.deepEqual((await db.query('select * from worker_team_message_reads')).rows,[{message_id:n,user_id:o,read_at:null}]);
 assert.equal((await db.query('select count(*)::int n from refresh_events')).rows[0].n,1);
 await assert.rejects(db.query('insert into worker_team_messages values($1,$2,$3)',[r,u,'late']),/Account deletion in progress/);
 await assert.rejects(db.query('update worker_team_messages set body=$1 where id=$2',['restore private text',m]),/deleted_team_sender_body/);
 assert.equal((await db.query("select has_function_privilege('authenticated','scrub_account_team_chat(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
