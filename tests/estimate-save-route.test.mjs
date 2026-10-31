import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validEstimateRequestId,findSavedEstimate} from '../lib/estimateSaveReplay.mjs';
test('retry after a lost response returns one saved row and does not consume another quota event',async()=>{
 const saved=[],events=[];let quota=0;
 const client={from(table){let rows=table==='companies'?[{id:'company',slug:'mine',is_active:true}]:saved.slice();let inserted=null;
 const q={select(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},maybeSingle:async()=>({data:rows[0]||null}),insert(row){if(table==='usage_events'){events.push(row);}else{inserted=row;saved.push(row);}return q;},single:async()=>({data:inserted,error:null}),then(resolve){return Promise.resolve({error:null}).then(resolve);}};return q;}};
 const source=fs.readFileSync(new URL('../app/api/estimate-usage/route.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'').replaceAll('export ','');
 const ctx={validEstimateRequestId,findSavedEstimate,createClient:()=>client,checkUsageLimit:async()=>{quota++;return {ok:quota===1,status:429};},makeUsageLimitError:()=>({error:'limit'}),process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'}},console:{error(){}},NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
 vm.createContext(ctx);vm.runInContext(source+'\nglobalThis.post=POST;',ctx);
 const body={company_slug:'mine',session_id:'session',request_id:'11111111-1111-4111-8111-111111111111',photo_count:1,photo_paths:['customer/one.jpg'],estimate_average:100000};
 const first=await ctx.post({json:async()=>body});assert.equal(first.status,200);
 const retry=await ctx.post({json:async()=>body});assert.equal(retry.status,200);assert.equal(retry.body.reused,true);assert.equal(retry.body.usage_id,first.body.usage_id);
 assert.equal(saved.length,1);assert.equal(events.length,1);assert.equal(quota,1);
 const foreign=await ctx.post({json:async()=>({...body,session_id:'other'})});assert.equal(foreign.status,429);
});
