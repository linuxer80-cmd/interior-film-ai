import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const path=process.env.PGLITE_MODULE;
const {PGlite}=path?await import(path):{};
const sql=await fs.readFile(new URL('../database/film_brand_normalization.sql',import.meta.url),'utf8');
test('migration preserves IDs, prices and conflicting catalog rows; new writes normalize',{skip:!path},async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table film_products(id int primary key,brand text,product_code text,price numeric,unique(brand,product_code));create table site_materials(id int primary key,brand text,quantity numeric,total_price numeric,film_product_id int references film_products(id));create table film_stock_rolls(id int primary key,brand text,remaining numeric);
 insert into film_products values(1,'영림 인테리어필름','PS160',6500),(2,'현대','S115',7000),(3,'현대보닥','S115',8000);
 insert into site_materials values(1,'영림필름',83.2,540800,1),(2,'현대 & C',7,49000,2);
 insert into film_stock_rolls values(1,'현대L&C',10);`);
 await db.exec(sql);
 const p=(await db.query('select * from film_products order by id')).rows;assert.equal(p[0].brand,'영림');assert.equal(p[1].brand,'현대');assert.equal(p[2].brand,'현대보닥');assert.equal(Number(p[1].price),7000);
 const m=(await db.query('select * from site_materials order by id')).rows;assert.equal(m[0].brand,'영림');assert.equal(Number(m[0].quantity),83.2);assert.equal(Number(m[0].total_price),540800);assert.equal(m[0].film_product_id,1);assert.equal(m[1].brand,'현대보닥');
 assert.equal((await db.query('select brand from film_stock_rolls')).rows[0].brand,'현대보닥');
 await db.exec("insert into site_materials values(3,'영림 필름',1,9000,1);insert into film_products values(4,'현대&C','S120',5000);update film_stock_rolls set brand='영림필름' where id=1;");
 assert.equal((await db.query('select brand from film_products where id=4')).rows[0].brand,'현대보닥');assert.equal((await db.query('select brand from site_materials where id=3')).rows[0].brand,'영림');assert.equal((await db.query('select brand from film_stock_rolls')).rows[0].brand,'영림');
 await db.exec(sql);assert.equal((await db.query('select count(*) n from film_products')).rows[0].n,4);
 }finally{await db.close();}
});
