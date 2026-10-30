import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ids={c:'11111111-1111-4111-8111-111111111111',other:'22222222-2222-4222-8222-222222222222',u:'33333333-3333-4333-8333-333333333333',site:'44444444-4444-4444-8444-444444444444',otherSite:'55555555-5555-4555-8555-555555555555',quote:'66666666-6666-4666-8666-666666666666'};
async function database(){const db=new PGlite();await db.exec(`create role anon; create role authenticated; create role service_role;
 create table public.companies(id uuid primary key);
 create table public.sites(id uuid primary key,company_id uuid not null references public.companies,status text);
 create table public.site_consultation_quotes(site_id uuid primary key,company_id uuid not null,document jsonb not null,revision int not null,updated_at timestamptz not null);
 create table public.site_completion_estimates(site_id uuid primary key,company_id uuid not null,document jsonb not null,revision int not null,updated_at timestamptz not null,updated_by uuid not null);
 insert into companies values ('${ids.c}'),('${ids.other}');
 insert into sites(id,company_id) values ('${ids.site}','${ids.c}'),('${ids.otherSite}','${ids.other}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261030074100_standalone_quotes.sql',import.meta.url),'utf8'));
 await db.exec(`insert into standalone_quotes(id,company_id,created_by,area_document,area_revision,cost_document,cost_revision) values ('${ids.quote}','${ids.c}','${ids.u}','{"items":[]}',1,'{"items":[],"note":""}',1);`);return db;}
const call=(site,company=ids.c)=>`select public.link_standalone_quote('${ids.quote}','${site}','${company}','${ids.u}')`;
test('연결은 같은 업체의 현장에 두 견적을 복사하며 원본을 연결 상태로 표시한다',async()=>{const db=await database();try{await db.query(call(ids.site));const x=await db.query(`select linked_site_id,(select count(*) from site_consultation_quotes) a,(select count(*) from site_completion_estimates) b from standalone_quotes where id='${ids.quote}'`);assert.equal(x.rows[0].linked_site_id,ids.site);assert.equal(Number(x.rows[0].a),1);assert.equal(Number(x.rows[0].b),1);await assert.rejects(db.query(call(ids.site)),/이미 현장에 연결/);}finally{await db.close()}});
test('다른 업체 현장이나 기존 견적 덮어쓰기를 거부하며 연결을 롤백한다',async()=>{const db=await database();try{await assert.rejects(db.query(call(ids.otherSite)),/현장을 찾을 수 없습니다/);await db.exec(`insert into site_completion_estimates values ('${ids.site}','${ids.c}','{"items":[],"note":"original"}',1,now(),'${ids.u}')`);await assert.rejects(db.query(call(ids.site)),/duplicate key/);const a=await db.query(`select linked_site_id,(select count(*) from site_consultation_quotes) count from standalone_quotes where id='${ids.quote}'`);assert.equal(a.rows[0].linked_site_id,null);assert.equal(Number(a.rows[0].count),0);}finally{await db.close()}});
test('취소된 현장에는 견적서를 연결하지 않는다',async()=>{const db=await database();try{await db.exec(`update sites set status='cancelled' where id='${ids.site}'`);await assert.rejects(db.query(call(ids.site)),/현장을 찾을 수 없습니다/);}finally{await db.close()}});
test('비로그인 및 일반 클라이언트 역할은 독립 견적과 연결 함수에 접근할 수 없다',async()=>{const db=await database();try{await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.standalone_quotes'),/permission denied/);await assert.rejects(db.query(call(ids.site)),/permission denied/);}finally{await db.close()}});
