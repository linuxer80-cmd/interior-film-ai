import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyCalendarCleanup } from '../lib/deletionCompanyCalendarInventory.mjs';
const company='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002',site='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004';
const event=(letter,siteId=site)=>({id:'fm'+letter.repeat(64),etag:'v1',extendedProperties:{private:{source:'filmjang-v1',userId:user,siteId}}});
function setup() {
 const remote=new Map([event('a'),event('b',other)].map(e=>[e.id,e]));const calls=[];
 const options={scope:{companyId:company,siteIds:[site],userIds:[user],sitesComplete:true,usersComplete:true},assertLease:async()=>true,assertFrozen:async()=>true,
 api:async(u,path,opts)=>{
  calls.push({u,path,opts});
  if(path.startsWith('?'))return {kind:'calendar#events',items:[...remote.values()]};
  if(!remote.has(path.slice(1)))throw Object.assign(new Error('gone'),{status:404});
  if(opts?.method==='DELETE'){assert.equal(opts.etag,'v1');remote.delete(path.slice(1));return null;}
  return remote.get(path.slice(1));
 }};return {remote,calls,options};
}
test('end-to-end adapter inventories without date cutoff, deletes only company events and verifies with fresh list',async()=>{
 const x=setup();const stage=createCompanyCalendarCleanup(x.options);
 assert.deepEqual(await stage.execute(),{verified:true,removed:1});assert.equal(x.remote.size,1);
 assert.equal([...x.remote.values()][0].extendedProperties.private.siteId,other);
 for(const c of x.calls.filter(c=>c.path.startsWith('?'))) {
  const p=new URLSearchParams(c.path.slice(1));assert.equal(p.has('timeMin'),false);assert.equal(p.has('timeMax'),false);
  assert.deepEqual(p.getAll('privateExtendedProperty'),['source=filmjang-v1','userId='+user]);
 }
 assert.deepEqual(await stage.execute(),{verified:true,removed:0});
});
test('empty intermediate page still follows next token; malformed/repeating pagination fails',async()=>{
 const x=setup();let n=0;
 x.options.api=async()=>++n===1?{kind:'calendar#events',nextPageToken:'page2'}:{kind:'calendar#events',items:[event('a')]};
 assert.equal((await createCompanyCalendarCleanup(x.options).inventory()).events.length,1);assert.equal(n,2);
 x.options.api=async()=>({kind:'calendar#events',items:[],nextPageToken:'loop'});
 await assert.rejects(createCompanyCalendarCleanup(x.options).inventory(),/pagination/);
 x.options.api=async()=>({kind:'calendar#events',items:{}});
 await assert.rejects(createCompanyCalendarCleanup(x.options).inventory(),/Invalid/);
});
test('incomplete server history refuses scope and read failure on later user prevents all writes',async()=>{
 const x=setup();x.options.scope.usersComplete=false;
 assert.throws(()=>createCompanyCalendarCleanup(x.options),/Complete server/);
 x.options.scope.usersComplete=true;x.options.scope.userIds.push(other);
 const api=x.options.api;x.options.api=async(u,...args)=>{if(u===other)throw new Error('connection revoked');return api(u,...args);};
 await assert.rejects(createCompanyCalendarCleanup(x.options).execute(),/connection revoked/);
 assert.equal(x.calls.some(c=>c.opts?.method==='DELETE'),false);
});
test('new event appearing after deletion blocks completion',async()=>{
 const x=setup();const api=x.options.api;let lists=0;
 x.options.api=async(u,path,opts)=>{if(path.startsWith('?')&&++lists===2)x.remote.set(event('c').id,event('c'));return api(u,path,opts);};
 await assert.rejects(createCompanyCalendarCleanup(x.options).execute(),/events remain/);
});
test('missing site ownership and foreign app markers cannot enter the manifest',async()=>{
 for(const key of ['siteId','source','userId']) {
  const x=setup();delete x.remote.get(event('a').id).extendedProperties.private[key];
  await assert.rejects(createCompanyCalendarCleanup(x.options).execute(),/ownership/);
  assert.equal(x.calls.some(c=>c.opts?.method==='DELETE'),false);
 }
});

test('approved known-scope policy deletes verified events and retains unattributable external events',async()=>{
 const x=setup();Object.assign(x.options.scope,{sitesComplete:false,usersComplete:false,policy:'verified_app_events_only',knownScopeVerified:true});
 const unknown={id:'personal-event',etag:'v1',summary:'Personal'};x.remote.set(unknown.id,unknown);
 const stage=createCompanyCalendarCleanup(x.options);assert.deepEqual(await stage.execute(),{verified:true,removed:1});assert.ok(x.remote.has(unknown.id));assert.equal(x.remote.size,2);
 const bad=setup();Object.assign(bad.options.scope,{sitesComplete:false,usersComplete:false,policy:'verified_app_events_only'});
 assert.throws(()=>createCompanyCalendarCleanup(bad.options),/Complete server/);
});
