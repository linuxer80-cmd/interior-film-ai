import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let PGlite;

if (process.env.LABOR_PGLITE_PATH) {
  ({ PGlite } = await import(process.env.LABOR_PGLITE_PATH));
}

const enabled = Boolean(PGlite);

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

const action = (db, actor, kind, target = null) =>
  db.query(
    "select public.labor_action($1,$2,$3,$4)",
    [actor, ids.job, kind, target]
  );

const rows = async (db, table) =>
  (await db.query(`select * from public.${table}`)).rows;

test(
  "SQL migrations execute and are rerunnable",
  { skip: !enabled },
  async () => {
    const db = await database();

    try {
      await db.exec(
        readFileSync(
          new URL(
            "../database/labor_market_workflow.sql",
            import.meta.url
          ),
          "utf8"
        )
      );

      assert.equal((await rows(db, "labor_jobs")).length, 1);
    } finally {
      await db.close();
    }
  }
);

test(
  "application notifies owner; acceptance assigns site and explicit finish expires other applicants",
  { skip: !enabled },
  async () => {
    const db = await database();

    try {
      await action(db, ids.w1, "apply");
      await action(db, ids.w2, "apply");

      assert.equal(
        (await rows(db, "labor_notifications")).filter(
          (notice) => notice.user_id === ids.owner
        ).length,
        2
      );

      await action(db, ids.owner, "accept", ids.w1);
      assert.equal((await rows(db, "labor_jobs"))[0].status, "open");
      await action(db, ids.owner, "finish");

      assert.equal(
        (await rows(db, "labor_jobs"))[0].status,
        "closed"
      );

      const apps = await rows(db, "labor_applications");

      assert.equal(
        apps.find((app) => app.user_id === ids.w1).status,
        "accepted"
      );

      assert.equal(
        apps.find((app) => app.user_id === ids.w2).status,
        "expired"
      );

      const workers = await rows(db, "workers");

      assert.equal(workers.length, 1);
      assert.equal(workers[0].user_id, ids.w1);
      assert.equal((await rows(db, "site_workers")).length, 1);
      assert.equal(
        (await rows(db, "site_daily_assignments")).length,
        1
      );

      assert.equal(
        (await rows(db, "worker_private_details"))[0].account_number,
        "123456"
      );

      const notices = await rows(db, "labor_notifications");

      assert.ok(
        notices.find(
          (notice) =>
            notice.user_id === ids.w1 &&
            notice.link === `/worker/site/${ids.site}`
        )
      );

      assert.ok(
        notices.find(
          (notice) =>
            notice.user_id === ids.w2 &&
            notice.title === "지원이 만료되었습니다"
        )
      );

      await assert.rejects(
        action(db, ids.owner, "accept", ids.w2)
      );

      assert.equal((await rows(db, "workers")).length, 1);
    } finally {
      await db.close();
    }
  }
);

test(
  "multiple hires keep job open until explicit finish",
  { skip: !enabled },
  async () => {
    const db = await database(2);

    try {
      await action(db, ids.w1, "apply");
      await action(db, ids.w2, "apply");
      await action(db, ids.owner, "accept", ids.w1);

      assert.equal(
        (await rows(db, "labor_jobs"))[0].status,
        "open"
      );

      await action(db, ids.owner, "accept", ids.w2);
      assert.equal((await rows(db, "labor_jobs"))[0].status, "open");
      await action(db, ids.owner, "finish");

      assert.equal(
        (await rows(db, "labor_jobs"))[0].status,
        "closed"
      );

      assert.equal(
        (await rows(db, "site_daily_assignments")).length,
        2
      );
    } finally {
      await db.close();
    }
  }
);

