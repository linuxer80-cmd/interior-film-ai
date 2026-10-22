import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {aiTargets,newTarget,validateTargets} from '../lib/photoHierarchy.mjs';
const id='00000000-0000-4000-8000-000000000001',photo='00000000-0000-4000-8000-000000000002',co='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004';
const target=()=>({...newTarget(id),space:'주거공간',kind:'방문',shapes:['평판형'],components:['문·문틀 세트'],price:200000});
test('six levels validate without scope or automatic price and reject door double counting',()=>{
 const clean=validateTargets([{...target(),scope:'must not be saved'}],{reviewed:true})[0];assert.equal(clean.price,200000);assert.equal('scope' in clean,false);
 assert.throws(()=>validateTargets([{...target(),components:['문·문틀 세트','문짝']}]),/중복/);
 assert.throws(()=>validateTargets([{...target(),kind:'싱크대'}]),/세부/);
 assert.throws(()=>validateTargets([target(),target()]),/중복/);
 assert.throws(()=>validateTargets([{...target(),price:-1}]),/가격/);
 assert.throws(()=>validateTargets([{...target(),price:1.3}]),/가격/);
 assert.equal(validateTargets([{...target(),price:0}])[0].price,0);
 assert.throws(()=>validateTargets([],{reviewed:true}));
});
test('AI output cannot invent a price or claim administrator-confirmed absence of damage',()=>{
 const t=aiTargets([{...target(),price:9999999,damage:'파손 없음(관리자 확인)'}],()=>id)[0];
 assert.equal(t.price,null);assert.equal(t.damage,'파손 미관찰');assert.equal(t.id,id);
});
async function fixture(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.companies(id uuid primary key);create table public.super_admins(user_id uuid primary key,is_active boolean);
 create table public.work_items(id uuid primary key,company_id uuid,actual_cost numeric,sub_category text);
 create table public.work_photos(id uuid primary key,company_id uuid,work_item_id uuid,storage_path text,photo_url text,photo_type text,category text,sub_category text,created_at timestamptz default now());
 grant select,update on public.work_photos to service_role;grant select on public.super_admins,public.work_items to service_role;
 insert into companies values('${co}');insert into super_admins values('${id}',true);
 insert into work_items values('${other}','${co}',900000,'기존 시공 항목');
 insert into work_photos(id,company_id,work_item_id,photo_type) values('${photo}','${co}','${other}','after');`);
 const sql=fs.readFileSync(new URL('../database/photo_hierarchy_management.sql',import.meta.url),'utf8');await db.exec(sql);return {db,sql};
}
const save=(db,revision,targets=[target()],status='reviewed',actor=id)=>db.query('select public.save_photo_case_classification($1,$2,$3,$4::jsonb) as saved',[actor,photo,revision,JSON.stringify({photoStage:'after',status,targets})]);
test('schema preserves source photo and legacy price, atomically revisions per-target prices with audit and rejects stale saves',async()=>{
 const {db,sql}=await fixture();try{
  await db.exec('set role service_role');
  let rows=await db.query('select * from photo_case_management');assert.equal(rows.rows[0].review_status,'unclassified');assert.equal(rows.rows[0].revision,0);assert.equal(rows.rows[0].photo_stage,'after');
  const two=[target(),{...target(),id:other,part:'냉장고장',kind:'냉장고장',components:['상부장'],price:null}];
  const result=await save(db,0,two);assert.equal(result.rows[0].saved.revision,1);
  rows=await db.query('select * from photo_case_management');assert.equal(rows.rows[0].missing_prices,1);assert.equal(Number(rows.rows[0].legacy_price),900000);assert.equal(rows.rows[0].targets.length,2);
  await assert.rejects(save(db,0),/변경/);await assert.rejects(save(db,1,[target()],'reviewed',other),/권한/);
  assert.equal((await db.query('select count(*)::integer as n from photo_case_classification_history')).rows[0].n,1);
  await save(db,1,two,'excluded');await save(db,2,two,'reviewed');
  assert.equal((await db.query('select revision from photo_case_classifications')).rows[0].revision,3);
  assert.equal((await db.query('select count(*)::integer as n from work_photos')).rows[0].n,1);
  assert.equal(Number((await db.query('select actual_cost from work_items')).rows[0].actual_cost),900000);
  await db.exec('reset role');await db.exec(sql);assert.equal((await db.query('select revision from photo_case_classifications')).rows[0].revision,3);
 }finally{await db.close();}
});
test('anonymous and ordinary accounts cannot read, change or call classification persistence',async()=>{
 const {db}=await fixture();try{for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from photo_case_management'),/permission/);await assert.rejects(save(db,0),/permission/);await assert.rejects(db.query('select * from photo_case_classifications'),/permission/);await db.exec('reset role');}}finally{await db.close();}
});

test('kitchen refrigerator cabinets merge into the main sink without duplicating prices or changing standalone cabinets',async()=>{
 const {mergeKitchenTargets}=await import('../lib/photoHierarchy.mjs');
 const sink={...target(),part:'싱크대',kind:'일반 싱크대',components:['상부장','하부장'],price:500000};
 const cabinet={...target(),id:other,part:'냉장고장',kind:'냉장고장',components:['측판'],price:null};
 const island={...target(),id:photo,part:'싱크대',kind:'아일랜드',price:null};
 const result=mergeKitchenTargets([island,sink,cabinet]);
 assert.equal(result.length,2);assert.equal(result[0].kind,'아일랜드');
 assert.equal(result[1].kind,'냉장고장 결합형 싱크대');assert.equal(result[1].price,500000);
 assert.ok(result[1].components.includes('냉장고장'));
 assert.deepEqual(mergeKitchenTargets([cabinet]),[cabinet]);
 assert.throws(()=>mergeKitchenTargets([sink,{...cabinet,price:200000}]),/별도 가격/);
});
