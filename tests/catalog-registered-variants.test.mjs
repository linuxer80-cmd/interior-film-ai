import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('registered non-fire codes search and resolve to the same product without crossing brands',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema app_private;
 create function app_private.film_alias_key(v text) returns text language sql immutable as $$ select regexp_replace(lower(coalesce(v,'')), '[[:space:]·＆&_-]+', '', 'g') $$;
 create function app_private.stock_brand_key(v text) returns text language sql immutable as $$ select lower(v) $$;
 create table film_products(id uuid,brand text,product_code text,product_name text,sample_image_path text,aliases text[],legacy_non_fire_code text,is_active boolean);
 insert into film_products values
 ('00000000-0000-0000-0000-000000000001','LX','RS130','화이트','rs130.webp','{}','ES130',true),
 ('00000000-0000-0000-0000-000000000002','삼성','SF121','화이트','sf121.webp','{}','SG121',true),
 ('00000000-0000-0000-0000-000000000003','한솔','A100','우드','a100.webp','{}','B100',true),
 ('00000000-0000-0000-0000-000000000004','LX','RS999','inactive',null,'{}','ES999',false);`);
 await db.exec(fs.readFileSync(new URL('../database/catalog_registered_variants.sql',import.meta.url),'utf8'));
 for(const [brand,query] of [['LX','ES130'],['삼성','SG121'],['한솔','B100']]){
  const result=(await db.query('select * from search_film_catalog($1)',[query])).rows;
  assert.equal(result[0].product_code,query);
  const linked=(await db.query('select * from resolve_film_alias($1,$2)',[brand,query])).rows;
  assert.equal(linked[0].id,result[0].id);assert.equal(linked[0].product_code,query);
  assert.equal((await db.query('select * from resolve_film_alias($1,$2)',['other',query])).rows.length,0);
 }
 assert.equal((await db.query("select * from search_film_catalog('ES999')")).rows.length,0);
 assert.equal((await db.query("select * from resolve_film_alias('LX','')")).rows.length,0);
 }finally{await db.close();}
});
