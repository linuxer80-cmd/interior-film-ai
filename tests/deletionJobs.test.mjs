import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004',j='00000000-0000-4000-8000-000000000005',k='00000000-0000-4000-8000-000000000006';
test('job cleanup closes offers without cancelling accepted assignments or changing agreed pay and dates',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table labor_jobs(id uuid,created_by uuid not null,proposal_user_id uuid,status text,title text);
 create table labor_applications(id int,job_id uuid,user_id uuid,status text,share_phone boolean,updated_at timestamptz,accepted_daily_wage numeric,accepted_work_dates date[]);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into labor_jobs values('${j}','${u}',null,'open','owned'),('${k}','${o}','${u}','open','proposal'),('${o}','${o}',null,'open','unrelated');
 insert into labor_applications values(1,'${j}','${o}','accepted',true,now(),250000,array['2026-11-05']::date[]),(2,'${j}','${o}','applied',true,now(),null,null),(3,'${k}','${u}','invited',true,now(),null,null),(4,'${o}','${o}','applied',true,now(),null,null),(5,'${o}','${u}','accepted',true,now(),300000,array['2026-11-06']::date[]);`);
 await db.exec(await readFile(new URL('../database/account_deletion_jobs.sql',import.meta.url),'utf8'));
 const scrub=()=>db.query('select scrub_account_jobs($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);
 await db.query('insert into account_deletion_blocks values($1)',[u]);
 await assert.rejects(db.query('select scrub_account_jobs($1,$2)',[r,o]),/Invalid deletion lease/);
 await scrub();await scrub();
 assert.deepEqual((await db.query('select id,status,user_id,share_phone,accepted_daily_wage,accepted_work_dates::text[] as accepted_work_dates from labor_applications order by id')).rows,[
 {id:1,status:'accepted',user_id:o,share_phone:true,accepted_daily_wage:'250000',accepted_work_dates:['2026-11-05']},
 {id:2,status:'rejected',user_id:o,share_phone:false,accepted_daily_wage:null,accepted_work_dates:null},
 {id:3,status:'withdrawn',user_id:null,share_phone:false,accepted_daily_wage:null,accepted_work_dates:null},
 {id:4,status:'applied',user_id:o,share_phone:true,accepted_daily_wage:null,accepted_work_dates:null},
 {id:5,status:'accepted',user_id:null,share_phone:false,accepted_daily_wage:'300000',accepted_work_dates:['2026-11-06']}]);
 assert.equal((await db.query('select status from labor_jobs where id=$1',[o])).rows[0].status,'open');
 assert.equal((await db.query("select count(*)::int n from labor_jobs where status='closed'")).rows[0].n,2);
 await assert.rejects(db.query("update labor_jobs set status='open' where id=$1",[j]),e=>e.code==='23514');
 }finally{await db.close();}
});
