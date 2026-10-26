import test from 'node:test';
import assert from 'node:assert/strict';
import {siteBasicPatch} from '../lib/siteBasicPatch.mjs';
test('allows basic fields, trims text and preserves zero and unknown amount',()=>{
 assert.deepEqual(siteBasicPatch({site_name:' 현장 ',memo:' ',contract_amount:0,deposit_amount:null}),{site_name:'현장',memo:null,contract_amount:0,deposit_amount:null});
});
test('rejects cross-company/privileged changes and invalid financial inputs',()=>{
 for(const input of [{company_id:'other'},{status:'completed'},{created_by:'x'},{contract_amount:-1},{deposit_amount:Infinity},{memo:{}},null,[]])assert.throws(()=>siteBasicPatch(input));
});
