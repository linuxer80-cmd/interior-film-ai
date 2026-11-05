import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const c='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('material deletion follows FK/roll guard order and preserves other-company stock',async()=>{
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;create table companies(id uuid primary key);insert into companies values('${c}'),('${o}');
create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);insert into account_deletion_requests values('${c}','${c}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
create table sites(id uuid primary key,company_id uuid);insert into sites values('${c}','${c}'),('${o}','${o}');
create table site_materials(id uuid primary key,company_id uuid,site_id uuid references sites);insert into site_materials values('${c}','${c}','${c}'),('${o}','${o}','${o}');
create table film_stock_rolls(id uuid primary key,company_id uuid,remaining numeric);insert into film_stock_rolls values('${c}','${c}',10),('${o}','${o}',20);
create table film_stock_trips(id uuid primary key,company_id uuid,material_id uuid references site_materials,roll_id uuid references film_stock_rolls);insert into film_stock_trips values('${c}','${c}','${c}','${o}'),('${o}','${o}','${o}','${o}');
create table app_private.film_trip_costs(company_id uuid,trip_id uuid references film_stock_trips);insert into app_private.film_trip_costs values('${c}','${c}'),('${o}','${o}');
create table site_material_issues(company_id uuid,material_id uuid references site_materials);insert into site_material_issues values('${c}','${c}'),('${o}','${o}');
create table site_material_returns(company_id uuid,material_id uuid references site_materials);create table site_material_return_history(company_id uuid,material_id uuid references site_materials);
create table app_private.actual_material_manual_prices(company_id uuid,material_id uuid references site_materials);create table film_roll_purchases(company_id uuid,roll_id uuid references film_stock_rolls);create table film_stock_events(company_id uuid,roll_id uuid references film_stock_rolls);
create function guard_roll() returns trigger language plpgsql as $$begin if exists(select 1 from public.film_stock_trips where material_id=old.material_id) then raise exception 'Trip still present';end if;return old;end$$;
create trigger guard_roll before delete on site_material_issues for each row execute function guard_roll();`);
await db.exec(await readFile(new URL('../database/account_deletion_company_materials.sql',import.meta.url),'utf8'));
const run=()=>db.query('select delete_company_materials($1,$2) ok',[c,l]);await assert.rejects(run(),/Cross-company/);
await db.query('update film_stock_trips set roll_id=$1 where id=$1',[c]);assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);
assert.deepEqual((await db.query('select company_id,remaining from film_stock_rolls')).rows,[{company_id:o,remaining:'20'}]);
assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,2);
await assert.rejects(db.query('insert into film_stock_rolls values($1,$1,5)',[c]),/being deleted/);
}finally{await db.close();}});
