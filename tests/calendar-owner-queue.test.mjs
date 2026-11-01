import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('company site changes queue only the relevant owner and assigned worker',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create schema app_private;
      create table public.calendar_auto_connections(user_id uuid primary key,enabled boolean,needs_reconnect boolean,dirty_version bigint,next_run_at timestamptz);
      create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
      create table public.companies(id uuid primary key,company_name text,is_active boolean);
      create table public.workers(id uuid primary key,user_id uuid,company_id uuid,is_active boolean);
      create table public.sites(id uuid primary key,company_id uuid,site_name text,status text,work_dates date[]);
      create table public.site_workers(id uuid primary key,site_id uuid,worker_id uuid,company_id uuid,role text);
      create table public.site_daily_assignments(id uuid primary key,site_id uuid,worker_id uuid,company_id uuid,role text,work_date date);
      create function app_private.calendar_auto_enqueue(p_users uuid[]) returns void language sql as $$
        update public.calendar_auto_connections set dirty_version=dirty_version+1,next_run_at=least(next_run_at,now()) where user_id=any(p_users) and enabled and not needs_reconnect
      $$;
      insert into public.profiles values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','owner',true),
        ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000020','owner',true),
        ('00000000-0000-0000-0000-000000000003',null,'worker',true);
      insert into public.calendar_auto_connections select id,true,false,0,now()+interval '1 day' from public.profiles;
      insert into public.workers values ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000010',true);
    `);
    const migration=fs.readdirSync(new URL('../supabase/migrations',import.meta.url)).find(n=>n.endsWith('_calendar_owner_company_sites.sql'));
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
    await db.exec(`create trigger calendar_auto_queue after insert or update or delete on public.sites for each row execute function app_private.calendar_auto_changed();
      create trigger calendar_auto_queue after insert or update or delete on public.profiles for each row execute function app_private.calendar_auto_changed();
      update public.calendar_auto_connections set dirty_version=0;
      insert into public.sites values ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000010','현장','scheduled',array['2026-11-17']::date[]);
    `);
    const versions=async()=>(await db.query('select user_id::text,dirty_version::int from public.calendar_auto_connections order by user_id')).rows.map(r=>r.dirty_version);
    assert.deepEqual(await versions(),[1,0,0]);
    await db.exec(`insert into public.site_daily_assignments values ('00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','member','2026-11-17');
      update public.sites set site_name='변경' where id='00000000-0000-0000-0000-000000000040';`);
    assert.deepEqual(await versions(),[3,0,2]);
    await db.exec("update public.profiles set role='worker' where id='00000000-0000-0000-0000-000000000001'");
    assert.deepEqual(await versions(),[5,0,2]);
  } finally {await db.close();}
});