test(
  "other owner cannot hire or close; worker cannot act on someone else",
  { skip: !enabled },
  async () => {
    const db = await database();

    try {
      await action(db, ids.w1, "apply");

      await assert.rejects(
        action(db, ids.other, "accept", ids.w1)
      );

      await assert.rejects(
        action(db, ids.other, "close")
      );

      await assert.rejects(
        action(db, ids.w2, "withdraw", ids.w1)
      );

      assert.equal(
        (await rows(db, "labor_applications"))[0].status,
        "applied"
      );
    } finally {
      await db.close();
    }
  }
);

test(
  "failed assignment rolls back hire, notification and new worker creation",
  { skip: !enabled },
  async () => {
    const db = await database();

    try {
      await action(db, ids.w1, "apply");

      const before =
        (await rows(db, "labor_notifications")).length;

      await db.query(
        "update sites set company_id=null where id=$1",
        [ids.site]
      );

      await assert.rejects(
        action(db, ids.owner, "accept", ids.w1)
      );

      assert.equal((await rows(db, "workers")).length, 0);
      assert.equal(
        (await rows(db, "labor_applications"))[0].status,
        "applied"
      );
      assert.equal(
        (await rows(db, "labor_notifications")).length,
        before
      );
    } finally {
      await db.close();
    }
  }
);

test(
  "deadline expiry notifies pending applicants exactly once and preserves accepted assignments",
  { skip: !enabled },
  async () => {
    const db = await database(2);

    try {
      await action(db, ids.w1, "apply");
      await action(db, ids.w2, "apply");
      await action(db, ids.owner, "accept", ids.w1);

      await db.query(
        `update labor_jobs set
          work_date=(now() at time zone 'Asia/Seoul')::date-2,
          end_date=(now() at time zone 'Asia/Seoul')::date-1
        where id=$1`,
        [ids.job]
      );

      await db.query("select expire_labor_jobs()");
      await db.query("select expire_labor_jobs()");

      const notices = await rows(db, "labor_notifications");

      assert.equal(
        notices.filter(
          (notice) =>
            notice.user_id === ids.w2 &&
            notice.title === "지원이 만료되었습니다"
        ).length,
        1
      );

      assert.equal(
        (await rows(db, "labor_applications")).find(
          (app) => app.user_id === ids.w1
        ).status,
        "accepted"
      );

      assert.equal((await rows(db, "site_workers")).length, 1);
    } finally {
      await db.close();
    }
  }
);

test(
  "confirmed hire cannot be withdrawn from application list",
  { skip: !enabled },
  async () => {
    const db = await database();

    try {
      await action(db, ids.w1, "apply");
      await action(db, ids.owner, "accept", ids.w1);

      await assert.rejects(
        action(db, ids.w1, "withdraw")
      );

      assert.equal((await rows(db, "site_workers")).length, 1);
    } finally {
      await db.close();
    }
  }
);

test(
  "cross-company overlapping assignments reject hire and roll back the new worker",
  { skip: !enabled },
  async () => {
    const db = await database();

    try {
      await db.query(
        "insert into companies(id) values($1)",
        [ids.other]
      );

      await db.query(
        `insert into sites values(
          $1,$1,'scheduled',
          array[(now() at time zone 'Asia/Seoul')::date+1]
        )`,
        [ids.other]
      );

      const worker = (
        await db.query(
          `insert into workers(
            company_id,user_id,name,is_active,daily_wage
          ) values($1,$2,'기존 시공자',true,300000)
          returning id`,
          [ids.other, ids.w1]
        )
      ).rows[0];

      await db.query(
        `insert into site_daily_assignments(
          company_id,site_id,worker_id,work_date,role
        ) values(
          $1,$1,$2,
          (now() at time zone 'Asia/Seoul')::date+1,
          'member'
        )`,
        [ids.other, worker.id]
      );

      await action(db, ids.w1, "apply");

      await assert.rejects(
        action(db, ids.owner, "accept", ids.w1)
      );

      assert.equal((await rows(db, "workers")).length, 1);
      assert.equal(
        (await rows(db, "labor_applications"))[0].status,
        "applied"
      );
      assert.equal((await rows(db, "site_workers")).length, 0);
    } finally {
      await db.close();
    }
  }
);

