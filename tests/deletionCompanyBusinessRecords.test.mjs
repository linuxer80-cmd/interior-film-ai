import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const company = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000003';
const lease = '00000000-0000-4000-8000-000000000004';
const stages = ['site_links', 'work_records', 'receivables', 'materials', 'assignments'];

test('business cleanup rolls back all earlier stages on failure, null confirmation or lost lease', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table companies(id uuid primary key);
      insert into companies values('${company}'),('${other}');
      create table sites(company_id uuid);
      insert into sites values('${company}'),('${other}');
      create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);
      insert into account_deletion_requests values('${company}','${company}','${user}',true,'personal_account','processing','${lease}',now()+interval '5 minutes');
      create table controls(stage text,mode text);
      create table effects(stage text);
      create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select not exists(select 1 from public.controls where stage='lease')$$;
    `);
    for (const stage of stages) {
      await db.exec(`
        create table ${stage}(company_id uuid);
        insert into ${stage} values('${company}'),('${other}');
        create function delete_company_${stage}(uuid,uuid) returns boolean language plpgsql set search_path='' as $$
        begin
          delete from public.${stage} where company_id='${company}';
          insert into public.effects values('${stage}');
          if exists(select 1 from public.controls where stage='${stage}' and mode='error') then raise exception 'stage failure';end if;
          if exists(select 1 from public.controls where stage='${stage}' and mode='null') then return null;end if;
          return true;
        end;$$;
      `);
    }
    await db.exec(await readFile(new URL('../database/account_deletion_company_business_records.sql', import.meta.url), 'utf8'));
    const run = () => db.query('select delete_company_business_records($1,$2) ok', [company, lease]);
    const intact = async () => {
      for (const stage of stages) assert.equal((await db.query(`select count(*)::int n from ${stage}`)).rows[0].n, 2);
      assert.deepEqual((await db.query('select * from effects')).rows, []);
    };
    await assert.rejects(db.query('select delete_company_business_records($1,$2)', [company, user]), /lease required/);
    for (const stage of stages) {
      for (const mode of ['error', 'null']) {
        await db.query('insert into controls values($1,$2)', [stage, mode]);
        await assert.rejects(run(), /stage failure|not confirmed/);
        await intact();
        await db.exec('delete from controls');
      }
    }
    await db.exec("insert into controls values('lease','error')");
    await assert.rejects(run(), /lease expired/);
    await intact();
    await db.exec('delete from controls');
    assert.equal((await run()).rows[0].ok, true);
    assert.deepEqual((await db.query('select stage from effects')).rows.map(r => r.stage), stages);
    assert.equal((await run()).rows[0].ok, true);
    for (const stage of stages) assert.deepEqual((await db.query(`select * from ${stage}`)).rows, [{ company_id: other }]);
    assert.equal((await db.query('select count(*)::int n from companies')).rows[0].n, 2);
    assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n, 2);
    assert.equal((await db.query("select has_function_privilege('anon','delete_company_business_records(uuid,uuid)','EXECUTE') ok")).rows[0].ok, false);
    assert.equal((await db.query("select has_function_privilege('authenticated','delete_company_business_records(uuid,uuid)','EXECUTE') ok")).rows[0].ok, false);
  } finally { await db.close(); }
});
