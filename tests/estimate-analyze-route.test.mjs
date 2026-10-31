import sharp from 'sharp';
import { visualCacheScope, photoSignature, findVisualAnalysisCache } from '../lib/estimateVisualCache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {estimateAnalysisCacheKey, findEstimateAnalysisCache, coalesceEstimateAnalysis} from '../lib/estimateAnalysisCache.mjs';
import {TARGETS, SPACES, DAMAGES} from '../lib/photoHierarchy.mjs';

function harness({ limited = false } = {}) {
  const logs = [], calls = [];
  const client = { from(table) {
    let rows = table === 'companies' ? [{ id: 'mine', slug: 'mine', is_active: true }] : [];
    const query = {
      select() { return query; }, eq(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
      insert(row) { logs.push(row); rows = [{ id: 'analysis-id' }]; return query; },
      maybeSingle: async () => ({ data: rows[0] || null }), single: async () => ({ data: rows[0] || null }),
    }; return query;
  } };
  const code = fs.readFileSync(new URL('../app/api/estimate-analyze/route.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+\n/gm, '').replaceAll('export ', '');
  const context = {
    visualCacheScope, photoSignature, findVisualAnalysisCache, estimateAnalysisCacheKey, findEstimateAnalysisCache, coalesceEstimateAnalysis, TARGETS, SPACES, DAMAGES,
    console: { error() {}, warn() {} }, process: { env: { OPENAI_API_KEY: 'test' } },
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
    getUsageAdminSupabase: () => client, ESTIMATE_ANALYSIS_MODEL: 'test-model',
    checkUsageLimit: async (args) => { calls.push(['limit', args]); return { ok: !limited, status: 429 }; },
    makeUsageLimitError: () => ({ error: 'limit' }),
    analyzeEstimatePhotos: async (files) => { calls.push(['vision', files.length]); return { usage: {}, photos: files.map((_, index) => ({ index, analysis: { target_type: 'door', object_key: 'a', object_confidence: 'high', object_evidence: 'same frame' } })) }; },
  };
  vm.createContext(context); vm.runInContext(`${code}\nglobalThis.post=POST;`, context);
  const post = async ({ slug = 'mine', count = 5, type = 'image/jpeg', size = 4 } = {}) => {
    const form = new FormData(); form.append('company_slug', slug);
    for (let i = 0; i < count; i++) form.append('images', new File([new Uint8Array(size)], 'a.jpg', { type }));
    return context.post(new Request('https://example.test', { method: 'POST', body: form }));
  };
  return { post, calls, logs };
}

test('batch analysis checks the owning active company and records photo count once', async () => {
  const h = harness(), result = await h.post();
  assert.equal(result.status, 200);
  assert.equal(result.body.photos.length, 5);
  assert.equal(result.body.analysis_id, 'analysis-id');
  assert.equal(h.calls[0][1].requestedQuantity, 5);
  assert.equal(h.calls.filter(([name]) => name === 'vision').length, 1);
  assert.equal(h.logs[0].company_id, 'mine');
  assert.equal(h.logs[0].quantity, 5);
});

test('missing company, over-quota, invalid type/count/size cannot reach the model', async () => {
  for (const input of [{ slug: 'other' }, { count: 11 }, { type: 'text/plain' }, { count: 2, size: 2_000_001 }]) {
    const h = harness();
    assert.ok((await h.post(input)).status >= 400);
    assert.equal(h.calls.filter(([name]) => name === 'vision').length, 0);
  }
  const limited = harness({ limited: true });
  assert.equal((await limited.post()).status, 429);
  assert.equal(limited.calls.filter(([name]) => name === 'vision').length, 0);
});

function persistentHarness() {
  const events = [], calls=[];
  let limited = false, cacheError = false;
  const analysisTarget={id:'22222222-2222-4222-8222-222222222222',part:'문',kind:'세대 현관문',space:'주거공간',object_key:'same',object_confidence:'high'};
  const client={from(table){
    let filtered=table==='companies'?[{id:'mine-id',slug:'mine',is_active:true},{id:'other-id',slug:'other',is_active:true}]:events.slice(), inserted=null;
    const q={then(resolve){return Promise.resolve(cacheError?{data:null,error:{code:'offline'}}:{data:filtered,error:null}).then(resolve)},select(){return q},eq(k,v){filtered=filtered.filter(row=>(k.startsWith('metadata->>')?row.metadata?.[k.slice(11)]:row[k])===v);return q},gte(k,v){filtered=filtered.filter(row=>row[k]>=v);return q},order(){return q},limit(n){filtered=filtered.slice(0,n);return q},insert(row){inserted={...row,id:`00000000-0000-4000-8000-${String(events.length+1).padStart(12,'0')}`,created_at:new Date().toISOString()};events.push(inserted);return q},maybeSingle:async()=>cacheError&&table==='usage_events'?{data:null,error:{code:'offline'}}:{data:filtered[0]||null,error:null},single:async()=>({data:inserted,error:null})};return q;
  }};
  const code=fs.readFileSync(new URL('../app/api/estimate-analyze/route.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replaceAll('export ','');
  const context={visualCacheScope,photoSignature,findVisualAnalysisCache,estimateAnalysisCacheKey,findEstimateAnalysisCache,coalesceEstimateAnalysis,TARGETS,SPACES,DAMAGES,
    console:{error(){},warn(){}},process:{env:{OPENAI_API_KEY:'key',SUPABASE_SERVICE_ROLE_KEY:'secret'}},
    NextResponse:{json:(body,options)=>({body,status:options?.status||200})},getUsageAdminSupabase:()=>client,ESTIMATE_ANALYSIS_MODEL:'test',
    checkUsageLimit:async()=>{calls.push('limit');return {ok:!limited,status:429}},makeUsageLimitError:()=>({error:'limit'}),
    analyzeEstimatePhotos:async(files)=>{calls.push('vision');return {usage:{},photos:files.map((_,index)=>({index,analysis:{hierarchy_version:1,hierarchy_targets:[analysisTarget],category:analysisTarget.part,sub_category:analysisTarget.kind}}))}}};
  vm.createContext(context);vm.runInContext(`${code}\nglobalThis.post=POST;`,context);
  return {events,calls,setLimited(v){limited=v},setCacheError(v){cacheError=v},async post({slug='mine',session='11111111-1111-4111-8111-111111111111',photo='same bytes',choice='door'}={}){
    const form=new FormData();form.append('company_slug',slug);form.append('session_id',session);form.append('target_choices',JSON.stringify([choice]));form.append('images',new File([photo],'a.jpg',{type:'image/jpeg'}));return context.post(new Request('https://example.test',{method:'POST',body:form}));
  }};
}
test('same browser session and exact inputs reuse recorded analysis without another model call',async()=>{
 const h=persistentHarness(),first=await h.post();assert.equal(first.status,200);h.setLimited(true);
 const second=await h.post();assert.equal(second.status,200);assert.equal(second.body.reused,true);assert.equal(second.body.analysis_id,first.body.analysis_id);
 assert.equal(h.calls.filter(x=>x==='vision').length,1);assert.equal(h.calls.filter(x=>x==='limit').length,1);assert.equal(h.events.length,1);
 assert.equal((await h.post({choice:'wall'})).status,429);assert.equal((await h.post({photo:'different'})).status,429);
 assert.equal((await h.post({session:'33333333-3333-4333-8333-333333333333'})).status,429);assert.equal((await h.post({slug:'other'})).status,429);
});
test('cache failure does not bypass AI quota and never returns another user result',async()=>{
 const h=persistentHarness();await h.post();h.setLimited(true);h.setCacheError(true);
 const response=await h.post();assert.equal(response.status,429);assert.equal(h.calls.filter(x=>x==='vision').length,1);
});

test('recompressed recent photo reuses server analysis even when AI quota is exhausted',async()=>{
 const svg=Buffer.from('<svg width="256" height="256"><rect width="256" height="256" fill="#bbbbbb"/><rect x="40" y="12" width="170" height="232" fill="#452810"/><rect x="49" y="24" width="150" height="208" fill="#c4aa70"/><path d="M90 24v208M150 24v208M49 80h150M49 160h150" stroke="#332211" stroke-width="9"/></svg>');
 const h=persistentHarness();
 const first=await h.post({photo:await sharp(svg).jpeg({quality:90}).toBuffer()});
 assert.equal(first.status,200);assert.ok(h.events[0].metadata.visual_cache_scope);h.setLimited(true);
 const second=await h.post({photo:await sharp(svg).jpeg({quality:75}).toBuffer()});
 assert.equal(second.status,200);assert.equal(second.body.reuse_reason,'recent_view');
 assert.equal(second.body.analysis_id,first.body.analysis_id);assert.equal(h.calls.filter(x=>x==='vision').length,1);
});
