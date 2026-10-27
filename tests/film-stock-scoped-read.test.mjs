import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const ids = Array.from({ length: 14 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const [company, owner, site, a, b, archived, r1, r2, r3, foreign, otherSite, otherRoll, otherMaterial, request] = ids;

test('scoped stock returns only relevant rolls, includes fire types, preserves history, authorization and idempotent returns', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema app_private;
      create table companies(id uuid primary key,is_active boolean);
      create table profiles(id uuid,company_id uuid,role text,is_active boolean);
      create table sites(id uuid primary key,company_id uuid,site_name text);
      create table workers(user_id uuid,company_id uuid,is_active boolean);
      create table site_materials(id uuid primary key,company_id uuid,site_id uuid,material_type text,
        brand text,product_code text,product_name text,price_type text,unit text,removed_at timestamptz);
      create table film_stock_rolls(id uuid primary key,company_id uuid,label text,brand text,product_code text,
        supplier text,location text,remaining numeric,status text,revision int,created_by uuid,created_at timestamptz default now());
      create table film_roll_purchases(roll_id uuid primary key,company_id uuid,price_type text);
      create table film_stock_trips(id uuid primary key default gen_random_uuid(),company_id uuid,roll_id uuid,site_id uuid,
        material_id uuid,issued numeric,returned numeric,issued_at timestamptz default now(),returned_at timestamptz,
        issued_by uuid,returned_by uuid);
      create table film_stock_events(id uuid primary key,company_id uuid,roll_id uuid,site_id uuid,action text,
        before_qty numeric,after_qty numeric,memo text,actor uuid,payload jsonb,created_at timestamptz default now());
      create table site_material_issues(id uuid,company_id uuid,site_id uuid,material_id uuid,quantity numeric,created_by uuid);
      create table site_material_returns(material_id uuid primary key,company_id uuid,site_id uuid,quantity numeric,
        updated_by uuid,updated_at timestamptz default now());
      create table site_material_return_history(site_id uuid,company_id uuid,material_id uuid,before_quantity numeric,
        after_quantity numeric,reason text,created_by uuid);
      create function public.site_operations(p_user uuid,p_site uuid,p_action text,p_body jsonb) returns jsonb
      language plpgsql set search_path='' as $$begin
        if not exists(select 1 from public.profiles p join public.sites s on s.company_id=p.company_id
          where p.id=p_user and s.id=p_site) then raise exception 'denied' using errcode='42501'; end if;
        return jsonb_build_object('canReturn',true,'locked',false,'materials',
          (select jsonb_agg(jsonb_build_object('id',m.id,'code',m.product_code)) from public.site_materials m
            where m.site_id=p_site and m.removed_at is null));
      end$$;
      create function app_private.roll_matches_material(p_roll uuid,p_brand text,p_code text,p_type text)
      returns boolean language sql stable as $$select exists(select 1 from public.film_stock_rolls r
        join public.film_roll_purchases p on p.roll_id=r.id and p.company_id=r.company_id
        where r.id=p_roll and r.brand=p_brand and r.product_code=p_code and p.price_type=p_type)$$;
      insert into companies values('${company}',true),('${foreign}',true);
      insert into profiles values('${owner}','${company}','owner',true);
      insert into sites values('${site}','${company}','현장'),('${otherSite}','${foreign}','외부');
      insert into site_materials values
        ('${a}','${company}','${site}','planned','현대보닥','GW952',null,'non_fire','m',null),
        ('${b}','${company}','${site}','planned','현대보닥','S245',null,'non_fire','m',null),
        ('${archived}','${company}','${site}','planned','현대보닥','GW952',null,'non_fire','m',now()),
        ('${otherMaterial}','${foreign}','${otherSite}','planned','현대보닥','GW952',null,'non_fire','m',null);
      insert into film_stock_rolls(id,company_id,label,brand,product_code,remaining,status,revision) values
        ('${r1}','${company}','반출롤','현대보닥','GW952',40,'on_site',1),
        ('${r2}','${company}','재고롤','현대보닥','GW952',30,'available',1),
        ('${r3}','${company}','다른제품','현대보닥','S245',20,'on_site',1),
        ('${otherRoll}','${foreign}','다른업체','현대보닥','GW952',50,'available',1);
      insert into film_roll_purchases select id,company_id,'non_fire' from film_stock_rolls;
      insert into film_stock_trips(company_id,roll_id,site_id,material_id,issued) values
        ('${company}','${r1}','${site}','${a}',40),('${company}','${r3}','${site}','${b}',20);
    `);
    await db.exec(read('./fixtures/film-stock-before-scoped-read.sql'));
    const call = async (body = {}, action = 'get', s = site, user = owner) => (await db.query(
      'select public.film_stock($1,$2,$3,$4) result', [user,s,action,JSON.stringify(body)]
    )).rows[0].result;
    const before = await call();
    await db.exec(read('../database/film_stock_scoped_read.sql'));
    await db.exec(read('../database/film_stock_scoped_read.sql'));
    const all = await call();
    assert.deepEqual(all.rolls.map(r => r.id).sort(), before.rolls.map(r => r.id).sort());
    assert.equal(all.stockSnapshotVersion, 1);
    assert.ok(all.materials.every(m => m.price_type === 'non_fire'));
    const scoped = await call({ materialId: a });
    assert.deepEqual(scoped.rolls.map(r => r.id).sort(), [r1,r2].sort());
    assert.ok(scoped.rolls.every(r => r.price_type === 'non_fire' && !r.matching_material_ids.includes(archived)));
    assert.deepEqual(scoped.trips, all.trips); // Tracking cannot forget another material's existing trips.
    assert.equal(scoped.materials.length, 2);
    for (const materialId of [archived,otherMaterial,request]) await assert.rejects(call({materialId}), /사용 필름/);
    await assert.rejects(call({},'get',otherSite), /denied/);
    await assert.rejects(call({},'get',site,foreign), /denied/);
    const body = { requestId: request, rollId: r1, revision: 1, remaining: 10 };
    await call(body, 'return');
    await call(body, 'return');
    assert.equal((await db.query('select revision from film_stock_rolls where id=$1',[r1])).rows[0].revision, 2);
    assert.equal((await db.query('select quantity from site_material_returns where material_id=$1',[a])).rows[0].quantity, '10');
    assert.equal((await db.query('select count(*) n from film_stock_events')).rows[0].n, 1);
    assert.equal((await call({},'get',null)).rolls.length, 3);
  } finally { await db.close(); }
});
