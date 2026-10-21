import { scopeLaborNotifications } from '../lib/laborNotificationPolicy.mjs';
import { attachAssignmentState } from '../lib/laborContracts.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  publicProfileFields,
  dayInKorea,
  fail,
  cleanProfile,
  cleanJob,
  nextApplication,
  roughRegion,
} from "../lib/laborMarket.mjs";

const owner = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const company = "44444444-4444-4444-8444-444444444444";
const jobId = "55555555-5555-4555-8555-555555555555";
const siteId = "66666666-6666-4666-8666-666666666666";

const baseProfile = {
  user_id: worker,
  name: "시공자",
  age: null,
  daily_wage: 250000,
  region: "인천",
  skills: ["샤시"],
  experience_years: 5,
  introduction: "소개",
  available_dates: [dayInKorea()],
  seeking: true,
  published: true,
  photo_path: null,
};

const baseJob = {
  site_id: siteId,
  id: jobId,
  company_id: company,
  created_by: owner,
  title: "구인",
  region: "인천",
  address: "공개 주소",
  work_content: "샤시 시공",
  work_date: dayInKorea(),
  end_date: dayInKorea(),
  daily_wage: 250000,
  headcount: 1,
  skills: ["샤시"],
  min_experience: 1,
  status: "open",
};

