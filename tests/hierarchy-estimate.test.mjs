import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {rankHierarchyCases,hierarchyGroups,cleanHierarchyTarget} from '../lib/hierarchyEstimate.mjs';
const target={id:'a',space:'주거공간',part:'신발장',kind:'일반 신발장',shapes:['평판형','여닫이'],damage:'파손 미관찰',components:['문짝','측판'],price:250000};
const row=(id,t,extra={})=>({id,work_item_id:id,targets:[t],...extra});
test('deepest available hierarchy wins; fallback relaxes components then damage then structure',()=>{
 const cases=[row('six',target),row('five',{...target,components:['거울']}),row('four',{...target,damage:'심함'}),row('three',{...target,shapes:['격자형']})];
 assert.deepEqual(rankHierarchyCases(target,cases).map(x=>x.photo.id),['six']);
 assert.equal(rankHierarchyCases(target,cases.slice(1))[0].level,5);
 assert.equal(rankHierarchyCases(target,cases.slice(2))[0].level,4);
 assert.equal(rankHierarchyCases(target,cases.slice(3))[0].level,3);
});
test('prices are per target; no legacy substitution, foreign type/space or duplicate before/after',()=>{
 const cases=[row('a',target),row('b',target,{work_item_id:'a'}),row('null',{...target,price:null},{legacy_price:900000}),row('wrong',{...target,part:'문',kind:'방문'}),row('space',{...target,space:'상업공간'})];
 assert.equal(rankHierarchyCases(target,cases).length,1);
 assert.equal(rankHierarchyCases(target,cases)[0].target.price,250000);
 assert.equal(rankHierarchyCases(target,[cases[2]]).length,0);
 assert.throws(()=>cleanHierarchyTarget({...target,part:'unknown'}));
});
test('multiple targets are independent, only confirmed identical objects merge across photos',()=>{
 const shoe={...target,object_key:'shoe',object_confidence:'high'};
 const door={...target,id:'b',part:'문',kind:'세대 현관문',object_key:'door',object_confidence:'high'};
 const photo=(id,targets)=>({id,analysisIndex:0,analysis:{hierarchy_targets:targets}});
 const groups=hierarchyGroups([photo('1',[shoe,door]),photo('2',[shoe])]);
 assert.equal(groups.length,2);assert.equal(groups[0].photos.length,2);
 assert.equal(hierarchyGroups([photo('1',[{...shoe,object_confidence:'low'}]),photo('2',[{...shoe,object_confidence:'low'}])]).length,2);
});
function harness({foreign=false}={}){
 const calls=[];
 const supabase={from(table){const q={select(){return q;},eq(k,v){calls.push([table,k,v]);return q;},order(){return q;},range:async()=>({data:[row('photo',target,{storage_path:'history/photo.jpg'})]}),maybeSingle:async()=>({data:foreign?null:{metadata:{hierarchy_photos:[{targets:[target]}]}}}),insert:async v=>{calls.push(['insert',v]);return {};}};return q;},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://test/signed'}})})}};
 const source=fs.readFileSync(new URL('../lib/server/searchEstimateHierarchy.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export async function','async function');
 const context={rankHierarchyCases,registeredStoragePath:p=>p,process:{env:{}},console};vm.createContext(context);vm.runInContext(source+'\nglobalThis.search=searchEstimateHierarchy;',context);
 return {calls,run:()=>context.search({supabase,company:{id:'company'},body:{analysis_id:'11111111-1111-4111-8111-111111111111',hierarchy_target_id:'a'}})};
}
test('search is company scoped, reviewed only, trusts recorded targets and records one usage',async()=>{
 const h=harness(),r=await h.run();assert.equal(r.estimate.average,250000);assert.equal(r.similar_cases[0].visual_verified,undefined);assert.equal(r.similar_cases[0].referenceUrl,'https://test/signed');
 assert.ok(h.calls.some(x=>x[0]==='photo_case_management'&&x[1]==='company_id'&&x[2]==='company'));
 assert.ok(h.calls.some(x=>x[1]==='review_status'&&x[2]==='reviewed'));
 assert.equal(h.calls.filter(x=>x[0]==='insert').length,1);
 await assert.rejects(harness({foreign:true}).run(),/유효한/);
});
test('partial kitchen components never inherit a whole kitchen price',()=>{
 const kitchen={...target,part:'싱크대',kind:'일반 싱크대',components:['하부장']};
 assert.equal(rankHierarchyCases(kitchen,[row('full',{...kitchen,components:['상부장','하부장'],price:550000})]).length,0);
});
