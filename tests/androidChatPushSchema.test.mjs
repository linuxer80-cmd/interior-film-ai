import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('device tokens are inaccessible to clients and removed with the user', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users (id uuid primary key);');
    const schema=await readFile(new URL('../database/android_chat_push_tokens.sql', import.meta.url), 'utf8');
    await db.exec(schema);
    await db.exec(schema);
    await db.exec("insert into auth.users values ('11111111-1111-1111-1111-111111111111');");
    await db.exec('set role service_role');
    await db.exec("insert into public.android_chat_push_tokens (device_id,user_id,token) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','long-registration-token-value');");
    const flags=await db.query('select native_chat_ready,native_general_ready from public.android_chat_push_tokens');
    assert.deepEqual(flags.rows[0],{native_chat_ready:false,native_general_ready:false});
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query('select * from public.android_chat_push_tokens'), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.android_chat_push_tokens'), /permission denied/);
    await db.exec("reset role; delete from auth.users where id='11111111-1111-1111-1111-111111111111';");
    const result=await db.query('select count(*)::int as n from public.android_chat_push_tokens');
    assert.equal(result.rows[0].n,0);
  } finally { await db.close(); }
});
