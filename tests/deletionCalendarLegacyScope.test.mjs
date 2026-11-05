import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {recoverLegacyCalendarScope} from '../lib/deletionCalendarLegacyScope.mjs';
const user='00000000-0000-4000-8000-000000000001',site='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003';
const make=day=>({user_id:user,work_date:day,event_id:'fm'+createHash('sha256').update(`filmjang-v1:${user}:${site}:${day}`).digest('hex')});
function setup(){const saved=[];return {saved,options:{records:[make('2026-11-05')],assertActive:async()=>true,resolveSite:async id=>({id,company_id:company}),readEvent:async row=>({id:row.event_id,extendedProperties:{private:{source:'filmjang-v1',userId:user,siteId:site,workDate:row.work_date}}}),saveBindings:async rows=>{saved.push(...rows);return true;}}};}
test('verified remote metadata and deterministic identity recover only exact existing scope',async()=>{
 const x=setup();assert.deepEqual(await recoverLegacyCalendarScope(x.options),{recovered:1,unresolved:[],batchComplete:true});
 assert.deepEqual(x.saved,[{...make('2026-11-05'),site_id:site,company_id:company}]);
});
test('disconnected accounts and missing remote events remain unresolved without writes',async()=>{
 for(const status of [401,403,404,410]){const x=setup();x.options.readEvent=async()=>{throw Object.assign(new Error('private remote detail'),{status});};
 const r=await recoverLegacyCalendarScope(x.options);assert.equal(r.batchComplete,false);assert.equal(r.recovered,0);assert.equal(x.saved.length,0);assert.equal(JSON.stringify(r).includes('private remote'),false);}
});
test('foreign markers, mismatched original date and missing sites never establish ownership',async()=>{
 for(const mode of ['foreign','date','site']){const x=setup();const read=x.options.readEvent;
 x.options.readEvent=async row=>{const e=await read(row);if(mode==='foreign')e.extendedProperties.private.userId=company;if(mode==='date')e.extendedProperties.private.workDate='2026-11-04';return e;};
 if(mode==='site')x.options.resolveSite=async()=>null;
 assert.equal((await recoverLegacyCalendarScope(x.options)).batchComplete,false);assert.equal(x.saved.length,0);}
});
test('late transient failure rolls back the read batch before any bindings are persisted',async()=>{
 const x=setup();x.options.records.push(make('2026-11-06'));const read=x.options.readEvent;
 x.options.readEvent=async row=>{if(row.work_date==='2026-11-06')throw Object.assign(new Error('retry later'),{status:503});return read(row);};
 await assert.rejects(recoverLegacyCalendarScope(x.options),/retry later/);assert.equal(x.saved.length,0);
});
test('failed authorization or unconfirmed atomic save cannot report successful recovery',async()=>{
 const x=setup();x.options.assertActive=async()=>false;await assert.rejects(recoverLegacyCalendarScope(x.options),/authorization/);assert.equal(x.saved.length,0);
 const y=setup();y.options.saveBindings=async()=>false;await assert.rejects(recoverLegacyCalendarScope(y.options),/not confirmed/);
});