function fixture(userId = owner, manager = true, proposals = false) {
  const tables = {
    profiles: [
      {
        id: userId,
        company_id: manager ? company : null,
        role: manager ? "owner" : "worker",
        is_active: true,
      },
    ],
    companies: [
      {
        id: company,
        company_name: "업체",
        is_active: true,
      },
    ],
    labor_profiles: [{ ...baseProfile }],
    labor_personal_details: [
      {
        user_id: worker,
        phone: "01012345678",
        account_number: "private-account",
        departure_address: "private-address",
      },
    ],
    labor_jobs: [{ ...baseJob }],
    labor_applications: [],
    labor_notifications: [],
    sites: [
      {
        id: siteId,
        company_id: company,
        region: "인천",
        address: "private-site-address",
        work_type: "필름",
        work_description: "문 시공",
        work_dates: [dayInKorea()],
        status: "scheduled",
      },
    ],
  };

  const rpc = [];

  const db = {
    from(table) {
      const filters = [];
      let fields = "*";
      let single = false;
      let mutation = null;
      let inserted = null;

      const query = {
        select(value) {
          fields = value;
          return query;
        },
        eq(key, value) {
          filters.push((row) => row[key] === value);
          return query;
        },
        or(expression) {
          const id=expression.split('proposal_user_id.eq.')[1];
          filters.push(row=>row.proposal_user_id==null||row.proposal_user_id===id);return query;
        },
        neq(key, value) {
          filters.push((row) => row[key] !== value);
          return query;
        },
        not(key, operator, value) {
          assert.equal(operator, 'like');
          filters.push((row) => !String(row[key] || '').startsWith(value.slice(0, -1)));
          return query;
        },
        gte(key, value) {
          filters.push((row) => row[key] >= value);
          return query;
        },
        in(key, value) {
          filters.push((row) => value.includes(row[key]));
          return query;
        },
        order() {
          return query;
        },
        range() {
          return query;
        },
        limit() {
          return query;
        },
        ilike() {
          return query;
        },
        contains(key, value) {
          filters.push((row) =>
            value.every((item) => row[key].includes(item))
          );
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        single() {
          single = true;
          return query;
        },
        insert(row) {
          inserted = row;
          return query;
        },
        update(row) {
          mutation = row;
          return query;
        },
        then(resolve) {
          if (inserted) {
            tables[table].push({ id: jobId, ...inserted });
          }

          const rows = tables[table].filter((row) =>
            filters.every((filter) => filter(row))
          );

          if (mutation) {
            rows.forEach((row) => Object.assign(row, mutation));
          }

          const projected = rows.map((row) =>
            fields === "*"
              ? { ...row }
              : Object.fromEntries(
                  fields.split(",").map((key) => [key, row[key]])
                )
          );

          resolve({
            data: single ? projected[0] || null : projected,
            error: null,
          });
        },
      };

      return query;
    },

    async rpc(name, args) {
      rpc.push({ name, args });
      if(name==='labor_proposal_capabilities')return {data:proposals?{version:proposals===1?1:2}:null,error:null};
      return { data: null, error: null };
    },

    storage: {
      from() {
        throw Error("no photo in fixture");
      },
    },
  };

  const source = readFileSync(
    new URL("../app/api/labor-market/route.js", import.meta.url),
    "utf8"
  )
    .replace(/^import .*;\n/gm, "")
    .replaceAll("export ", "");

  const args = {
    attachAssignmentState,
    scopeLaborNotifications,
    privateAuth: async () => ({
      db,
      user: {
        id: userId,
        email_confirmed_at: "2026-01-01",
      },
    }),
    json: (data, status = 200) => Response.json(data, { status }),
    cleanPrivate: (body) => ({
      bank_name: body.bank_name,
      account_number: body.account_number,
      account_holder: body.account_holder,
      departure_address: body.departure_address,
    }),
    uuid: (value) => /^[0-9a-f-]{36}$/.test(value || ""),
    publicProfileFields,
    dayInKorea,
    fail,
    cleanProfile,
    cleanJob,
    nextApplication,
    roughRegion,
    dispatchLaborNotifications: async () => {},
    directoryBadges: async (_db, rows) => rows,
    companyJobBadges: async (_db, rows) => rows,
  };

  const route = new Function(
    ...Object.keys(args),
    `${source};return {GET,POST};`
  )(...Object.values(args));

  return { tables, rpc, ...route };
}

const get = (path) =>
  new Request(`https://test.local/api/labor-market${path || ""}`);

const post = (body) =>
  new Request("https://test.local/api/labor-market", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("search lists public profiles without bank, phone or exact address", async () => {
  const f = fixture();
  const response = await f.GET(get());
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.candidates.length, 1);
  assert.ok(!JSON.stringify(data).includes("private-"));
  assert.ok(!JSON.stringify(data.candidates).includes("01012345678"));
});

test("unpublished profiles never appear in employer search", async () => {
  const f = fixture();
  f.tables.labor_profiles[0].published = false;

  const data = await (await f.GET(get())).json();
  assert.equal(data.candidates.length, 0);
});

test("worker cannot browse other applicants or candidate list", async () => {
  const f = fixture(worker, false);

  f.tables.labor_applications.push({
    id: "application",
    job_id: jobId,
    user_id: other,
    status: "applied",
    share_phone: true,
  });

  const data = await (await f.GET(get())).json();

  assert.deepEqual(data.applications, []);
  assert.deepEqual(data.candidates, []);
});

test("employer cannot close another company job", async () => {
  const f = fixture();
  f.tables.labor_jobs[0].company_id = other;

  const response = await f.POST(post({ action: "close", jobId }));

  assert.equal(response.status, 403);
  assert.equal(f.tables.labor_jobs[0].status, "open");
});

test("worker application ignores forged user id", async () => {
  const f = fixture(worker, false);

  const response = await f.POST(
    post({
      action: "apply",
      jobId,
      userId: other,
      share_phone: true,
    })
  );

  assert.equal(response.status, 200);
  assert.equal(f.rpc.at(-1).args.p_actor, worker);
  assert.equal(f.rpc.at(-1).args.p_target, null);
});

test("phone only shared for a consenting applied or accepted application", async () => {
  const f = fixture();

  f.tables.labor_applications.push({
    id: "application",
    job_id: jobId,
    user_id: worker,
    status: "invited",
    share_phone: false,
  });

  let data = await (await f.GET(get())).json();
  assert.equal(data.applications[0].phone, undefined);

  Object.assign(f.tables.labor_applications[0], {
    status: "applied",
    share_phone: true,
  });

  data = await (await f.GET(get())).json();

  assert.equal(data.applications[0].phone, "01012345678");
  assert.ok(!JSON.stringify(data).includes("private-account"));
});

test("profile save binds RPC user to verified caller and strips injected fields", async () => {
  const f = fixture(worker, false);

  const response = await f.POST(
    post({
      action: "profile",
      userId: other,
      profile: {
        ...baseProfile,
        company_id: other,
        age: "",
      },
      personal: {
        phone: "01012345678",
        bank_name: "은행",
        account_number: "123456",
        account_holder: "시공자",
        departure_address: "개인 주소",
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(f.rpc[0].args.p_user_id, worker);
  assert.equal(f.rpc[0].args.p_profile.company_id, undefined);
});

test("worker cannot publish a job and forged company id is ignored for owner", async () => {
  const job = {
    ...baseJob,
    publish_address: true,
    company_id: other,
  };

  const f = fixture(worker, false);
  assert.equal(
    (await f.POST(post({ action: "job", job }))).status,
    403
  );

  const employer = fixture();
  assert.equal(
    (await employer.POST(post({ action: "job", job }))).status,
    200
  );
  assert.equal(
    employer.tables.labor_jobs.at(-1).company_id,
    company
  );
});

test("unsupported transitions and incomplete public seeking are rejected", () => {
  assert.throws(() => nextApplication("invited", "accept", true));
  assert.throws(() => nextApplication("accepted", "invite", true));
  assert.throws(() =>
    cleanProfile({ ...baseProfile, published: false })
  );

  assert.equal(
    cleanJob({
      ...baseJob,
      daily_wage: "",
      min_experience: "",
    }).daily_wage,
    null
  );
});

test("owner cannot create a worker job-seeking profile or apply", async () => {
  const f = fixture();

  assert.equal(
    (
      await f.POST(
        post({
          action: "profile",
          profile: baseProfile,
          personal: {},
        })
      )
    ).status,
    403
  );

  assert.equal(
    (
      await f.POST(
        post({
          action: "apply",
          jobId,
          share_phone: true,
        })
      )
    ).status,
    403
  );
});

test("site defaults only disclose rough region and work content to its owner", async () => {
  const f = fixture();

  const response = await f.GET(
    get(`?mode=site&site=${siteId}`)
  );

  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.site.region, "인천");
  assert.equal(data.site.work_content, "필름\n문 시공");
  assert.ok(!JSON.stringify(data).includes("private-site-address"));

  f.tables.sites[0].company_id = other;

  assert.equal(
    (await f.GET(get(`?mode=site&site=${siteId}`))).status,
    403
  );
});

test("job creation rejects another company site", async () => {
  const f = fixture();
  f.tables.sites[0].company_id = other;

  assert.equal(
    (
      await f.POST(
        post({
          action: "job",
          job: baseJob,
        })
      )
    ).status,
    403
  );
});

test("blank optional requirements are absent values; inverted ages rejected", () => {
  const result = cleanJob({
    ...baseJob,
    daily_wage: "",
    min_experience: "",
    min_age: "",
    max_age: "",
    worker_region: "",
  });

  assert.equal(result.min_age, null);
  assert.equal(result.max_age, null);
  assert.equal(result.daily_wage, null);
  assert.equal(result.min_experience, null);

  assert.throws(() =>
    cleanJob({
      ...baseJob,
      min_age: 45,
      max_age: 25,
    })
  );
});

test("manager board never sends other companies recruiting ads", async () => {
  const f = fixture();

  f.tables.labor_jobs.push({
    ...baseJob,
    id: other,
    company_id: other,
  });

  const data = await (await f.GET(get())).json();

  assert.ok(data.jobs.every((job) => job.company_id === company));
});

test("notification read is scoped to the authenticated recipient", async () => {
  const f = fixture(worker, false);

  f.tables.labor_notifications.push({
    id: jobId,
    user_id: other,
    read_at: null,
  });

  assert.equal(
    (
      await f.POST(
        post({
          action: "read_notification",
          id: jobId,
        })
      )
    ).status,
    200
  );

  assert.equal(f.tables.labor_notifications[0].read_at, null);
});

test('private proposals are not listed or opened by an unrelated worker',async()=>{
 const f=fixture(other,false,true);f.tables.labor_jobs[0].proposal_user_id=worker;
 const listed=await f.GET(get());assert.equal(listed.status,200);assert.equal((await listed.json()).jobs.length,0);
 const linked=await f.GET(get('?job='+jobId));assert.equal(linked.status,200);assert.equal((await linked.json()).jobs.length,0);
});
test('proposal replies require explicit consent and server actor; legacy direct hire is disabled',async()=>{
 const f=fixture(worker,false,true);f.tables.labor_jobs[0].proposal_user_id=worker;
 assert.equal((await f.POST(post({action:'proposal_accept',jobId,expectedWage:250000}))).status,400);
 assert.equal((await f.POST(post({action:'apply',jobId,share_phone:true}))).status,409);
 const response=await f.POST(post({action:'proposal_accept',jobId,userId:other,expectedWage:250000,share_phone:true}));assert.equal(response.status,200);
 const call=f.rpc.find(r=>r.name==='reply_labor_job_proposal');assert.equal(call.args.p_actor,worker);assert.equal(call.args.p_accept,true);
 const manager=fixture();assert.equal((await manager.POST(post({action:'direct_hire',jobId,userId:worker,expectedWage:250000}))).status,409);
});
test('targeted job creation sends an invitation RPC and never invokes immediate hiring',async()=>{
 const f=fixture();const response=await f.POST(post({action:'job',recruitUserId:worker,expectedWage:250000,job:{...baseJob,site_id:siteId,work_dates:[dayInKorea()]}}));
 assert.equal(response.status,200);assert.ok(f.rpc.some(r=>r.name==='create_labor_job_proposal'));
 assert.equal(f.rpc.some(r=>r.name==='create_labor_direct_job_registered_wage'),false);
});
test('old proposal schema cannot accidentally assign a worker when applying',async()=>{
 const f=fixture(worker,false,1);f.tables.labor_jobs[0].proposal_user_id=worker;
 const r=await f.POST(post({action:'proposal_apply',jobId,share_phone:true,expectedWage:250000}));assert.equal(r.status,503);
 assert.equal(f.rpc.some(r=>r.name==='reply_labor_job_proposal'),false);
});
test('manager finalizes a proposal applicant through the guarded finalization RPC',async()=>{
 const f=fixture();f.tables.labor_jobs[0].proposal_user_id=worker;
 const r=await f.POST(post({action:'accept',jobId,userId:worker,expectedWage:250000}));assert.equal(r.status,200);
 assert.ok(f.rpc.some(r=>r.name==='finalize_labor_job_proposal'&&r.args.p_actor===owner&&r.args.p_target===worker));
});
