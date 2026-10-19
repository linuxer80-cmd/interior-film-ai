import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as work from "../lib/ownerWork.mjs";
const require = createRequire(import.meta.url),
  swc = require("next/dist/build/swc");
await swc.loadBindings();
const { code } = await swc.transform(
  fs.readFileSync(
    new URL("../app/api/admin/owner-work/route.js", import.meta.url),
    "utf8",
  ),
  { jsc: { parser: { syntax: "ecmascript" } }, module: { type: "commonjs" } },
);
const company = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222",
  siteId = "33333333-3333-4333-8333-333333333333",
  other = "44444444-4444-4444-8444-444444444444";
function harness() {
  const tables = {
    owner_work_settings: [
      {
        company_id: company,
        mode: "solo",
        include_labor: true,
        daily_wage: 250000,
      },
    ],
    sites: [
      {
        id: siteId,
        company_id: company,
        status: "scheduled",
        work_dates: [work.koreaDay()],
      },
    ],
    owner_site_participation: [],
    owner_work_days: [],
    work_reports: [],
  };
  let authorized = true;
  function from(table) {
    let filters = [],
      single = false,
      op = "select",
      payload,
      options;
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        filters.push((r) => r[k] === v);
        return q;
      },
      gte(k, v) {
        filters.push((r) => r[k] >= v);
        return q;
      },
      in(k, v) {
        filters.push((r) => v.includes(r[k]));
        return q;
      },
      is(k, v) {
        filters.push((r) => (r[k] ?? null) === v);
        return q;
      },
      order() {
        return q;
      },
      range() {
        return q;
      },
      maybeSingle() {
        single = true;
        return q;
      },
      update(v) {
        op = "update";
        payload = v;
        return q;
      },
      upsert(v, o) {
        op = "upsert";
        payload = v;
        options = o;
        return q;
      },
      then(resolve, reject) {
        try {
          let rows = tables[table];
          if (!rows) return resolve({ error: { code: "42P01" } });
          if (op === "upsert") {
            const keys = options.onConflict.split(","),
              old = rows.find((r) => keys.every((k) => r[k] === payload[k]));
            if (old) {
              if (!options.ignoreDuplicates) Object.assign(old, payload);
            } else
              rows.push({
                ...payload,
                ...(table === "owner_work_days"
                  ? {
                      checked_in_at: new Date().toISOString(),
                      checked_out_at: null,
                    }
                  : {}),
              });
          }
          let found = rows.filter((r) => filters.every((f) => f(r)));
          if (op === "update") found.forEach((r) => Object.assign(r, payload));
          resolve({
            data: single ? found[0] || null : found.map((r) => ({ ...r })),
          });
        } catch (e) {
          reject(e);
        }
      },
    };
    return q;
  }
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    Response,
    URL,
    Date,
    console,
    require: (n) =>
      n.includes("ownerWork")
        ? work
        : {
            privateAuth: async () =>
              authorized
                ? { db: { from }, user: { id: user }, companyId: company }
                : { error: "로그인 필요", status: 401 },
            privateJson: (body, status = 200) =>
              Response.json(body, { status }),
            uuid: (v) => /^[0-9a-f-]{36}$/.test(v || ""),
          },
  });
  const request = (body) =>
    new Request("https://app.test/api/admin/owner-work", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    tables,
    route: exports,
    post: (body) => exports.POST(request(body)),
    setAuth: (v) => (authorized = v),
  };
}
test("solo participation follows dates and respects explicit opt out; mixed requires opt in", () => {
  const site = { status: "scheduled", work_dates: ["2026-10-19"] };
  assert.equal(work.scheduledOn(site, "2026-10-19"), true);
  assert.equal(work.scheduledOn(site, "2026-10-20"), false);
  assert.equal(work.isOwnerParticipant({ mode: "solo" }, site), true);
  assert.equal(
    work.isOwnerParticipant({ mode: "solo" }, site, { participating: false }),
    false,
  );
  assert.equal(work.isOwnerParticipant({ mode: "mixed" }, site), false);
  assert.equal(
    work.isOwnerParticipant({ mode: "manage" }, site, { participating: true }),
    false,
  );
  assert.equal(
    work.isOwnerParticipant({ mode: "solo" }, { status: "completed" }),
    false,
  );
  assert.equal(work.koreaDay("2026-10-18T15:30:00Z"), "2026-10-19");
});
test("unauthenticated requests and cross-company writes are rejected", async () => {
  const h = harness();
  h.setAuth(false);
  assert.equal((await h.post({ action: "in", siteId })).status, 401);
  h.setAuth(true);
  h.tables.sites[0].company_id = other;
  assert.equal((await h.post({ action: "in", siteId })).status, 404);
  assert.equal(h.tables.owner_work_days.length, 0);
});
test("duplicate clock in snapshots labor once; repeat clock out keeps first timestamp", async () => {
  const h = harness();
  assert.equal((await h.post({ action: "in", siteId })).status, 200);
  const first = { ...h.tables.owner_work_days[0] };
  h.tables.owner_work_settings[0].daily_wage = 300000;
  await h.post({ action: "in", siteId });
  assert.deepEqual(h.tables.owner_work_days[0], first);
  await h.post({ action: "out", siteId });
  const out = h.tables.owner_work_days[0].checked_out_at;
  await h.post({ action: "out", siteId });
  assert.equal(h.tables.owner_work_days[0].checked_out_at, out);
  assert.equal(h.tables.owner_work_days.length, 1);
});
test("a second site cannot replace a daily record; canceled and unscheduled sites cannot clock in", async () => {
  const h = harness();
  await h.post({ action: "in", siteId });
  h.tables.sites.push({ ...h.tables.sites[0], id: other });
  assert.equal((await h.post({ action: "in", siteId: other })).status, 409);
  assert.equal(h.tables.owner_work_days[0].site_id, siteId);
  h.tables.owner_work_days = [];
  h.tables.sites[0].status = "cancelled";
  assert.equal((await h.post({ action: "in", siteId })).status, 409);
  h.tables.sites[0].status = "scheduled";
  h.tables.sites[0].work_dates = [];
  assert.equal((await h.post({ action: "in", siteId })).status, 409);
});
test("management mode can finish an existing shift; missing schema fails clearly", async () => {
  const h = harness();
  await h.post({ action: "in", siteId });
  h.tables.owner_work_settings[0].mode = "manage";
  assert.equal((await h.post({ action: "out", siteId })).status, 200);
  delete h.tables.owner_work_settings;
  const r = await h.route.GET(
    new Request("https://app.test/api/admin/owner-work"),
  );
  assert.equal(r.status, 503);
  assert.equal((await r.json()).setupRequired, true);
});
test("invalid settings are rejected without changing persistent settings", async () => {
  const h = harness();
  assert.equal(
    (
      await h.post({
        action: "settings",
        mode: "solo",
        include_labor: true,
        daily_wage: -1,
      })
    ).status,
    400,
  );
  assert.equal(h.tables.owner_work_settings[0].daily_wage, 250000);
});
