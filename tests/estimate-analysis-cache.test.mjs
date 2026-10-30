import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateAnalysisCacheKey, findEstimateAnalysisCache, restoreEstimateAnalysis, ESTIMATE_ANALYSIS_CACHE_TTL_MS} from '../lib/estimateAnalysisCache.mjs';
const session='11111111-1111-4111-8111-111111111111', companyId='company', now=Date.now();
const file=(text,type='image/jpeg')=>new File([text],'photo.jpg',{type});
const args={companyId,sessionId:session,files:[file('photo one'),file('photo two')],targetChoices:['door',''],model:'test',classifierSource:'v1',taxonomy:{a:'v1'},secret:'private'};
const target={id:'target-id',part:'문',kind:'세대 현관문',object_key:'a',object_confidence:'high'};
const event={id:'analysis-id',metadata:{hierarchy_photos:[{index:0,targets:[target]},{index:1,targets:[target]}]}};

test('only identical ordered photo batches, choice, company, session, model and classifier share a key',async()=>{
 const original=await estimateAnalysisCacheKey(args);
 assert.equal(original,await estimateAnalysisCacheKey({...args,files:[file('photo one'),file('photo two')]}));
 for(const changed of [{companyId:'other'},{sessionId:'22222222-2222-4222-8222-222222222222'},{files:[file('photo two'),file('photo one')]},{files:[file('photo one'),file('photo changed')]},{targetChoices:['wall','']},{model:'other'},{classifierSource:'v2'},{taxonomy:{a:'v2'}},{secret:'other'}]) assert.notEqual(original,await estimateAnalysisCacheKey({...args,...changed}));
 assert.equal(await estimateAnalysisCacheKey({...args,sessionId:'not-a-uuid'}),null);
 assert.equal(await estimateAnalysisCacheKey({...args,secret:''}),null);
});
test('cached targets keep their original server analysis id and malformed records are ignored',()=>{
 const result=restoreEstimateAnalysis(event,2);
 assert.equal(result.analysis_id,'analysis-id');assert.equal(result.photos[1].analysis.hierarchy_targets[0].id,'target-id');
 assert.equal(restoreEstimateAnalysis(event,1),null);
 assert.equal(restoreEstimateAnalysis({id:'x',metadata:{hierarchy_photos:[{index:0,targets:[]}] }},1),null);
});
test('persistent lookup is scoped to company, type and last 24 hours',async()=>{
 const calls=[]; const q={select(...a){calls.push(['select',...a]);return q},eq(...a){calls.push(['eq',...a]);return q},gte(...a){calls.push(['gte',...a]);return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:event,error:null})};
 const result=await findEstimateAnalysisCache({supabase:{from:()=>q},companyId,key:'private-hash',count:2,now});
 assert.equal(result.analysis_id,'analysis-id');assert.ok(calls.some(x=>x[1]==='company_id'&&x[2]===companyId));
 assert.ok(calls.some(x=>x[1]==='metadata->>analysis_cache_key'&&x[2]==='private-hash'));
 assert.ok(calls.some(x=>x[0]==='gte'&&x[2]===new Date(now-ESTIMATE_ANALYSIS_CACHE_TTL_MS).toISOString()));
});

test('simultaneous identical requests on one server share work; failures can retry',async()=>{
 const {coalesceEstimateAnalysis}=await import('../lib/estimateAnalysisCache.mjs');
 let release, calls=0;const wait=new Promise(resolve=>{release=resolve});
 const task=()=>{calls++;return wait};
 const first=coalesceEstimateAnalysis('same-key',task),second=coalesceEstimateAnalysis('same-key',task);
 release({ok:true});const results=await Promise.all([first,second]);
 assert.equal(calls,1);assert.equal(results.filter(x=>x.shared).length,1);
 await assert.rejects(coalesceEstimateAnalysis('failed-key',async()=>{throw Error('failed')}),/failed/);
 assert.equal((await coalesceEstimateAnalysis('failed-key',async()=>42)).value,42);
});
