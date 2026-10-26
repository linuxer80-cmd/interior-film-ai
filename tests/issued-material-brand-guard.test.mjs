import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const modulePath=process.env.PGLITE_MODULE || '@electric-sql/pglite';
const {PGlite}=modulePath?await import(modulePath):{};
async function fixture(){const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role;create schema app_private;
 create table film_products(id int primary key,brand text,product_code text);
 create table site_materials(id int primary key,site_id int,material_type text,brand text,product_code text,product_name text,unit text,film_product_id int,unit_price numeric);
 create table film_stock_rolls(id int primary key,brand text);
 create table site_material_issues(material_id int);
 create table work_reports(site_id int,review_status text);
 insert into film_products values(1,'영림 인테리어필름','PS160');
 insert into site_materials values(1,10,'planned','영림필름','PS160','필름','m',1,6500);
 insert into film_stock_rolls values(1,'영림');insert into site_material_issues values(1);
 create function app_private.guard_issued_material() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if old.material_type='planned' and exists(select 1 from public.site_material_issues where material_id=old.id) then
 if tg_op='DELETE' then raise exception '반출 이력이 있는 자재는 삭제할 수 없습니다.';end if;
 if (new.brand,new.product_code,new.product_name,new.unit,new.film_product_id) is distinct from (old.brand,old.product_code,old.product_name,old.unit,old.film_product_id) then raise exception '반출 이력이 있는 제품은 바꿀 수 없습니다. 새 자재를 추가해주세요.';end if;
 if new.unit_price is distinct from old.unit_price and exists(select 1 from public.work_reports where site_id=old.site_id and review_status in ('pending','approved')) then raise exception '제출된 보고서의 자재 단가는 변경할 수 없습니다. 보고서를 반려한 뒤 수정해주세요.';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
 end $$;
 create trigger guard_issued_material before update or delete on site_materials for each row execute function app_private.guard_issued_material();
 `);return db;}
const sql=await fs.readFile(new URL('../database/film_brand_normalization.sql',import.meta.url),'utf8');
test('real issued-material guard allows only equivalent brand rename during migration',{skip:!modulePath},async()=>{const db=await fixture();try{
 await assert.rejects(db.exec("update site_materials set brand='영림' where id=1"),/반출 이력이 있는 제품/);
 await db.exec(sql);
 const r=(await db.query('select * from site_materials where id=1')).rows[0];assert.equal(r.brand,'영림');assert.equal(r.product_code,'PS160');assert.equal(r.film_product_id,1);assert.equal(Number(r.unit_price),6500);
 await db.exec("update site_materials set brand='영림 인테리어필름' where id=1");assert.equal((await db.query('select brand from site_materials')).rows[0].brand,'영림');
 await db.exec(sql);
 }finally{await db.close();}});
test('product identity and delete protection remain; submitted report price cannot change',{skip:!modulePath},async()=>{const db=await fixture();try{
 await db.exec(sql);
 for(const assignment of ["brand='현대'","product_code='PS170'","product_name='다른 제품'","unit='롤'","film_product_id=2","brand='영림필름',product_code='PS170'"])
  await assert.rejects(db.exec('update site_materials set '+assignment+' where id=1'),/반출 이력이 있는 제품/);
 await assert.rejects(db.exec('delete from site_materials where id=1'),/삭제할 수 없습니다/);
 await db.exec('update site_materials set unit_price=7000 where id=1');
 for(const status of ['pending','approved']){await db.exec('delete from work_reports');await db.query('insert into work_reports values(10,$1)',[status]);
  await assert.rejects(db.exec("update site_materials set brand='영림필름',unit_price=8000 where id=1"),/제출된 보고서의 자재 단가/);
  await db.exec("update site_materials set brand='영림필름' where id=1");
 }
 assert.equal(Number((await db.query('select unit_price from site_materials')).rows[0].unit_price),7000);
 }finally{await db.close();}});
