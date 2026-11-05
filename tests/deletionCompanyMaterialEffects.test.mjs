import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('company material deletion suppresses both effects without changing normal delete or update behavior', async () => {
  const db = new PGlite();
  const company = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`create schema app_private;
      create table app_private.company_material_deletions(company_id uuid);
      insert into app_private.company_material_deletions values('${company}');
      create table site_materials(company_id uuid,quantity int);
      insert into site_materials values('${company}',1),('${other}',1);
      create table effects(operation text,company_id uuid);
    `);
    for (const fn of ['calendar_auto_changed', 'site_change_trigger']) {
      await db.exec(`create function app_private.${fn}() returns trigger language plpgsql set search_path='' as $$
begin
        insert into public.effects values(tg_op,coalesce(new.company_id,old.company_id));return null;
end;$$;
        create trigger ${fn} after insert or update or delete on site_materials for each row execute function app_private.${fn}();`);
    }
    const sql = await readFile(new URL('../database/account_deletion_company_material_effects.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.query('delete from site_materials where company_id=$1', [company]);
    assert.deepEqual((await db.query('select * from effects')).rows, []);
    await db.query('update site_materials set quantity=2 where company_id=$1', [other]);
    await db.query('delete from site_materials where company_id=$1', [other]);
    assert.deepEqual((await db.query('select operation from effects')).rows.map(r => r.operation), ['UPDATE', 'UPDATE', 'DELETE', 'DELETE']);
  } finally { await db.close(); }
});
