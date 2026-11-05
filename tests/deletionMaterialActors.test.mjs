import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004',m='00000000-0000-4000-8000-000000000005';
test('material cleanup preserves quantities and prices while removed-material and roll guards still reject business changes',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 create table account_deletion_blocks(user_id uuid);
 create table site_materials(id uuid,removed_at timestamptz);create table film_stock_trips(material_id uuid);
 create table site_material_issues(material_id uuid,created_by uuid not null,voided_by uuid,quantity numeric);
 create table site_material_returns(material_id uuid,updated_by uuid not null,quantity numeric);
 create table site_material_return_history(created_by uuid not null,before_quantity numeric,after_quantity numeric);
 create table film_stock_rolls(created_by uuid not null,remaining numeric);
 create table app_private.actual_material_manual_prices(updated_by uuid not null,unit_price numeric);
 insert into account_deletion_requests values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');
 insert into site_materials values('${m}',now());insert into film_stock_trips values('${m}');
 insert into site_material_issues values('${m}','${u}','${o}',15);
 insert into site_material_returns values('${m}','${u}',5);
 insert into site_material_return_history values('${u}',3,5);
 insert into film_stock_rolls values('${u}',35);
 insert into app_private.actual_material_manual_prices values('${u}',7200);`);
 await db.exec(await readFile(new URL('../database/account_deletion_material_actors.sql',import.meta.url),'utf8'));
 await db.exec(`create trigger guard_removed_material_flow before insert or update on site_material_issues for each row execute function app_private.guard_removed_material_flow();
 create trigger guard_roll_issue before insert or update or delete on site_material_issues for each row execute function app_private.guard_roll_material_flow();
 create trigger guard_roll_return before insert or update or delete on site_material_returns for each row execute function app_private.guard_roll_material_flow();`);
 const scrub=()=>db.query('select scrub_account_material_actors($1,$2)',[r,l]);
 await assert.rejects(scrub(),/Access block required/);
 await db.query('insert into account_deletion_blocks values($1)',[u]);
 // A quantity edit cannot hide inside account anonymization.
 await assert.rejects(db.exec('update site_material_issues set created_by=null,quantity=999'),e=>e.code==='22023');
 await assert.rejects(db.exec('update site_material_returns set updated_by=null,quantity=999'),e=>e.code==='22023');
 await scrub();await scrub();
 assert.deepEqual((await db.query('select * from site_material_issues')).rows,[{material_id:m,created_by:null,voided_by:o,quantity:'15'}]);
 assert.equal((await db.query('select quantity from site_material_returns')).rows[0].quantity,'5');
 assert.deepEqual((await db.query('select * from site_material_return_history')).rows,[{created_by:null,before_quantity:'3',after_quantity:'5'}]);
 assert.deepEqual((await db.query('select * from film_stock_rolls')).rows,[{created_by:null,remaining:'35'}]);
 assert.deepEqual((await db.query('select * from app_private.actual_material_manual_prices')).rows,[{updated_by:null,unit_price:'7200'}]);
 await assert.rejects(db.exec('update site_material_issues set voided_by=null'),e=>e.code==='22023');
 await assert.rejects(db.exec('delete from site_material_returns'),e=>e.code==='22023');
 }finally{await db.close();}
});
