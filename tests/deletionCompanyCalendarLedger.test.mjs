import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {clearVerifiedCompanyCalendarLedger} from '../lib/deletionCompanyCalendarLedger.mjs';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const row={user_id:id,site_id:id,company_id:id,event_id:'fm'+'a'.repeat(64)};
test('remote absence of every ledger entry is required, including unlisted/edited events',async()=>{
 for(const mode of ['gone','cancelled','live','denied']){
  let cleared=0;const db={from:()=>({select(){return this;},eq(){return this;},order(){return this;},range:async()=>({data:[row]})}),rpc:async(name)=>{if(name==='inspect_company_calendar_deletion_ledger')return {data:[row]};cleared++;return {data:true};}};
  const options={db,requestId:id,lease:id,scope:{companyId:id,siteIds:[id],userIds:[id],sitesComplete:true,usersComplete:true},assertLease:async()=>true,assertFrozen:async()=>true,api:async()=>{
   if(mode==='gone'||mode==='denied')throw Object.assign(Error('remote'),{status:mode==='gone'?404:403});return {id:row.event_id,status:mode==='cancelled'?'cancelled':'confirmed'};
  }};
  if(['gone','cancelled'].includes(mode)){assert.equal(await clearVerifiedCompanyCalendarLedger(options),true);assert.equal(cleared,1);}
  else{await assert.rejects(clearVerifiedCompanyCalendarLedger(options));assert.equal(cleared,0);}
 }
});
test('SQL requires exact receipt and frozen scope, preserves foreign ledger',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
 create table app_private.company_calendar_scope_history(company_id uuid,user_id uuid,site_id uuid,event_ids text[] default '{}');
 create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid);
 create table app_private.company_frozen_calendar_users(company_id uuid,user_id uuid,request_id uuid);
 create table calendar_auto_connections(user_id uuid,lease_id uuid);
 create table calendar_auto_events(company_id uuid,user_id uuid,site_id uuid,event_id text);
 create function app_private.authorize_company_cleanup(uuid,uuid) returns void language plpgsql as $$begin if $2<>'${id}' then raise exception 'lease';end if;end$$;
 create function inspect_company_calendar_deletion_ledger(uuid,uuid) returns jsonb language sql as $$select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (select company_id,user_id,site_id,event_id from public.calendar_auto_events where company_id=$1 union select company_id,user_id,site_id,unnest(event_ids) from app_private.company_calendar_scope_history where company_id=$1) e$$;
 create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
 insert into account_deletion_requests values('${id}','${id}','${id}');
 insert into app_private.company_frozen_calendar_users values('${id}','${id}','${id}');
 insert into calendar_auto_events values('${id}','${id}','${id}','${row.event_id}'),('${other}','${other}','${other}','${row.event_id}');`);
 await db.exec(await readFile(new URL('../database/account_deletion_calendar_ledger.sql',import.meta.url),'utf8'));
 const call=records=>db.query('select clear_verified_company_calendar_ledger($1,$2,$3) ok',[id,id,JSON.stringify(records)]);
 for(const invalid of [[],[row,row],[{...row,site_id:other}],[{...row,company_id:other}]])await assert.rejects(call(invalid));
 assert.equal((await db.query('select count(*)::int n from calendar_auto_events')).rows[0].n,2);
 assert.equal((await call([row])).rows[0].ok,true);
 assert.deepEqual((await db.query('select company_id from calendar_auto_events')).rows,[{company_id:other}]);
 assert.equal((await call([])).rows[0].ok,true);
 await db.query('insert into app_private.company_calendar_scope_history values($1,$1,$1,$2)',[id,[row.event_id]]);
 await assert.rejects(call([]),/incomplete/);
 assert.equal((await call([row])).rows[0].ok,true);
 assert.equal((await db.query('select count(*)::int n from app_private.company_calendar_scope_history')).rows[0].n,0);
 assert.equal((await db.query("select has_function_privilege('authenticated','clear_verified_company_calendar_ledger(uuid,uuid,jsonb)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
test('approved policy preserves reattributed external event but never hides verified target or API outage',async()=>{
 for(const mode of ['unknown','target','outage']){
  let cleared=false;
  const options={requestId:id,lease:id,scope:{companyId:id,siteIds:[id],userIds:[id],policy:'verified_app_events_only',knownScopeVerified:true,sitesComplete:false,usersComplete:false},assertLease:async()=>true,assertFrozen:async()=>true,
   db:{rpc:async name=>name==='inspect_company_calendar_deletion_ledger'?{data:[row]}:(cleared=true,{data:true})},
   api:async()=>{if(mode==='outage')throw Object.assign(Error('denied'),{status:403});return {id:row.event_id,extendedProperties:{private:mode==='target'?{source:'filmjang-v1',userId:id,siteId:id}:{source:'other'}}};}};
  if(mode==='unknown'){assert.equal(await clearVerifiedCompanyCalendarLedger(options),true);assert.equal(cleared,true);}
  else{await assert.rejects(clearVerifiedCompanyCalendarLedger(options));assert.equal(cleared,false);}
 }
});
