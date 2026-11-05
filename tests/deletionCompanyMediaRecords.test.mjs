import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('media phases are atomic and require explicit success including the last submission phase',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table effects(stage text);create table verdict(value boolean);insert into verdict values(null);
 create function delete_company_site_photo_references(uuid,uuid) returns boolean language plpgsql as $$begin insert into public.effects values('photos');return true;end;$$;
 create function delete_company_extra_work_records(uuid,uuid) returns boolean language plpgsql as $$begin insert into public.effects values('extra');return true;end;$$;
 create function delete_company_photo_submissions(uuid,uuid) returns boolean language plpgsql as $$begin insert into public.effects values('submissions');return (select value from public.verdict);end;$$;`);
 await db.exec(await readFile(new URL('../database/account_deletion_company_media_records.sql',import.meta.url),'utf8'));
 const run=()=>db.query('select delete_frozen_company_media_records(null,null) ok');
 for(const v of [null,false]){await db.query('update verdict set value=$1',[v]);await assert.rejects(run(),/Submission cleanup not confirmed/);assert.equal((await db.query('select count(*)::int n from effects')).rows[0].n,0);}
 await db.exec('update verdict set value=true');assert.equal((await run()).rows[0].ok,true);
 assert.deepEqual((await db.query('select stage from effects')).rows.map(r=>r.stage),['photos','extra','submissions']);
 assert.equal((await db.query("select has_function_privilege('authenticated','delete_frozen_company_media_records(uuid,uuid)','EXECUTE') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
