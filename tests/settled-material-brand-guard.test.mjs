import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const modulePath=process.env.PGLITE_MODULE;
const {PGlite}=modulePath?await import(modulePath):{};
const sql=await fs.readFile(new URL('../database/film_brand_normalization.sql',import.meta.url),'utf8');
const site='11111111-1111-4111-8111-111111111111';
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
create table film_products(id int primary key,brand text,product_code text);
create table site_materials(id int primary key,site_id uuid,company_id int,material_type text,brand text,product_code text,product_name text,unit text,film_product_id int,quantity numeric,unit_price numeric,total_price numeric,memo text,updated_at timestamptz);
create table film_stock_rolls(id int primary key,brand text);
create table site_material_issues(material_id int,site_id uuid,voided_at timestamptz);
create table work_reports(site_id uuid,review_status text);
insert into film_products values(1,'영림 인테리어필름','PS160');
insert into site_materials values(1,'${site}',1,'actual','영림필름','PS160','필름','m',1,83.2,6500,540800,'원본',now());
insert into site_material_issues values(1,'${site}',null);
create function app_private.guard_settled_actual() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; typ text;
begin
 if tg_op='DELETE' then sid:=old.site_id; typ:=old.material_type; else sid:=new.site_id; typ:=new.material_type; end if;
 if typ='actual' and exists(select 1 from public.site_material_issues where site_id=sid and voided_at is null) and current_setting('app.material_settlement',true) is distinct from 'on' then
 raise exception '반출·반입 관리 현장은 완료보고에서 자재비가 자동 계산됩니다. 반입량 수정 후 보고서를 다시 제출해주세요.';
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
create trigger guard_settled_actual before insert or update or delete on site_materials for each row execute function app_private.guard_settled_actual();`);return db;}
test('full migration fixes the reported failure and preserves settled amounts',{skip:!modulePath},async()=>{const db=await fixture();try{
 await assert.rejects(db.exec("update site_materials set brand='영림'"),/자재비가 자동 계산/);
 await db.exec(sql);const r=(await db.query('select * from site_materials')).rows[0];assert.equal(r.brand,'영림');assert.equal(Number(r.quantity),83.2);assert.equal(Number(r.total_price),540800);assert.equal(r.film_product_id,1);
 await db.exec("update site_materials set brand='영림 인테리어필름',updated_at=now()");assert.equal((await db.query('select brand from site_materials')).rows[0].brand,'영림');
 await db.exec(sql);
 }finally{await db.close();}});
test('same-brand change cannot hide a money, product, company, site or memo change; insert/delete still blocked',{skip:!modulePath},async()=>{const db=await fixture();try{
 await db.exec(sql);
 for(const field of ['quantity=1','unit_price=1','total_price=1',"product_code='PS170'","product_name='다름'","unit='롤'",'film_product_id=2','company_id=2',"site_id='22222222-2222-4222-8222-222222222222'","memo='변경'","brand='현대'"]){
 // A site reassignment retains the original function's scope behavior, so keep destination under settlement management too.
 if(field.startsWith('site_id'))await db.exec("insert into site_material_issues values(2,'22222222-2222-4222-8222-222222222222',null)");
 await assert.rejects(db.exec("update site_materials set "+(field.startsWith("brand=")?field:"brand='영림필름',"+field)),/자재비가 자동 계산/);
 }
 await assert.rejects(db.exec('delete from site_materials'),/자재비가 자동 계산/);
 await assert.rejects(db.exec(`insert into site_materials(id,site_id,material_type,brand) values(2,'${site}','actual','영림')`),/자재비가 자동 계산/);
 }finally{await db.close();}});
test('existing settlement flag still allows authorized automatic cost calculation',{skip:!modulePath},async()=>{const db=await fixture();try{
 await db.exec(sql);await db.exec("begin;select set_config('app.material_settlement','on',true);update site_materials set quantity=1,total_price=6500;commit;");
 assert.equal(Number((await db.query('select total_price from site_materials')).rows[0].total_price),6500);
 await assert.rejects(db.exec('update site_materials set quantity=2'),/자재비가 자동 계산/);
 }finally{await db.close();}});