test(
  "existing worker is reused without changing contract wage; accepted hire is idempotent",
  { skip: !enabled },
  async () => {
    const db = await database(2);

    try {
      await db.query(
        `insert into workers(
          company_id,user_id,name,is_active,daily_wage
        ) values($1,$2,'기존 시공자',true,310000)`,
        [ids.company, ids.w1]
      );

      await action(db, ids.w1, "apply");
      await action(db, ids.owner, "accept", ids.w1);

      await assert.rejects(
        action(db, ids.owner, "accept", ids.w1)
      );

      assert.equal((await rows(db, "workers")).length, 1);

      assert.equal(
        Number((await rows(db, "workers"))[0].daily_wage),
        310000
      );

      assert.equal(
        (await rows(db, "site_daily_assignments")).length,
        1
      );
    } finally {
      await db.close();
    }
  }
);

test(
  "authenticated clients cannot read private inbox or invoke privileged hire RPC",
  { skip: !enabled },
  async () => {
    const db = await database();

    try {
      await db.exec("set role authenticated");

      await assert.rejects(
        db.query("select * from labor_personal_details")
      );

      await assert.rejects(
        db.query("select * from labor_notifications")
      );

      await assert.rejects(
        action(db, ids.owner, "accept", ids.w1)
      );
    } finally {
      await db.exec("reset role");
      await db.close();
    }
  }
);

test(
  "changed site dates cannot receive a stale recruitment assignment",
  { skip: !enabled },
  async () => {
    const db = await database();

    try {
      await action(db, ids.w1, "apply");

      await db.query(
        "update sites set work_dates=array[]::date[] where id=$1",
        [ids.site]
      );

      await assert.rejects(
        action(db, ids.owner, "accept", ids.w1)
      );

      assert.equal(
        (await rows(db, "site_daily_assignments")).length,
        0
      );

      assert.equal((await rows(db, "workers")).length, 0);
    } finally {
      await db.close();
    }
  }
);


test("assignment replacement preserves acceptance; full removal clears consent and permits reapply", {skip: !enabled}, async () => {
 const db = await database();
 try {
  await action(db, ids.w1, "apply");
  await action(db, ids.owner, "accept", ids.w1);
  await db.exec(`begin;
    create temporary table saved_assignments as select * from site_daily_assignments;
    delete from site_daily_assignments;
    insert into site_daily_assignments select * from saved_assignments;
    commit;`);
  assert.equal((await rows(db,"labor_applications"))[0].status,"accepted");
  await db.exec("delete from site_daily_assignments");
  const app = (await rows(db,"labor_applications"))[0];
  assert.equal(app.status,"unassigned");
  assert.equal(app.share_phone,false);
  await action(db, ids.w1, "apply");
  assert.equal((await rows(db,"labor_applications"))[0].status,"applied");
 } finally { await db.close(); }
});

test("cancelled site reconciles acceptance and repair is rerunnable", {skip: !enabled}, async () => {
 const db = await database();
 try {
  await db.exec(readFileSync(new URL("../database/labor_market_consistency.sql",import.meta.url),"utf8"));
  await action(db, ids.w1, "apply");
  await action(db, ids.owner, "accept", ids.w1);
  await db.query("update sites set status='cancelled' where id=$1",[ids.site]);
  assert.equal((await rows(db,"labor_applications"))[0].status,"unassigned");
 } finally { await db.close(); }
});

