import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const user='00000000-0000-4000-8000-000000000001',co='00000000-0000-4000-8000-000000000002',photo='00000000-0000-4000-8000-000000000003',item='00000000-0000-4000-8000-000000000004';
const target={id:item,space:'주거공간',part:'싱크대',kind:'일반 싱크대',shapes:['일자형'],damage:'파손 미관찰',components:['상부장'],price:500000,notes:'',priceNote:''};
test('admin registration is company scoped, atomic, audited and safely idempotent',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema storage;create table storage.objects(bucket_id text,name text);
 create table companies(id uuid primary key,is_active boolean);
 create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
 create table work_items(id uuid primary key,company_id uuid,project_id uuid,category text,sub_category text,actual_cost numeric,case_profile jsonb,memo text);
 create table work_photos(id uuid primary key,company_id uuid,project_id uuid,work_item_id uuid,storage_path text,photo_type text,category text,sub_category text,image_hash text);
 create table photo_case_classifications(photo_id uuid primary key,company_id uuid,photo_stage text,targets jsonb,review_status text,updated_by uuid);
 create table photo_case_classification_history(photo_id uuid,actor uuid,next_value jsonb);
 insert into companies values('${co}',true);insert into profiles values('${user}','${co}','owner',true);
 insert into storage.objects values('work-photos','hierarchy/${co}/${photo}.jpg');`);
 await db.exec(fs.readFileSync(new URL('../database/admin_photo_hierarchy_register.sql',import.meta.url),'utf8'));
 const save=(actor=user,path=`hierarchy/${co}/${photo}.jpg`,targets=[target])=>db.query('select register_admin_photo_hierarchy($1,$2,$3,$4,$5,$6,$7::jsonb,$8) as value',[actor,photo,item,path,'sha256','before',JSON.stringify(targets),'메모']);
 await assert.rejects(save(co),/관리자/);await assert.rejects(save(user,'another-company/photo.jpg'),/경로/);
 const result=await save();assert.equal(result.rows[0].value.reused,false);
 assert.equal((await save()).rows[0].value.reused,true);
 assert.equal((await db.query('select count(*)::int n from photo_case_classification_history')).rows[0].n,1);
 assert.equal((await db.query('select actual_cost::int n from work_items')).rows[0].n,500000);
 await assert.rejects(save(user,`hierarchy/${co}/${photo}.jpg`,[{...target,price:1000}]),/이미 등록/);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(save(),/permission/);await db.exec('reset role');}
 await db.exec(`update profiles set role='worker' where id='${user}'`);await assert.rejects(save(),/관리자/);
 }finally{await db.close();}
});

import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/api/admin/photo-data/route.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
function fixture(role='owner'){
 const calls=[],exports={};let analyses=0;
 const db={auth:{getUser:async()=>({data:{user:{id:user}}})},from(table){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:table==='profiles'?{role,company_id:co,is_active:true}:{id:co}})};return q;},storage:{from:()=>({upload:async()=>{calls.push('upload');return {};}})},rpc:async(name,body)=>{calls.push({name,body});return {data:{photoId:photo}};}};
 vm.runInNewContext(code,{exports,Response,Buffer,console,process:{env:{}},require(path){if(path.includes('supabase-js'))return {createClient:()=>db};if(path==='node:crypto')return require(path);if(path.includes('analyzePhotoHierarchy'))return {analyzePhotoHierarchy:async()=>{analyses++;return [target];}};if(path.includes('photoHierarchy'))return hierarchy;throw Error(path);}});
 return {calls,analyses:()=>analyses,post:async(action='save')=>{const f=new FormData();for(const [k,v] of Object.entries({action,stage:'before',photoId:photo,itemId:item,targets:JSON.stringify([target]),companyId:'untrusted-company'}))f.set(k,v);f.set('file',new Blob([new Uint8Array([255,216,255,224,0,0])],{type:'image/jpeg'}),'photo.jpg');return exports.POST(new Request('https://app.test/api/admin/photo-data',{method:'POST',headers:{authorization:'Bearer test'},body:f}));}};
}
import * as hierarchy from '../lib/photoHierarchy.mjs';
test('registration API denies workers and saves verified actor without an AI call',async()=>{
 const worker=fixture('worker');assert.equal((await worker.post()).status,403);assert.equal(worker.calls.length,0);
 const owner=fixture();assert.equal((await owner.post()).status,200);assert.equal(owner.analyses(),0);
 assert.equal(owner.calls[1].body.p_user,user);assert.equal(owner.calls[1].body.p_targets[0].price,500000);
 assert.equal(owner.calls[1].body.p_path,`hierarchy/${co}/${photo}.jpg`);
 const analyze=fixture();assert.equal((await analyze.post('analyze')).status,200);assert.equal(analyze.analyses(),1);assert.equal(analyze.calls.length,0);
});
