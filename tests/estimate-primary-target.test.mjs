import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {TARGETS,SPACES,DAMAGES,aiTargets} from '../lib/photoHierarchy.mjs';
import {hierarchyGroups} from '../lib/hierarchyEstimate.mjs';
const target=(part,kind,key,components)=>({space:'주거공간',part,kind,shapes:['평판형'],damage:'파손 미관찰',components,notes:'테스트',object_key:key,object_confidence:'high'});
function harness(photos){
 let request;
 const source=fs.readFileSync(new URL('../lib/server/analyzeEstimateHierarchy.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export async function','async function');
 const ctx={TARGETS,SPACES,DAMAGES,aiTargets,randomUUID,Buffer,AbortSignal,process:{env:{}},estimateAnalysisError:code=>Object.assign(Error(code),{analysisCode:code})};vm.createContext(ctx);vm.runInContext(source+'\nglobalThis.analyze=analyzeEstimateHierarchy;',ctx);
 const run=()=>ctx.analyze(Object.keys(photos).map(()=>new File(['jpeg'],'a.jpg',{type:'image/jpeg'})),'test',async(_,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({output_text:JSON.stringify({photos})})};});
 return {run,request:()=>request};
}
test('two customer photos produce door and combined vanity without charging a third closet',async()=>{
 const h=harness({photo_0:{targets:[target('문','방문','door',['문·문틀 세트'])]},photo_1:{targets:[target('화장대','수납장 결합 화장대','vanity',['거울 주변 마감','서랍 전면','키큰 수납장'])]}});
 const result=await h.run();const groups=hierarchyGroups(result.photos.map(p=>({id:String(p.index),analysisIndex:p.index,analysis:p.analysis})));
 assert.equal(groups.length,2);assert.deepEqual(Array.from(groups,g=>g.category),['문','화장대']);
 assert.ok(groups[1].hierarchyTarget.components.includes('키큰 수납장'));
 assert.equal(h.request().text.format.schema.properties.photos.properties.photo_0.properties.targets.maxItems,1);
 assert.ok(result.photos.every(p=>p.analysis.hierarchy_targets.every(t=>t.price===null)));
});
test('model output cannot bypass one target per photo and add a separately priced closet',async()=>{
 const h=harness({photo_0:{targets:[target('화장대','붙박이 화장대','v',['서랍 전면']),target('붙박이장','드레스룸 붙박이장','c',['본장 문짝'])]}});
 await assert.rejects(h.run(),{analysisCode:'result'});
});
test('confirmed alternate views still count as one physical target',async()=>{
 const t=target('문','방문','same-door',['문·문틀 세트']);const h=harness({photo_0:{targets:[t]},photo_1:{targets:[t]}});const r=await h.run();
 assert.equal(hierarchyGroups(r.photos.map(p=>({id:String(p.index),analysisIndex:p.index,analysis:p.analysis}))).length,1);
});
