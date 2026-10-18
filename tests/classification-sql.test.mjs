import test from 'node:test';
import assert from 'node:assert/strict';
import { classificationSql } from '../lib/classificationSql.mjs';
import { normalizeProfile, profileMatch, PROFILE_FIELDS } from '../lib/caseClassification.mjs';
test('all successful drafts export without review flags and failures are excluded',()=>{
 const items=[{id:'a',case_profile:{}},{id:'b',case_profile:null},{id:'c'}];
 const sql=classificationSql(items,{a:{profile:{part:'싱크대'}},b:{profile:{part:"a'b"}}},'company');
 assert.ok(sql.includes("(E'a'::uuid"));assert.ok(sql.includes("(E'b'::uuid"));assert.ok(!sql.includes("(E'c'::uuid"));
 assert.ok(sql.includes("a''b"));assert.ok(sql.includes('IS NOT DISTINCT FROM b.previous'));
 assert.ok(sql.includes("w.company_id = E'company'::uuid"));assert.equal((sql.match(/UPDATE public.work_items/g)||[]).length,1);
 assert.ok(sql.includes('미적용'));assert.ok(sql.includes('LEFT JOIN classification_batch_applied'));
});
test('non-door profiles keep applicable detail and omit unrelated door attributes',()=>{
 const p=normalizeProfile({part:'싱크대',cabinet_layout:'상하부장',drawer_count:'3개',door_kind:'방문'});
 assert.equal(p.cabinet_layout,'상하부장');assert.equal(p.door_kind,'확인 필요');
 assert.ok(profileMatch(p,p).score>profileMatch(p,{...p,drawer_count:'없음'}).score);
 assert.ok(!Object.keys(PROFILE_FIELDS).some(k=>/color|colour/i.test(k)));
});

test('153 successful cases export in independent groups of 30 without omissions',async()=>{
 const {classificationBatches}=await import('../lib/classificationSql.mjs');
 const items=Array.from({length:154},(_,i)=>({id:String(i),case_profile:{}}));
 const drafts=Object.fromEntries(items.slice(0,153).map(item=>[item.id,{profile:{part:'방문'}}]));
 const batches=classificationBatches(items,drafts);
 assert.deepEqual(batches.map(b=>b.length),[30,30,30,30,30,3]);
 assert.equal(new Set(batches.flat().map(i=>i.id)).size,153);
 for(const batch of batches){const sql=classificationSql(batch,drafts,'co');assert.ok(sql.startsWith('WITH classification_batch_input'));assert.ok(sql.endsWith('ORDER BY b.id;'));}
 assert.deepEqual(classificationBatches(items,{}),[]);
});

test('export has one atomic statement and returns updated profiles from RETURNING',()=>{
 const sql=classificationSql([{id:'id',case_profile:{}}],{id:{profile:{part:'방문'}}},'company');
 assert.ok(!sql.includes('CREATE TEMP'));assert.ok(!sql.includes('COMMIT'));assert.equal(sql.split(';').length,2);
 assert.ok(sql.includes('THEN a.case_profile ELSE w.case_profile'));
});
