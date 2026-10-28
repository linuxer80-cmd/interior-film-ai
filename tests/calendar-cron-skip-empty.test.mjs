import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261028223159_calendar_auto_skip_empty_runs.sql', import.meta.url), 'utf8');
async function fixture() {
 const db = new PGlite();
 await db.exec(`create schema cron; create schema net; create schema vault;
 create table cron.job(jobid bigint,jobname text,schedule text,active boolean,command text);
 insert into cron.job values(7,'calendar-auto-sync','*/5 * * * *',true,'old command');
 create function cron.alter_job(job_id bigint, command text default null) returns void language sql as $$ update cron.job set command=alter_job.command where jobid=alter_job.job_id $$;
 create table calendar_auto_connections(enabled boolean, needs_reconnect boolean, next_run_at timestamptz, lease_until timestamptz);
 create table calendar_auto_pending(expires_at timestamptz);
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 insert into vault.decrypted_secrets values('calendar_auto_cron_secret','test');
 create table net.calls(n integer);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$ begin insert into net.calls values(1);return 1;end $$;`);
 await db.exec(migration);
 const run=async()=>{const {rows}=await db.query("select command from cron.job where jobname='calendar-auto-sync'");await db.exec(rows[0].command);return Number((await db.query('select count(*) as n from net.calls')).rows[0].n);};
 return {db,run};
}
test('only claimable syncs or expired pending requests wake the app',async()=>{
 const {db,run}=await fixture();try{
  assert.equal(await run(),0);
  await db.exec("insert into calendar_auto_connections values(true,false,now()+interval '1 day',null)");assert.equal(await run(),0);
  await db.exec("update calendar_auto_connections set next_run_at=now()-interval '1 minute',lease_until=now()+interval '1 minute'");assert.equal(await run(),0);
  await db.exec("update calendar_auto_connections set lease_until=now()-interval '1 minute'");assert.equal(await run(),1);
  await db.exec("update calendar_auto_connections set needs_reconnect=true");assert.equal(await run(),1);
  await db.exec("update calendar_auto_connections set needs_reconnect=false,enabled=false");assert.equal(await run(),1);
  await db.exec("insert into calendar_auto_pending values(now()-interval '1 minute')");assert.equal(await run(),2);
  await db.exec('delete from calendar_auto_pending');assert.equal(await run(),2);
  await db.exec('update calendar_auto_connections set enabled=true,lease_until=null');assert.equal(await run(),3);
 }finally{await db.close();}
});
test('migration refuses to create or change a differently configured job',async()=>{
 const {db}=await fixture();try{await db.exec("update cron.job set schedule='*/10 * * * *',command='keep'");await assert.rejects(db.exec(migration),/job not found/);assert.equal((await db.query('select command from cron.job')).rows[0].command,'keep');}finally{await db.close();}
});
