import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = fs.readFileSync(new URL('../database/add_planned_material_once.sql', import.meta.url), 'utf8');
const brandSql = fs.readFileSync(new URL('../database/film_brand_normalization.sql', import.meta.url), 'utf8')
  .match(/create or replace function public.canonical_film_brand[\s\S]*?\$\$;/)[0];
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = uid(1), company = uid(2), site = uid(3), product = uid(4), material = uid(5);

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table companies(id uuid primary key,is_active boolean);
    create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
    create table sites(id uuid primary key,company_id uuid,status text);
    create table site_materials(id uuid primary key,company_id uuid,site_id uuid,material_type text,created_by uuid,
      film_product_id uuid,brand text,product_code text,product_name text,price_type text,
      quantity numeric,unit text,unit_price numeric,total_price numeric,memo text,created_at timestamptz default now(),removed_at timestamptz);
    create table site_material_issues(material_id uuid,quantity numeric,voided_at timestamptz);
    insert into companies values('${company}',true);
    insert into profiles values('${owner}','${company}','owner',true),('${uid(8)}','${company}','worker',true);
    insert into sites values('${site}','${company}','in_progress'),('${uid(9)}','${uid(10)}','in_progress');
  `);
  await db.exec(brandSql);
  await db.exec(sql);
  const input = {id:material,film_product_id:product,brand:'현대보닥',product_code:'S245',product_name:'현대보닥 S245 솔리드',price_type:'non_fire',unit:'m',unit_price:5800,memo:''};
  const add = async (patch={}, actor=owner, sid=site) => (await db.query(
    'select public.add_planned_material_once($1,$2,$3) as result', [actor,sid,{...input,...patch}]
  )).rows[0].result;
  return {db,add};
}

test('repeated S245 additions preserve the issued row, its price and stock history', async () => {
  const {db,add} = await fixture();
  try {
    assert.equal((await add()).alreadyExists, false);
    await db.exec(`insert into site_material_issues values('${material}',20.1,null);
      update site_materials set quantity=5,total_price=29000;`);
    const before = (await db.query('select * from site_materials')).rows;
    for (const patch of [{}, {id:uid(6),brand:'현대 & C',product_code:'GS245',unit_price:9000,product_name:'새 표시 이름'}]) {
      const result = await add(patch);
      assert.equal(result.alreadyExists, true);
      assert.equal(result.id, material);
    }
    assert.deepEqual((await db.query('select * from site_materials')).rows, before);
    assert.equal(Number((await db.query('select sum(quantity) as quantity from site_material_issues')).rows[0].quantity), 20.1);
    // Old duplicates can still exist: prefer the one holding the actual issue history.
    await db.exec(`insert into site_materials select '${uid(7)}',company_id,site_id,material_type,created_by,
      film_product_id,brand,product_code,product_name,price_type,0,unit,unit_price,0,memo,created_at-interval '1 day',null
      from site_materials where id='${material}';`);
    assert.equal((await add({id:uid(11)})).id, material);
  } finally { await db.close(); }
});

test('different fire types and work notes remain separate; excluded and actual rows are not reused', async () => {
  const {db,add} = await fixture();
  try {
    await add();
    assert.equal((await add({id:uid(11),price_type:'fire',unit_price:9000})).alreadyExists, false);
    assert.equal((await add({id:uid(12),memo:'현관'})).alreadyExists, false);
    assert.equal((await add({id:uid(13),unit:'roll'})).alreadyExists, false);
    await db.exec(`update site_materials set removed_at=now() where id='${material}';`);
    assert.equal((await add({id:uid(14)})).alreadyExists, false);
    await db.exec(`update site_materials set material_type='actual' where id='${uid(14)}';`);
    assert.equal((await add({id:uid(15)})).alreadyExists, false);
    // Unlinked legacy products are matched by exact normalized brand/code, not loose substrings.
    assert.equal((await add({id:uid(16),film_product_id:null,product_code:'s245'})).id, uid(15));
    assert.equal((await add({id:uid(17),film_product_id:null,product_code:'S245X'})).alreadyExists, false);
  } finally { await db.close(); }
});

test('tenant, role, site and input checks protect the new write path', async () => {
  const {db,add} = await fixture();
  try {
    await assert.rejects(()=>add({},uid(8)), /관리자/);
    await assert.rejects(()=>add({},owner,uid(9)), /소속 현장/);
    for (const patch of [{price_type:null},{price_type:'unknown'},{unit_price:-1},{unit_price:'NaN'},{product_code:'',product_name:''}]) {
      await assert.rejects(()=>add(patch), /제품과 방염/);
    }
    await db.exec(`update sites set status='cancelled' where id='${site}';`);
    await assert.rejects(()=>add(), /소속 현장/);
    assert.equal((await db.query('select count(*) from site_materials')).rows[0].count, 0);
    const privileges = (await db.query(`select
      has_function_privilege('anon','public.add_planned_material_once(uuid,uuid,jsonb)','EXECUTE') as anon,
      has_function_privilege('authenticated','public.add_planned_material_once(uuid,uuid,jsonb)','EXECUTE') as authenticated,
      has_function_privilege('service_role','public.add_planned_material_once(uuid,uuid,jsonb)','EXECUTE') as service`)).rows[0];
    assert.deepEqual(privileges,{anon:false,authenticated:false,service:true});
  } finally { await db.close(); }
});
