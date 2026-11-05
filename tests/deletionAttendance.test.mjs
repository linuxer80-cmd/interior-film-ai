import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004',w='00000000-0000-4000-8000-000000000005';
test('attendance cleanup removes GPS and snapshot identities without altering hours, money or other workers',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text,worker_ids uuid[]);
 create table account_deletion_blocks(user_id uuid);create table workers(id uuid,user_id uuid);
 create table attendance_records(id int,worker_id uuid,in_gps jsonb,out_gps jsonb,in_distance_m int,out_distance_m int,reviewed_by uuid,corrected_by uuid,clock_in text,clock_out text,overtime_amount int);
 create table attendance_corrections(attendance_id int,changed_by uuid not null,previous_record jsonb);
 create table worker_commute_cache(worker_id uuid,result jsonb);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing',array['${w}']::uuid[]);
 insert into workers values('${w}',null),('${o}','${o}');
 insert into attendance_records values(1,'${w}','{"lat":37}','{"lat":38}',10,20,'${o}','${u}','08:00','18:00',30000),(2,'${o}','{"lat":35}',null,50,null,'${u}',null,'09:00','17:00',0);
 insert into attendance_corrections values(1,'${u}','{"in_gps":{"lat":37},"out_gps":{"lat":38},"in_distance_m":10,"out_distance_m":20,"reviewed_by":"${o}","corrected_by":"${u}","overtime_amount":30000}'),(2,'${o}','{"in_gps":{"lat":35},"reviewed_by":"${u}","overtime_amount":0}');
 insert into worker_commute_cache values('${w}','{"route":"private"}'),('${o}','{"route":"keep"}');`);
 await db.exec(await readFile(new URL('../database/account_deletion_attendance.sql',import.meta.url),'utf8'));
 const scrub=()=>db.query('select scrub_account_attendance($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);
 await db.query('insert into account_deletion_blocks values($1)',[u]);
 await scrub();await scrub();
 const rows=(await db.query('select * from attendance_records order by id')).rows;
 assert.deepEqual(rows[0],{id:1,worker_id:w,in_gps:{},out_gps:null,in_distance_m:null,out_distance_m:null,reviewed_by:o,corrected_by:null,clock_in:'08:00',clock_out:'18:00',overtime_amount:30000});
 assert.deepEqual(rows[1].in_gps,{lat:35});assert.equal(rows[1].reviewed_by,null);
 const corrections=(await db.query('select * from attendance_corrections order by attendance_id')).rows;
 assert.deepEqual(corrections[0],{attendance_id:1,changed_by:null,previous_record:{reviewed_by:o,overtime_amount:30000}});
 assert.deepEqual(corrections[1],{attendance_id:2,changed_by:o,previous_record:{in_gps:{lat:35},overtime_amount:0}});
 assert.deepEqual((await db.query('select * from worker_commute_cache')).rows,[{worker_id:o,result:{route:'keep'}}]);
 }finally{await db.close();}
});
