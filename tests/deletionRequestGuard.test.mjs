import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('deletion blocks new requests while allowing existing analysis to finish', async () => {
  const db = new PGlite();
  const deleting = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated;
      create table account_deletion_blocks(user_id uuid primary key);
      create table site_screenshot_requests(user_id uuid, status text);
      create table consultation_registration_requests(user_id uuid, status text);`);
    await db.exec(await readFile(new URL('../database/account_deletion_request_guard.sql', import.meta.url), 'utf8'));
    await db.query('insert into site_screenshot_requests values ($1, $2)', [deleting, 'pending']);
    await db.query('insert into account_deletion_blocks values ($1)', [deleting]);
    for (const table of ['site_screenshot_requests', 'consultation_registration_requests']) {
      await assert.rejects(db.query(`insert into ${table} values ($1, $2)`, [deleting, 'pending']),
        error => error.code === '42501');
      await db.query(`insert into ${table} values ($1, $2)`, [other, 'pending']);
    }
    await db.query('update site_screenshot_requests set status=$1 where user_id=$2', ['succeeded', deleting]);
    const result = await db.query('select status from site_screenshot_requests where user_id=$1', [deleting]);
    assert.deepEqual(result.rows, [{ status: 'succeeded' }]);
    const untouched = await db.query('select status from site_screenshot_requests where user_id=$1', [other]);
    assert.deepEqual(untouched.rows, [{ status: 'pending' }]);
  } finally {
    await db.close();
  }
});
