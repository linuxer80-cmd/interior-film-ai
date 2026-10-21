import test from "node:test";
import assert from "node:assert/strict";
import { homeSchedule } from "../lib/homeSchedule.mjs";

test("owner calendar preserves explicit gaps and excludes cancelled and undated jobs", () => {
  const sites = [
    { id: "split", work_dates: ["2026-10-21", "2026-10-23"], schedule_start: "2026-10-21", schedule_end: "2026-10-23" },
    { id: "empty", work_dates: [], schedule_date: "2026-10-21" },
    { id: "cancelled", status: "cancelled", schedule_date: "2026-10-21" },
    { id: "undated" },
  ];
  const { byDay } = homeSchedule(sites, "2026-10");
  assert.deepEqual(byDay.get("2026-10-21").map(x => x.site.id), ["split"]);
  assert.equal(byDay.get("2026-10-22").length, 0);
  assert.equal(byDay.get("2026-10-23").length, 1);
});
test("legacy owner ranges span months and include both endpoints", () => {
  const { byDay } = homeSchedule([{ id: "range", schedule_start: "2026-09-30", schedule_end: "2026-10-02" }], "2026-10");
  assert.equal(byDay.get("2026-10-01").length, 1);
  assert.equal(byDay.get("2026-10-02").length, 1);
  assert.equal(byDay.get("2026-10-03").length, 0);
});
test("worker home uses personal allocation dates and daily leader roles", () => {
  const { byDay } = homeSchedule([{site_id:"mine",work_dates:["2026-10-21","2026-10-22"],assigned_dates:[{work_date:"2026-10-22",role:"leader"}]}],"2026-10",true);
  assert.equal(byDay.get("2026-10-21").length,0);
  assert.equal(byDay.get("2026-10-22")[0].role,"leader");
});
