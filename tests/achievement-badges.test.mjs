// Local isolated PostgreSQL tests: npm install --no-save @electric-sql/pglite
// Never points at the production database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {cleanBadge,badgeProgress,nextBadge} from '../lib/achievements.mjs';
const owner='10000000-0000-0000-0000-000000000001',worker='10000000-0000-0000-0000-000000000002',other='10000000-0000-0000-0000-000000000003',admin='10000000-0000-0000-0000-000000000004';
const co='20000000-0000-0000-0000-000000000001',otherCo='20000000-0000-0000-0000-000000000002';
const example={id:'new_badge',title:'새 배지',description:'승인 현장 50건',audience:'owner',metric:'approved_sites',target:50,art_key:1,image_path:'',tier:'gold',sort_order:50,active:true,revision:0};
test('catalog validation and progress handle boundaries',()=>{
 assert.equal(cleanBadge(example).target,50);
 for(const patch of [{target:0},{target:1.5},{target:NaN},{audience:'worker'},{image_path:'https://external/image.svg'},{revision:-1},{metric:'arbitrary_sql'}]) assert.throws(()=>cleanBadge({...example,...patch}));
 assert.equal(badgeProgress({progress:12,target:10}),100);
 assert.equal(badgeProgress({progress:0,target:10,earned_at:'date'}),100);
 assert.equal(nextBadge([{id:'hidden',active:false,progress:9,target:10},{id:'visible',active:true,progress:1,target:10}]).id,'visible');
});
test('PostgreSQL: tenant isolation, counts, persistent awards and expandable catalog',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 create table public.companies(id uuid primary key,is_active boolean);
 create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
 create table public.super_admins(user_id uuid primary key,is_active boolean);
 create table public.sites(id uuid primary key,company_id uuid,status text);
 create table public.work_reports(id uuid primary key,site_id uuid,company_id uuid,created_by uuid,review_status text);
 create table public.workers(id uuid primary key,user_id uuid,company_id uuid,is_active boolean);
 create table public.worker_relationships(worker_id uuid,user_id uuid,company_id uuid,ended_at timestamptz);
 create table public.film_stock_trips(id uuid primary key,site_id uuid,company_id uuid,returned_by uuid,returned numeric);
 create table public.labor_profiles(user_id uuid primary key,name text,photo_path text,region text,daily_wage integer);
 create table public.labor_personal_details(user_id uuid primary key,phone text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);
 insert into auth.users values('${owner}',now()),('${worker}',now()),('${other}',now()),('${admin}',now());
 insert into companies values('${co}',true),('${otherCo}',true);
 insert into profiles values('${owner}','${co}','owner',true),('${other}','${otherCo}','owner',true);
 insert into super_admins values('${admin}',true);
 insert into labor_profiles values('${worker}','시공자','avatar.webp','인천',250000);
 insert into labor_personal_details values('${worker}','01000000000');
 insert into sites select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${co}','completed' from generate_series(1,10) n;
 insert into work_reports select gen_random_uuid(),id,company_id,'${worker}','approved' from sites;
 insert into film_stock_trips select gen_random_uuid(),id,company_id,'${worker}',5 from sites;
 -- A duplicate report must not count as another completed site.
 insert into work_reports select gen_random_uuid(),id,company_id,'${worker}','approved' from sites limit 1;
 `);
 await db.exec(await readFile(new URL('../database/achievement_badges.sql',import.meta.url),'utf8'));
 const call=async(actor,action,body={})=>(await db.query('select public.achievement_action($1::uuid,$2::text,$3::jsonb) as result',[actor,action,JSON.stringify(body)])).rows[0].result;
 let r=await call(owner,'get',{scope:'owner'});
 assert.equal(r.badges.find(b=>b.id==='site_expert').progress,10);
 assert.ok(r.badges.find(b=>b.id==='site_expert').earned_at);
 assert.equal(r.badges.find(b=>b.id==='stock_care').progress,10);
 const earned=r.badges.find(b=>b.id==='site_expert').earned_at;
 await call(owner,'get',{scope:'owner'});
 assert.equal((await db.query("select count(*)::int n from achievement_awards where badge_id='site_expert'")).rows[0].n,1);
 r=await call(other,'get',{scope:'owner',company_id:co});
 assert.equal(r.badges.find(b=>b.id==='site_expert').progress,0);
 await assert.rejects(call(worker,'get',{scope:'owner'}));
 await assert.rejects(call(other,'feature',{scope:'owner',badge_id:'site_expert'}));
 await assert.rejects(call(owner,'save',example));
 r=await call(worker,'get',{scope:'worker'});
 assert.equal(r.badges.find(b=>b.id==='report_expert').progress,10);
 assert.ok(r.badges.every(b=>b.earned_at));
 await call(worker,'seen',{scope:'worker',badge_ids:['first_report']});
 r=await call(worker,'get',{scope:'worker'});
 assert.equal(r.badges.find(b=>b.id==='first_report').unseen,false);
 await call(worker,'feature',{scope:'worker',badge_id:'report_expert'});
 assert.equal((await call(worker,'get',{scope:'worker'})).featured,'report_expert');
 const catalog=await call(admin,'catalog');
 const expert=catalog.badges.find(b=>b.id==='site_expert');
 await assert.rejects(call(admin,'save',{...expert,target:20}));
 await assert.rejects(call(admin,'save',{...expert,revision:0}));
 await call(admin,'save',{...expert,active:false});
 await db.exec("update sites set status='cancelled';");
 r=await call(owner,'get',{scope:'owner'});
 assert.equal(r.badges.find(b=>b.id==='site_expert').earned_at,earned);
 assert.equal(r.badges.find(b=>b.id==='site_expert').progress,0);
 assert.equal(r.badges.find(b=>b.id==='site_expert').active,false);
 assert.equal((await call(other,'get',{scope:'owner'})).badges.some(b=>b.id==='site_expert'),false);
 await call(admin,'save',{...example,target:1});
 await db.exec("update sites set status='completed';");
 assert.ok((await call(owner,'get',{scope:'owner'})).badges.find(b=>b.id==='new_badge').earned_at);
 // Open roll trip prevents an unsettled site counting; previous awards remain.
 await db.exec('update film_stock_trips set returned=null where id=(select id from film_stock_trips limit 1)');
 assert.equal((await call(owner,'get',{scope:'owner'})).badges.find(b=>b.id==='stock_care').progress,9);
 // Seed reruns never overwrite a customized/hidden definition.
 await db.exec(await readFile(new URL('../database/achievement_badges.sql',import.meta.url),'utf8'));
 assert.equal((await call(admin,'catalog')).badges.find(b=>b.id==='site_expert').active,false);
 await db.exec('set role anon');
 await assert.rejects(db.query('select * from public.achievement_awards'));
 await assert.rejects(db.query("select public.achievement_action($1,'get','{\"scope\":\"worker\"}')",[worker]));
 await db.exec('reset role;set role authenticated');
 await assert.rejects(db.query('insert into public.achievement_awards values($1,$2,now(),100)',[`user:${other}`,'report_expert']));
 await db.exec('reset role');
 }finally{await db.close();}
});
