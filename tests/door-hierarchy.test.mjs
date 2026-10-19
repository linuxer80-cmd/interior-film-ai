import test from 'node:test';
import assert from 'node:assert/strict';
import {doorFields,validateDoorHierarchy,matchDoorHierarchy,mergedDoorProfile,isDoorCase} from '../lib/doorHierarchy.mjs';
import {classificationSql} from '../lib/classificationSql.mjs';
const profile=extra=>({...Object.fromEntries(Object.keys(doorFields).map(k=>[k,'확인 필요'])),subject:'출입문·문틀',door_kind:'방문',target:'문짝·문틀',opening_detail:'외여닫이',leaf_count:'1짝',pattern:'평판',evidence:'사진에서 확인',uncertainty:'',...extra});
test('new profile round trip preserves canonical string fields and never invents missing fields',()=>{
 const p=profile({groove_count:'1',panel_count:'1개',glass:'있음'});
 assert.deepEqual(validateDoorHierarchy(JSON.parse(JSON.stringify(p))),p);
 assert.throws(()=>validateDoorHierarchy({...p,groove_count:1}));
 const missing={...p};delete missing.glass;assert.throws(()=>validateDoorHierarchy(missing));
 assert.equal(isDoorCase({category:'싱크대',sub_category:'가구문'}),false);
 assert.equal(isDoorCase({category:'문,문틀'}),true);
});
test('deep matches are used before broader candidates',()=>{
 const q=profile();const result=matchDoorHierarchy(q,[{id:'exact',analysis:q},{id:'other',analysis:profile({pattern:'가로 홈'})}]);
 assert.equal(result.broadened,false);assert.equal(result.matches.length,1);assert.equal(result.matches[0].id,'exact');
});
test('missing deepest case broadens one level at a time and retains low-score cases',()=>{
 const q=profile({glass:'있음',glass_layout:'전체 유리'});
 const result=matchDoorHierarchy(q,[{id:'a',analysis:profile({glass:'없음'})}]);
 assert.equal(result.broadened,true);assert.equal(result.matches.length,1);assert(result.matches[0].score<70);assert(result.matches[0].different.includes('glass'));
 assert.equal(result.path.at(-1),'표면 형태: 평판');
});
test('self case and furniture/window candidates cannot produce a door match',()=>{
 const p=profile();assert.equal(matchDoorHierarchy(p,[{id:'self',analysis:p},{id:'furniture',analysis:profile({subject:'가구문'})}],'self').matches.length,0);
 assert.equal(matchDoorHierarchy(profile({subject:'창호'}),[{id:'x',analysis:p}]).outOfScope,true);
});
test('unknown facts do not receive a perfect similarity and candidates remain visible',()=>{
 const p=profile({door_kind:'확인 필요',target:'확인 필요',opening_detail:'확인 필요',leaf_count:'확인 필요',pattern:'확인 필요'});
 const result=matchDoorHierarchy(p,[{id:'x',analysis:profile()}]);assert(result.matches[0].score<10);
});
test('test classification merge preserves unrelated keys, legacy vocabulary and absent keys',()=>{
 const previous={part:'문·문틀',groove_count:'1',coverage:'문짝 앞뒤',custom:{value:1}};
 const merged=mergedDoorProfile(previous,profile());assert.equal(merged.groove_count,'1');assert.deepEqual(merged.custom,{value:1});assert.equal('glass' in merged,false);assert.equal('door_hierarchy' in previous,false);
 const sql=classificationSql([{id:'11111111-1111-4111-8111-111111111111',case_profile:previous}],{ '11111111-1111-4111-8111-111111111111':{profile:merged}},'22222222-2222-4222-8222-222222222222');
 assert.match(sql,/IS NOT DISTINCT FROM b.previous/);assert.match(sql,/door_hierarchy/);
});

test('API verifies super membership before reading cases and rejects foreign or non-door analysis',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync(new URL('../app/api/super-admin/door-hierarchy/route.js',import.meta.url),'utf8');
 const make=(allowed,work)=>{
  let reads=0;const db={from(table){reads++;return {select(){return this;},eq(){return this;},then(resolve){resolve({data:table==='companies'?[{id:'11111111-1111-4111-8111-111111111111'}]:work?[work]:[]});}};}};
  const POST=new Function('pilotIdentity','pilotRole','pilotJson','isDoorCase',source.replace(/^import .*;$/gm,'').replace(/export const runtime='nodejs';export const maxDuration=60;/,'').replace('export async function POST','async function POST')+';return POST;')(
   async()=>({db,user:{id:'user'}}),async()=>{if(!allowed)throw Object.assign(Error('권한 없음'),{status:403});},(body,status=200)=>Response.json(body,{status}),isDoorCase);
  return {POST,reads:()=>reads};
 };
 const request=()=>new Request('https://example.test/api/super-admin/door-hierarchy',{method:'POST',body:JSON.stringify({action:'analyze',companyId:'11111111-1111-4111-8111-111111111111',workId:'22222222-2222-4222-8222-222222222222'})});
 const denied=make(false);assert.equal((await denied.POST(request())).status,403);assert.equal(denied.reads(),0);
 for(const work of [null,{category:'싱크대',sub_category:'가구문'}])assert.equal((await make(true,work).POST(request())).status,403);
});
