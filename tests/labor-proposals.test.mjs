import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {PGlite} from '@electric-sql/pglite';

const ids = {
  owner: "11111111-1111-4111-8111-111111111111",
  w1: "22222222-2222-4222-8222-222222222222",
  w2: "33333333-3333-4333-8333-333333333333",
  company: "44444444-4444-4444-8444-444444444444",
  job: "55555555-5555-4555-8555-555555555555",
  site: "66666666-6666-4666-8666-666666666666",
  other: "77777777-7777-4777-8777-777777777777",
};

async function database(headcount = 1) {
  const db = new PGlite();

  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table auth.users(id uuid primary key);

    create table public.companies(
      id uuid primary key,
      is_active boolean default true
    );

    create table public.profiles(
      id uuid primary key,
      company_id uuid,
      role text,
      is_active boolean default true
    );

    create table public.workers(
      id uuid primary key default gen_random_uuid(),
      company_id uuid references companies(id),
      user_id uuid,
      name text,
      phone text,
      position text,
      is_active boolean default true,
      daily_wage numeric,
      created_at timestamptz default now()
    );

    create table public.sites(
      id uuid primary key,
      company_id uuid references companies(id),
      status text,
      work_dates date[]
    );

    create table public.site_workers(
      id uuid primary key default gen_random_uuid(),
      company_id uuid,
      site_id uuid,
      worker_id uuid,
      role text,
      unique(site_id,worker_id)
    );

    create schema storage;

    create table storage.buckets(
      id text primary key,
      name text,
      public boolean,
      file_size_limit bigint,
      allowed_mime_types text[]
    );

    create table storage.objects(
      id uuid,
      bucket_id text
    );

    alter table storage.objects enable row level security;
  `);

  for (const file of [
    "labor_market.sql",
    "site_daily_assignments.sql",
    "labor_market_workflow.sql",
    "labor_market_consistency.sql",
    "worker_relationships.sql",
    "labor_job_proposals.sql",
  ]) {
    await db.exec(
      readFileSync(
        new URL(`../database/${file}`, import.meta.url),
        "utf8"
      )
    );
  }

  await db.query(
    "insert into auth.users(id) select unnest($1::uuid[])",
    [[ids.owner, ids.w1, ids.w2, ids.other]]
  );

  await db.query(
    "insert into companies(id) values($1)",
    [ids.company]
  );

  await db.query(
    "insert into profiles(id,company_id,role) values($1,$2,'owner')",
    [ids.owner, ids.company]
  );

  await db.query(
    `insert into sites values(
      $1,$2,'scheduled',
      array[(now() at time zone 'Asia/Seoul')::date+1]
    )`,
    [ids.site, ids.company]
  );

  for (const id of [ids.w1, ids.w2]) {
    await db.query(
      `insert into labor_profiles(
        user_id,name,region,daily_wage,seeking,published
      ) values($1,'시공자','인천',250000,true,true)`,
      [id]
    );

    await db.query(
      `insert into labor_personal_details(
        user_id,phone,bank_name,account_number,account_holder
      ) values($1,'01012345678','은행','123456','시공자')`,
      [id]
    );
  }

  await db.query(
    `insert into labor_jobs(
      id,company_id,created_by,title,region,address,
      work_content,work_date,end_date,headcount,site_id,work_dates
    ) values(
      $1,$2,$3,'필름 구인','인천 서구','인천 서구','문 시공',
      (now() at time zone 'Asia/Seoul')::date+1,
      (now() at time zone 'Asia/Seoul')::date+1,
      $4,$5,array[(now() at time zone 'Asia/Seoul')::date+1]
    )`,
    [ids.job, ids.company, ids.owner, headcount, ids.site]
  );

  return db;
}

async function proposal(db,target=ids.w1){
 await db.query(`update labor_profiles set available_dates=array[(now() at time zone 'Asia/Seoul')::date+1,(now() at time zone 'Asia/Seoul')::date+2,(now() at time zone 'Asia/Seoul')::date+3],direct_hire_consent=true where user_id=$1`,[target]);
 const job=(await db.query('select to_jsonb(j) as doc from labor_jobs j where id=$1',[ids.job])).rows[0].doc;
 return (await db.query('select create_labor_job_proposal($1,$2,$3,$4) as result',[ids.owner,target,JSON.stringify(job),250000])).rows[0].result.id;
}
const reply=(db,job,accept=true,actor=ids.w1,wage=250000)=>db.query('select reply_labor_job_proposal($1,$2,$3,$4)',[actor,job,accept,wage]);
test('proposal is private, creates no assignment until acceptance, preserves other dates and snapshots wage',async()=>{
 const db=await database();try{
 const job=await proposal(db);
 assert.equal((await db.query('select count(*)::int n from site_daily_assignments')).rows[0].n,0);
 assert.equal((await db.query('select status from labor_applications where job_id=$1',[job])).rows[0].status,'invited');
 assert.equal((await db.query('select proposal_user_id from labor_jobs where id=$1',[job])).rows[0].proposal_user_id,ids.w1);
 await assert.rejects(reply(db,job,true,ids.w2),/본인에게/);
 await reply(db,job);await reply(db,job);
 assert.equal((await db.query('select count(*)::int n from site_daily_assignments')).rows[0].n,1);
 assert.equal(Number((await db.query('select accepted_daily_wage from labor_applications where job_id=$1',[job])).rows[0].accepted_daily_wage),250000);
 const profile=(await db.query('select cardinality(available_dates) n,seeking from labor_profiles where user_id=$1',[ids.w1])).rows[0];
 assert.deepEqual(profile,{n:2,seeking:true});
 assert.equal((await db.query('select count(*)::int n from worker_assignment_wages')).rows[0].n,1);
 }finally{await db.close();}
});
test('declining a proposal retains dates and creates no assignments; duplicate proposals are rejected',async()=>{
 const db=await database();try{
 const job=await proposal(db);await assert.rejects(proposal(db),/이미 대기/);
 await reply(db,job,false);await reply(db,job,false);
 assert.equal((await db.query('select status from labor_jobs where id=$1',[job])).rows[0].status,'closed');
 assert.equal((await db.query('select cardinality(available_dates) n from labor_profiles where user_id=$1',[ids.w1])).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from site_daily_assignments')).rows[0].n,0);
 }finally{await db.close();}
});
test('changed wage or site dates roll back acceptance, sharing and assignments together',async()=>{
 const db=await database();try{
 const job=await proposal(db);
 await db.query('update labor_profiles set daily_wage=260000 where user_id=$1',[ids.w1]);
 await assert.rejects(reply(db,job),/일당이 변경/);
 await db.query('update labor_profiles set daily_wage=250000 where user_id=$1',[ids.w1]);
 await db.query("update sites set work_dates='{}' where id=$1",[ids.site]);
 await assert.rejects(reply(db,job),/현장 일정/);
 const a=(await db.query('select status,share_phone from labor_applications where job_id=$1',[job])).rows[0];
 assert.deepEqual(a,{status:'invited',share_phone:false});
 assert.equal((await db.query('select count(*)::int n from site_daily_assignments')).rows[0].n,0);
 }finally{await db.close();}
});
test('migration reruns, RPCs are service-only, and a full schedule stops seeking',async()=>{
 const db=await database();try{
 await db.exec(readFileSync(new URL('../database/labor_job_proposals.sql',import.meta.url),'utf8'));
 const job=await proposal(db);
 await db.query('update labor_profiles set available_dates=(select work_dates from labor_jobs where id=$1) where user_id=$2',[job,ids.w1]);
 await reply(db,job);
 assert.deepEqual((await db.query('select seeking,cardinality(available_dates) n from labor_profiles where user_id=$1',[ids.w1])).rows[0],{seeking:false,n:0});
 const acl=(await db.query("select has_function_privilege('authenticated','public.reply_labor_job_proposal(uuid,uuid,boolean,numeric)','execute') allowed")).rows[0];assert.equal(acl.allowed,false);
 }finally{await db.close();}
});
test('conflicting assignment blocks acceptance without consuming availability or sharing contact',async()=>{
 const db=await database();try{
 const job=await proposal(db);
 await db.query("insert into sites(id,company_id,status,work_dates) select $1,company_id,'scheduled',work_dates from sites where id=$2",[ids.other,ids.site]);
 await db.query("insert into workers(id,company_id,user_id,name,phone,is_active) values($1,$2,$1,'시공자','01012345678',true)",[ids.w1,ids.company]);
 await db.query("insert into site_daily_assignments(company_id,site_id,worker_id,work_date,role) select company_id,id,$1,unnest(work_dates),'member' from sites where id=$2",[ids.w1,ids.other]);
 await assert.rejects(reply(db,job),/다른 현장 배정/);
 assert.deepEqual((await db.query('select status,share_phone from labor_applications where job_id=$1',[job])).rows[0],{status:'invited',share_phone:false});
 assert.equal((await db.query('select cardinality(available_dates) n from labor_profiles where user_id=$1',[ids.w1])).rows[0].n,3);
 }finally{await db.close();}
});
