import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const source = await readFile(new URL('../database/harden_legacy_function_access.sql', import.meta.url), 'utf8');
// PGlite has no pgvector bundle here. The vector signature is represented by a
// domain below; the real extension-location precondition is checked separately.
const sql = source.replace(/  if not exists \(\n    select 1 from pg_catalog\.pg_extension[\s\S]*?  end if;\n/, '');
if (sql === source) throw new Error('Fixture must replace only the vector installation guard');

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    revoke create on schema public from public,anon,authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create domain public.vector as numeric;
    create function public.vector_distance(public.vector,public.vector) returns numeric language sql immutable as $$ select abs($1-$2) $$;
    create operator public.<=> (leftarg=public.vector,rightarg=public.vector,function=public.vector_distance);
    create table public.work_items(category text, material_cost numeric,labor_cost numeric,additional_cost numeric,actual_cost numeric,area_m2 numeric);
    insert into public.work_items values ('문',10,20,5,100,2);
    create table public.work_photos(id int,embedding public.vector);
    insert into public.work_photos values (1,0.2);
    create function public.get_average_work_cost(text) returns numeric language sql stable as $$ select avg(actual_cost) from work_items where category=$1 $$;
    create function public.calculate_estimate(text,numeric,integer default 3) returns numeric language plpgsql as $$ begin return (select avg(actual_cost / nullif(area_m2,0))*$2 from work_items where category=$1); end $$;
    create function public.match_work_photos(public.vector,double precision default 0,integer default 30) returns double precision language sql stable as $$ select (1-(wp.embedding <=> $1))::double precision from public.work_photos wp limit 1 $$;
    create table public.film_products(id integer primary key, dealer_price_per_m integer);
    create table public.material_price_history(price integer);
    create function public.record_material_price_change() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.material_price_history values (new.dealer_price_per_m); return new; end $$;
    create trigger price_change before update on public.film_products for each row execute function public.record_material_price_change();
    insert into public.film_products values (1,100);
    grant select,update on public.film_products to authenticated;
    grant select on public.work_items,public.work_photos to authenticated;
  `);
  return db;
}

test('untrusted direct trigger execution is revoked while updates still record history',async()=>{
  const db=await fixture();try {
    await db.exec(sql);
    const grants=await db.query(`select has_function_privilege('anon','public.record_material_price_change()','execute') a, has_function_privilege('authenticated','public.record_material_price_change()','execute') b`);
    assert.equal(grants.rows[0].a,false);assert.equal(grants.rows[0].b,false);
    await db.exec('set role authenticated; create temp table fake_products(dealer_price_per_m integer);');
    await assert.rejects(db.exec('create trigger fake_price before update on fake_products for each row execute function public.record_material_price_change()'),/permission denied/);
    await db.exec('update public.film_products set dealer_price_per_m=120 where id=1; reset role;');
    assert.equal((await db.query('select price from public.material_price_history')).rows[0].price,120);
  } finally { await db.close(); }
});

test('estimate and photo functions ignore caller search path and temporary shadow tables',async()=>{
  const db=await fixture();try {
    await db.exec(sql);
    await db.exec(`create schema attacker; create table attacker.work_items(category text,actual_cost numeric,area_m2 numeric); insert into attacker.work_items values('문',9999,1); set search_path=attacker,public; create temporary table work_items(category text,actual_cost numeric,area_m2 numeric); insert into work_items values('문',8888,1);`);
    const result=await db.query(`select public.get_average_work_cost('문') avg, public.calculate_estimate('문',2,3) estimate, public.match_work_photos(0.3::public.vector,0,1) similarity`);
    assert.equal(Number(result.rows[0].avg),100); assert.equal(Number(result.rows[0].estimate),100);
    assert.ok(Math.abs(result.rows[0].similarity-0.9)<0.00001);
  } finally { await db.close(); }
});

test('patch refuses an untrusted public schema',async()=>{
  const db=await fixture();try {
    await db.exec('grant create on schema public to anon');
    await assert.rejects(db.exec(sql),/public schema is writable/);
  } finally { await db.close(); }
});
