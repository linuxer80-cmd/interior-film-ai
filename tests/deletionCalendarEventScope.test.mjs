import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
const co='00000000-0000-4000-8000-000000000001',site='00000000-0000-4000-8000-000000000002',user='00000000-0000-4000-8000-000000000003';
const event='fm'+createHash('sha256').update(`filmjang-v1:${user}:${site}:2026-11-05`).digest('hex');
test('calendar ledger binds verified event identity to company/site and retains provenance after site removal',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;create table sites(id uuid primary key,company_id uuid);insert into sites values('${site}','${co}');create table calendar_auto_events(user_id uuid,event_id text,work_date date,primary key(user_id,event_id));`);
 const sql=await readFile(new URL('../database/account_deletion_calendar_event_scope.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await db.exec(await readFile(new URL('../database/account_deletion_calendar_scope_recovery.sql',import.meta.url),'utf8'));
 await db.query('insert into calendar_auto_events(user_id,event_id,work_date) values($1,$2,$3)',[user,event,'2026-11-05']);
 const binding={user_id:user,event_id:event,work_date:'2026-11-05',site_id:site,company_id:co};
 await assert.rejects(db.query('select recover_calendar_event_scope($1::jsonb)',[JSON.stringify([binding,{...binding,event_id:'fm'+'0'.repeat(64)}])]),/ledger changed/);
 assert.equal((await db.query('select site_id from calendar_auto_events')).rows[0].site_id,null);
 assert.equal((await db.query('select recover_calendar_event_scope($1::jsonb) ok',[JSON.stringify([binding])])).rows[0].ok,true);
 assert.equal((await db.query('select recover_calendar_event_scope($1::jsonb) ok',[JSON.stringify([binding])])).rows[0].ok,true);
 assert.equal((await db.query("select has_function_privilege('authenticated','recover_calendar_event_scope(jsonb)','EXECUTE') ok")).rows[0].ok,false);
 assert.deepEqual((await db.query('select company_id,site_id from calendar_auto_events')).rows,[{company_id:co,site_id:site}]);
 await assert.rejects(db.query('update calendar_auto_events set company_id=$1',[user]),/immutable/);
 await assert.rejects(db.query('insert into calendar_auto_events(user_id,event_id,work_date,site_id) values($1,$2,$3,$4)',[user,'fm'+'0'.repeat(64),'2026-11-05',site]),/identity mismatch/);
 await db.exec('delete from sites');
 await db.exec('update calendar_auto_events set site_id=null,company_id=null');
 assert.deepEqual((await db.query('select company_id,site_id from calendar_auto_events')).rows,[{company_id:co,site_id:site}]);
 await db.query('insert into calendar_auto_events(user_id,event_id,work_date) values($1,$2,$3)',[user,'legacy','2026-11-04']);
 assert.equal((await db.query("select company_id from calendar_auto_events where event_id='legacy'")).rows[0].company_id,null);
 }finally{await db.close();}
});
