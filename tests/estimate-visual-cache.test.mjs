import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {photoSignature,sameRecentView,visualCacheScope,findVisualAnalysisCache,VISUAL_CACHE_TTL_MS} from '../lib/estimateVisualCache.mjs';
const scene=Buffer.from(`<svg width="256" height="256"><rect width="256" height="256" fill="#bbbbbb"/><rect x="40" y="12" width="170" height="232" fill="#452810"/><rect x="49" y="24" width="150" height="208" fill="#c4aa70"/><path d="M90 24v208M150 24v208M49 80h150M49 160h150" stroke="#332211" stroke-width="9"/><circle cx="185" cy="130" r="7" fill="#111"/><path d="M0 215h40M210 210h46M0 80h40" stroke="white" stroke-width="8"/></svg>`);
async function file(options={}) {let image=sharp(scene);if(options.flip)image=image.flop();if(options.brightness)image=image.modulate({brightness:options.brightness});return new File([await image.jpeg({quality:options.quality||90}).toBuffer()],'photo.jpg',{type:'image/jpeg'});}
test('recent view tolerates recompression and tiny light change, rejects different structures and blank walls',async()=>{
 const a=await photoSignature(await file());
 assert.equal(sameRecentView(a,await photoSignature(await file({quality:75,brightness:1.005}))),true);
 assert.equal(sameRecentView(a,await photoSignature(await file({flip:true}))),false);
 const flat={ratio:1,gray:Array(1024).fill(120),color:Array(192).fill(120)};
 assert.equal(sameRecentView(flat,flat),false);
 assert.equal(sameRecentView(a,{...a,ratio:1.5}),false);
});
test('scope separates company, browser, target selection and classifier',()=>{
 const args={companyId:'one',sessionId:'11111111-1111-4111-8111-111111111111',targetChoices:['door'],classifier:'v1',secret:'secret'};
 const key=visualCacheScope(args);
 for(const change of [{companyId:'two'},{sessionId:'22222222-2222-4222-8222-222222222222'},{targetChoices:['wall']},{classifier:'v2'}])assert.notEqual(visualCacheScope({...args,...change}),key);
 assert.equal(visualCacheScope({...args,sessionId:''}),null);
});
test('lookup enforces recent scoped batch, preserves authoritative analysis ID and rejects uncertain targets',async()=>{
 const signature=await photoSignature(await file());const filters=[];
 const target={id:'target',part:'문',kind:'방문',space:'주거공간',object_confidence:'high'};
 const event={id:'analysis',metadata:{visual_signatures:[signature],hierarchy_photos:[{index:0,targets:[target]}]}};
 const supabase={from:()=>{const q={select:()=>q,eq:(...args)=>{filters.push(args);return q;},gte:(...args)=>{filters.push(args);return q;},order:()=>q,limit:async()=>({data:[event]})};return q;}};
 const args={supabase,companyId:'company',scope:'scope',signatures:[signature],now:Date.now()};
 assert.equal((await findVisualAnalysisCache(args)).analysis_id,'analysis');
 assert.ok(filters.some(([k,v])=>k==='company_id'&&v==='company'));
 assert.ok(filters.some(([k,v])=>k==='metadata->>visual_cache_scope'&&v==='scope'));
 assert.ok(filters.some(([k,v])=>k==='created_at'&&v===new Date(args.now-VISUAL_CACHE_TTL_MS).toISOString()));
 target.kind='확인 필요';assert.equal(await findVisualAnalysisCache(args),null);
});
