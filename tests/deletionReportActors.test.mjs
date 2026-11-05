import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('report cleanup anonymizes only the account actor and preserves approval, cost and history content',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table work_reports(id int,created_by uuid,reviewed_by uuid,review_status text,approved_amount numeric,work_summary text,reviewed_at timestamptz);
 create table work_report_history(id int,actor_id uuid,actor_name text,event text,after_cost jsonb,reason text);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into work_reports values(1,'${o}','${u}','approved',250000,'work summary','2026-11-05'),(2,'${u}','${o}','rejected',null,'second report','2026-11-05');
 insert into work_report_history values(1,'${u}','Synthetic deleted name','approve','{"amount":250000}','review reason'),(2,'${o}','Other actor','reject','{}','other reason');`);
 await db.exec(await readFile(new URL('../database/account_deletion_report_actors.sql',import.meta.url),'utf8'));
 const before=(await db.query("select to_jsonb(t)-'created_by'-'reviewed_by' value from work_reports t order by id")).rows;
 const scrub=()=>db.query('select scrub_account_report_actors($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);
 await db.query('insert into account_deletion_blocks values($1)',[u]);
 await assert.rejects(db.query('select scrub_account_report_actors($1,$2)',[r,o]),/Invalid deletion lease/);
 await scrub();await scrub();
 assert.deepEqual((await db.query("select to_jsonb(t)-'created_by'-'reviewed_by' value from work_reports t order by id")).rows,before);
 assert.deepEqual((await db.query('select created_by,reviewed_by from work_reports order by id')).rows,[{created_by:o,reviewed_by:null},{created_by:null,reviewed_by:o}]);
 assert.deepEqual((await db.query('select * from work_report_history order by id')).rows,[{id:1,actor_id:null,actor_name:'탈퇴한 사용자',event:'approve',after_cost:{amount:250000},reason:'review reason'},{id:2,actor_id:o,actor_name:'Other actor',event:'reject',after_cost:{},reason:'other reason'}]);
 }finally{await db.close();}
});