test(
  "cancelled cross-company assignments do not block a new hire",
  { skip: !enabled },
  async () => {
    const db = await database();

    try {
      await db.query(
        "insert into companies(id) values($1)",
        [ids.other]
      );

      await db.query(
        `insert into sites values(
          $1,$1,'cancelled',
          array[(now() at time zone 'Asia/Seoul')::date+1]
        )`,
        [ids.other]
      );

      const worker = (
        await db.query(
          `insert into workers(
            company_id,user_id,name,is_active,daily_wage
          ) values($1,$2,'기존 시공자',true,300000)
          returning id`,
          [ids.other, ids.w1]
        )
      ).rows[0];

      await db.query(
        `insert into site_daily_assignments(
          company_id,site_id,worker_id,work_date,role
        ) values(
          $1,$1,$2,
          (now() at time zone 'Asia/Seoul')::date+1,
          'member'
        )`,
        [ids.other, worker.id]
      );

      await action(db, ids.w1, "apply");

      await action(db, ids.owner, "accept", ids.w1);
      assert.equal((await rows(db,"labor_applications"))[0].status,"accepted");
      assert.equal((await rows(db,"workers")).length,2);
    } finally {
      await db.close();
    }
  }
);


test("authenticated owner saves site; private reconciliation denies foreign company and direct RPC", {skip: !enabled}, async () => {
 const db=await database();
 try {
  await action(db,ids.w1,"apply");
  await action(db,ids.owner,"accept",ids.w1);
  await db.exec("grant usage on schema auth to authenticated; grant select,update on sites to authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.owner]);
  await db.exec("set role authenticated");
  await db.query("update sites set status='cancelled' where id=$1",[ids.site]);
  await assert.rejects(db.query("select public.reconcile_labor_assignment($1)",[ids.site]));
  await db.exec("reset role");
  assert.equal((await rows(db,"labor_applications"))[0].status,"unassigned");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.other]);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("update sites set status='scheduled' where id=$1",[ids.site]),/Company access denied/);
  await db.exec("reset role");
  await db.exec(readFileSync(new URL("../database/labor_assignment_permissions_fix.sql",import.meta.url),"utf8"));
 } finally { await db.close(); }
});

