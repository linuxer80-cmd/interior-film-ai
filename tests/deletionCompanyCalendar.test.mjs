import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteCompanyCalendarEvents } from '../lib/deletionCompanyCalendar.mjs';
const company='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002', site='00000000-0000-4000-8000-000000000003';
function setup() {
 const record={userId:user,siteId:site,eventId:'fm'+'a'.repeat(64)};
 const remote=new Map([[record.eventId,{id:record.eventId,etag:'v1',extendedProperties:{private:{source:'filmjang-v1',userId:user,siteId:site}}}]]);
 const writes=[];
 return {record,remote,writes, options:{
  inventory:async()=>({complete:true,companyId:company,siteIds:[site],events:[record]}),
  assertLease:async()=>true,assertFrozen:async()=>true,
  read:async r=>{if(!remote.has(r.eventId))throw Object.assign(new Error('gone'),{status:404});return remote.get(r.eventId);},
  remove:async(r,{etag})=>{assert.equal(etag,remote.get(r.eventId).etag);writes.push(r.eventId);remote.delete(r.eventId);}
 }};
}
test('removes only verified app/site/user events with ETags and retries missing events',async()=>{
 const x=setup();assert.deepEqual(await deleteCompanyCalendarEvents(x.options),{verified:true,removed:1});
 assert.deepEqual(await deleteCompanyCalendarEvents(x.options),{verified:true,removed:0});assert.equal(x.writes.length,1);
});
test('foreign personal or other-site event aborts before all mutations',async()=>{
 for(const key of ['source','userId','siteId']) {
  const x=setup();x.remote.get(x.record.eventId).extendedProperties.private[key]='foreign';
  await assert.rejects(deleteCompanyCalendarEvents(x.options),/ownership/);assert.equal(x.writes.length,0);
 }
});
test('incomplete inventory and absent freeze cannot authorize deletion',async()=>{
 const x=setup();const inventory=x.options.inventory;
 x.options.inventory=async()=>({...await inventory(),complete:false});
 await assert.rejects(deleteCompanyCalendarEvents(x.options),/inventory/);
 x.options.inventory=inventory;x.options.assertFrozen=async()=>false;
 await assert.rejects(deleteCompanyCalendarEvents(x.options),/frozen/);assert.equal(x.writes.length,0);
});
test('ownership changes after initial read and failed remote reads cannot authorize writes',async()=>{
 const x=setup();let reads=0;
 const original=x.options.read;x.options.read=async r=>{const e=await original(r);if(++reads===2)e.extendedProperties.private.siteId='foreign';return e;};
 await assert.rejects(deleteCompanyCalendarEvents(x.options),/ownership/);assert.equal(x.writes.length,0);
 const y=setup();y.options.read=async()=>{throw Object.assign(new Error('unavailable'),{status:503});};
 await assert.rejects(deleteCompanyCalendarEvents(y.options),/unavailable/);assert.equal(y.writes.length,0);
});
test('expired lease and successful-looking delete with remaining event fail closed',async()=>{
 const x=setup();let checks=0;x.options.assertLease=async()=>++checks<4;
 await assert.rejects(deleteCompanyCalendarEvents(x.options),/leased/);assert.equal(x.writes.length,0);
 const y=setup();y.options.remove=async()=>{};
 await assert.rejects(deleteCompanyCalendarEvents(y.options),/not verified/);
});
test('a later inventory read failure prevents deleting an earlier valid event',async()=>{
 const x=setup();const second={...x.record,eventId:'fm'+'b'.repeat(64)};
 x.options.inventory=async()=>({complete:true,companyId:company,siteIds:[site],events:[x.record,second]});
 const original=x.options.read;
 x.options.read=async r=>{if(r.eventId===second.eventId)throw Object.assign(new Error('remote unavailable'),{status:503});return original(r);};
 await assert.rejects(deleteCompanyCalendarEvents(x.options),/remote unavailable/);
 assert.equal(x.writes.length,0);assert.equal(x.remote.size,1);
});
test('ETag conflict propagates and never reports a completed deletion',async()=>{
 const x=setup();x.options.remove=async()=>{throw Object.assign(new Error('version changed'),{status:412});};
 await assert.rejects(deleteCompanyCalendarEvents(x.options),/version changed/);
 assert.equal(x.remote.size,1);
});
