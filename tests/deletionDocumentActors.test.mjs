import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('document actor cleanup preserves business documents, revisions, sample media and other users',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table company_inventory_preferences(id int,updated_by uuid,enabled boolean);
 create table site_completion_estimates(id int,updated_by uuid not null,document jsonb,revision int);
 create table standalone_quotes(id int,created_by uuid not null,area_document jsonb,cost_document jsonb);
 create table photo_case_classifications(id int,updated_by uuid not null,targets jsonb,review_status text);
 create table door_test_uploads(id int,confirmed_by uuid not null,storage_path text,unit_price int);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into company_inventory_preferences values(1,'${u}',true),(2,'${o}',false);
 insert into site_completion_estimates values(1,'${u}','{"total":350000}',7),(2,'${o}','{"total":500000}',2);
 insert into standalone_quotes values(1,'${u}','{"items":["door"]}','{"amount":350000}'),(2,'${o}','{}','{}');
 insert into photo_case_classifications values(1,'${u}','[{"part":"door"}]','approved'),(2,'${o}','[]','pending');
 insert into door_test_uploads values(1,'${u}','company/sample.jpg',350000),(2,'${o}','other/sample.jpg',250000);`);
 await db.exec(await readFile(new URL('../database/account_deletion_document_actors.sql',import.meta.url),'utf8'));
 const tables=['company_inventory_preferences','site_completion_estimates','standalone_quotes','photo_case_classifications','door_test_uploads'];
 const snapshot=async()=>Promise.all(tables.map(async t=>(await db.query(`select to_jsonb(t)-'updated_by'-'created_by'-'confirmed_by' value from ${t} t order by id`)).rows));
 const before=await snapshot();const scrub=()=>db.query('select scrub_account_document_actors($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);await db.query('insert into account_deletion_blocks values($1)',[u]);
 await assert.rejects(db.query('select scrub_account_document_actors($1,$2)',[r,o]),/Invalid deletion lease/);
 await scrub();await scrub();assert.deepEqual(await snapshot(),before);
 for(const t of tables){const rows=(await db.query(`select to_jsonb(t) value from ${t} t order by id`)).rows;const key=Object.keys(rows[0].value).find(k=>['updated_by','created_by','confirmed_by'].includes(k));assert.equal(rows[0].value[key],null);assert.equal(rows[1].value[key],o);}
 }finally{await db.close();}
});
