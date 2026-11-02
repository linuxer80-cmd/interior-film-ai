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
  for (const invalid of [null, '']) {
    const site = {id:'a',revenue:100,labor:10,material:20,expense:0,profit:70};
    site.revenue = invalid;
    const result = assistantProfitSummary({sites:[site],breakdown:{labor:[]}});
    assert.equal(result.confirmedCount, 0);
    assert.equal(result.pendingCount, 1);
  }
  assert.throws(() => assistantProfitSummary({sites:[{id:'a',revenue:true,labor:10,material:20,expense:0,profit:70}],breakdown:{labor:[]}}));
});

test("rounds estimated material VAT per site as the web screen does", () => {
  const sites = ['a','b'].map(id => ({id,revenue:100,labor:0,material:5,expense:0,profit:95}));
  assert.deepEqual(assistantProfitSummary({sites,breakdown:{labor:[]}}),
    {revenue:200,labor:0,material:12,expense:0,profit:188,confirmedCount:2,pendingCount:0});
});
