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
    "labor_proposal_applications.sql",
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
const finalize=(db,job,actor=ids.owner)=>db.query("select finalize_labor_job_proposal($1,$2,'accept',$3,250000)",[actor,job,ids.w1]);
async function otherOffer(db){
 const co='88888888-8888-4888-8888-888888888888';
 await db.query('insert into companies(id) values($1)',[co]);
 await db.query("insert into profiles(id,company_id,role) values($1,$2,'owner')",[ids.other,co]);
 await db.query("insert into sites(id,company_id,status,work_dates) select $1,$2,'scheduled',work_dates from sites where id=$3",[ids.other,co,ids.site]);
 const doc=(await db.query('select to_jsonb(j) doc from labor_jobs j where id=$1',[ids.job])).rows[0].doc;
 return (await db.query('select create_labor_job_proposal($1,$2,$3,250000) result',[ids.other,ids.w1,JSON.stringify({...doc,site_id:ids.other,company_id:co})])).rows[0].result.id;
}
test('several company offers remain applications until manager chooses; final assignment expires overlapping offers',async()=>{
 const db=await database();try{
 const j1=await proposal(db),j2=await otherOffer(db);
 await reply(db,j1);await reply(db,j1);await reply(db,j2);
 assert.equal((await db.query('select count(*)::int n from site_daily_assignments')).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from labor_applications where status='applied'")).rows[0].n,2);
 assert.equal((await db.query('select cardinality(available_dates) n from labor_profiles where user_id=$1',[ids.w1])).rows[0].n,3);
 await assert.rejects(finalize(db,j1,ids.other),/본인 업체/);
 await finalize(db,j1);
 assert.equal((await db.query('select count(*)::int n from site_daily_assignments')).rows[0].n,1);
 assert.equal((await db.query('select status from labor_applications where job_id=$1',[j2])).rows[0].status,'expired');
 assert.equal((await db.query('select status from labor_jobs where id=$1',[j2])).rows[0].status,'open');
 assert.equal((await db.query('select cardinality(available_dates) n from labor_profiles where user_id=$1',[ids.w1])).rows[0].n,2);
 assert.equal(Number((await db.query('select accepted_daily_wage from labor_applications where job_id=$1',[j1])).rows[0].accepted_daily_wage),250000);
 }finally{await db.close();}
});
test('wrong recipient cannot apply, and decline leaves availability unchanged',async()=>{
 const db=await database();try{
 const j=await proposal(db);await assert.rejects(reply(db,j,true,ids.w2),/본인에게/);await reply(db,j,false);
 assert.equal((await db.query('select count(*)::int n from site_daily_assignments')).rows[0].n,0);
 assert.equal((await db.query('select cardinality(available_dates) n from labor_profiles where user_id=$1',[ids.w1])).rows[0].n,3);
 }finally{await db.close();}
});
test('changed wage prevents manager finalization without consuming the application',async()=>{
 const db=await database();try{
 const j=await proposal(db);await reply(db,j);await db.query('update labor_profiles set daily_wage=260000 where user_id=$1',[ids.w1]);
 await assert.rejects(finalize(db,j),/일당/);
 assert.equal((await db.query('select status from labor_applications where job_id=$1',[j])).rows[0].status,'applied');
 assert.equal((await db.query('select count(*)::int n from site_daily_assignments')).rows[0].n,0);
 }finally{await db.close();}
});
test('ordinary job lets manager choose one applicant and only that worker gets an assignment',async()=>{
 const db=await database();try{
 await proposal(db); // prepare availability for w1; separate ordinary job below
 await db.query("select labor_action($1,$2,'apply',null)",[ids.w1,ids.job]);
 await db.query("select labor_action($1,$2,'apply',null)",[ids.w2,ids.job]);
 await db.query("select labor_action_registered_wage($1,$2,'accept',$3,250000)",[ids.owner,ids.job,ids.w2]);
 const rows=(await db.query('select w.user_id from site_daily_assignments d join workers w on w.id=d.worker_id')).rows;
 assert.deepEqual(rows,[{user_id:ids.w2}]);
 assert.equal((await db.query('select status from labor_applications where job_id=$1 and user_id=$2',[ids.job,ids.w1])).rows[0].status,'applied');
 }finally{await db.close();}
});
test('upgrade is rerunnable and no reply or finalize RPC is executable by authenticated clients',async()=>{
 const db=await database();try{
 await db.exec(readFileSync(new URL('../database/labor_proposal_applications.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select labor_proposal_capabilities() v')).rows[0].v.version,2);
 assert.equal((await db.query("select has_function_privilege('authenticated','finalize_labor_job_proposal(uuid,uuid,text,uuid,numeric)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