async function installRelationships(db) {
 for(const file of ['worker_relationships.sql']) {
  await db.exec(readFileSync(new URL(`../database/${file}`,import.meta.url),'utf8'));
 }
}
async function relation(db,actor,kind,body={}) {
 return (await db.query('select public.worker_relationship_action($1,$2,$3) as result',[actor,kind,JSON.stringify(body)])).rows[0].result;
}
async function rated(db,target,amount=250000) {
 return db.query("select public.labor_action_registered_wage($1,$2,'accept',$3,$4)",[ids.owner,ids.job,target,amount]);
}
test('relationship requires worker consent then owner confirmation; foreign owner and duplicate account denied',{skip:!enabled},async()=>{
 const db=await database();
 try{
  await installRelationships(db);
  const w=(await db.query("insert into workers(company_id,name,phone,daily_wage) values($1,'직원','010',200000) returning id",[ids.company])).rows[0];
  const invitation=await relation(db,ids.owner,'invite',{workerId:w.id,relationshipType:'employee'});
  await assert.rejects(relation(db,ids.owner,'approve',{code:invitation.code}),/먼저 초대를 수락/);
  await relation(db,ids.w1,'accept',{code:invitation.code,verifiedEmail:'test@example.com'});
  assert.equal((await db.query('select user_id from workers where id=$1',[w.id])).rows[0].user_id,null);
  await assert.rejects(relation(db,ids.w2,'accept',{code:invitation.code}),/다른 계정/);
  await assert.rejects(relation(db,ids.w2,'approve',{code:invitation.code}),/관리자/);
  await relation(db,ids.owner,'approve',{code:invitation.code});
  assert.equal((await relation(db,ids.w1,'mine')).relationships[0].relationship_type,'employee');
  const second=(await db.query("insert into workers(company_id,name) values($1,'중복') returning id",[ids.company])).rows[0];
  const invitation2=await relation(db,ids.owner,'invite',{workerId:second.id,relationshipType:'employee'});
  await relation(db,ids.w1,'accept',{code:invitation2.code});
  await assert.rejects(relation(db,ids.owner,'approve',{code:invitation2.code}),/이미 업체 명단/);
  await relation(db,ids.owner,'end',{workerId:w.id});
  assert.equal((await relation(db,ids.w1,'mine')).relationships.length,0);
  assert.equal((await db.query('select user_id,is_active from workers where id=$1',[w.id])).rows[0].user_id,ids.w1);
 }finally{await db.close();}
});
test('registered wage overrides lower recruitment amount; changed profile cannot reprice confirmed assignments',{skip:!enabled},async()=>{
 const db=await database();
 try{
  await installRelationships(db);
  await db.query('update labor_jobs set daily_wage=200000 where id=$1',[ids.job]);
  await action(db,ids.w1,'apply');
  await assert.rejects(rated(db,ids.w1,200000),/일당이 변경/);
  await rated(db,ids.w1);
  const application=(await rows(db,'labor_applications'))[0];
  assert.equal(Number(application.accepted_daily_wage),250000);
  assert.equal(Number((await rows(db,'worker_assignment_wages'))[0].daily_wage),250000);
  await db.query('update labor_profiles set daily_wage=300000 where user_id=$1',[ids.w1]);
  const assignment=(await rows(db,'site_daily_assignments'))[0];
  await db.query("update site_daily_assignments set work_date=work_date where id=$1",[assignment.id]);
  assert.equal(Number((await rows(db,'worker_assignment_wages'))[0].daily_wage),250000);
  await db.query("insert into site_daily_assignments(company_id,site_id,worker_id,work_date,role) values($1,$2,$3,$4::date+1,'member')",[ids.company,ids.site,assignment.worker_id,assignment.work_date]);
  assert.deepEqual((await rows(db,'worker_assignment_wages')).map(r=>Number(r.daily_wage)).sort(),[250000,300000]);
  // Install is idempotent and does not rewrite accepted amounts.
  await installRelationships(db);
  assert.equal(Number((await rows(db,'labor_applications'))[0].accepted_daily_wage),250000);
 }finally{await db.close();}
});
test('direct hire uses registered wage despite lower recruitment budget',{skip:!enabled},async()=>{
 const db=await database();
 try{
  await installRelationships(db);
  await db.query('update labor_jobs set daily_wage=200000 where id=$1',[ids.job]);
  await db.query('update labor_profiles set direct_hire_consent=true,available_dates=(select work_dates from labor_jobs where id=$1) where user_id=$2',[ids.job,ids.w1]);
  await db.query("select public.labor_action_registered_wage($1,$2,'direct_hire',$3,250000)",[ids.owner,ids.job,ids.w1]);
  assert.equal(Number((await rows(db,'labor_applications'))[0].accepted_daily_wage),250000);
 }finally{await db.close();}
});
test('expired, cancelled and bound-account invites cannot connect; anonymous RPC execution is denied',{skip:!enabled},async()=>{
 const db=await database();
 try{
  await installRelationships(db);
  const w=(await db.query("insert into workers(company_id,user_id,name) values($1,$2,'기존') returning id",[ids.company,ids.w1])).rows[0];
  const i=await relation(db,ids.owner,'invite',{workerId:w.id,relationshipType:'employee'});
  await assert.rejects(relation(db,ids.w2,'preview',{code:i.code}),/초대받은 계정/);
  await db.query("update worker_relationship_invites set expires_at=now()-interval '1 minute' where id=$1",[i.code]);
  await assert.rejects(relation(db,ids.w1,'accept',{code:i.code}),/만료/);
  const next=await relation(db,ids.owner,'invite',{workerId:w.id,relationshipType:'freelancer'});
  await relation(db,ids.owner,'cancel',{code:next.code});
  await assert.rejects(relation(db,ids.w1,'accept',{code:next.code}),/종료/);
  await db.exec('set role authenticated');
  await assert.rejects(relation(db,ids.owner,'list'),/permission denied/);
  await assert.rejects(db.query('select * from worker_relationship_invites'),/permission denied/);
  await db.exec('reset role');
 }finally{await db.close();}
});
