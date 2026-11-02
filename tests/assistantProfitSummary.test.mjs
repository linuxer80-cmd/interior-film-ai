import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantProfitSummary } from "../lib/assistantProfitSummary.mjs";

test("matches confirmed-site totals with VAT and excluded worker labor", () => {
  const source = { sites: [
    {id:"a",revenue:100000,labor:20000,material:30000,expense:5000,profit:45000},
    {id:"b",revenue:50000,labor:10000,material:10000,expense:0,profit:30000,materialPending:true},
  ], breakdown:{labor:[{siteId:"a",workerId:"w",amount:5000}]} };
  assert.deepEqual(assistantProfitSummary(source,["w"]),{revenue:100000,labor:15000,material:33000,expense:5000,profit:47000,confirmedCount:1,pendingCount:1});
});
test("does not silently produce totals from malformed data", () => {
  assert.throws(() => assistantProfitSummary({sites:[]}));
});
