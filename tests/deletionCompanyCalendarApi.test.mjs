import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeletionCalendarApi,createAuthenticatedCompanyCalendarCleanup} from '../lib/deletionCompanyCalendarApi.mjs';
const user='00000000-0000-4000-8000-000000000001',company='00000000-0000-4000-8000-000000000002',site='00000000-0000-4000-8000-000000000003';
const path='/fm'+'a'.repeat(64);
function fixture(){
 const row={user_id:user,refresh_cipher:'cipher',needs_reconnect:false,lease_id:null,enabled:false};
 const calls=[];let time=0,save=true;
 const db={from(table){assert.equal(table,'calendar_auto_connections');let write=null;return {select(){return this;},eq(){return this;},is(k,v){assert.equal(k,'lease_id');assert.equal(v,null);return this;},update(value){write=value;return this;},async maybeSingle(){if(write){if(!save)return {data:null};Object.assign(row,write);}return {data:{...row}};}};}};
 const options={db,userIds:[user],assertLease:async()=>true,assertFrozen:async()=>true,
 decrypt:(value,context)=>{assert.equal(context,'refresh:'+user);return value;},encrypt:v=>'encrypted:'+v,
 refresh:async()=>{calls.push('refresh');return {access_token:'private-token',expires_in:3600};},
 api:async(token,p,opts)=>{calls.push({token,p,opts});return {};},now:()=>time};
 return {row,calls,options,setTime:v=>{time=v;},failSave:()=>{save=false;}};
}
test('disabled sync connections still authorize cleanup; tokens reused until expiry',async()=>{
 const x=fixture(),api=createDeletionCalendarApi(x.options);await api(user,path);await api(user,path,{method:'DELETE',etag:'v1'});
 assert.equal(x.calls.filter(c=>c==='refresh').length,1);assert.deepEqual(x.calls.at(-1).opts,{method:'DELETE',etag:'v1'});
 x.setTime(3600000);await api(user,path);assert.equal(x.calls.filter(c=>c==='refresh').length,2);
});
test('scope, invalid operations, reconnect, active sync and lost freeze reject before HTTP',async()=>{
 for(const change of [x=>{x.row.needs_reconnect=true;},x=>{x.row.lease_id='busy';},x=>{x.options.assertFrozen=async()=>false;},x=>{x.row.refresh_cipher='';}]){
  const x=fixture();change(x);await assert.rejects(createDeletionCalendarApi(x.options)(user,path));assert.deepEqual(x.calls,[]);
 }
 const x=fixture(),api=createDeletionCalendarApi(x.options);
 for(const [u,p,opts] of [[company,path,{}],[user,'https://other.test',{}],[user,path,{method:'POST'}],[user,path,{method:'DELETE'}],[user,'?x=1',{method:'DELETE',etag:'v'}]])await assert.rejects(api(u,p,opts));
 assert.deepEqual(x.calls,[]);
});
test('rotated token must be saved before calendar API and cached credentials detect connection changes',async()=>{
 const x=fixture();x.options.refresh=async()=>({access_token:'token',expires_in:3600,refresh_token:'rotated'});
 const api=createDeletionCalendarApi(x.options);await api(user,path);assert.equal(x.row.refresh_cipher,'encrypted:rotated');
 const y=fixture();y.options.refresh=x.options.refresh;y.failSave();await assert.rejects(createDeletionCalendarApi(y.options)(user,path),/rotation/);assert.deepEqual(y.calls,[]);
 x.row.needs_reconnect=true;await assert.rejects(api(user,path),/reconnection/);
});
test('composed credentials, inventory, conditional deletion and verification complete in one flow',async()=>{
 const x=fixture();const own={id:path.slice(1),etag:'v1',extendedProperties:{private:{source:'filmjang-v1',userId:user,siteId:site}}};
 let exists=true,deletes=0;
 x.options.api=async(token,p,opts)=>{
  assert.equal(token,'private-token');
  if(p.startsWith('?'))return {kind:'calendar#events',items:exists?[own]:[]};
  if(!exists)throw Object.assign(Error('gone'),{status:404});
  if(opts.method==='DELETE'){assert.equal(opts.etag,'v1');exists=false;deletes++;return null;}
  return own;
 };
 const stage=await createAuthenticatedCompanyCalendarCleanup({...x.options,scope:{companyId:company,siteIds:[site],userIds:[user],sitesComplete:true,usersComplete:true}});
 assert.deepEqual(await stage.execute(),{verified:true,removed:1});assert.equal(deletes,1);
 assert.deepEqual(await stage.execute(),{verified:true,removed:0});assert.equal(deletes,1);
});
test('lease lost after token refresh stops remote calls; changed event is never retried blindly',async()=>{
 const x=fixture();let valid=true;x.options.assertLease=async()=>valid;
 x.options.refresh=async()=>{valid=false;return {access_token:'token',expires_in:3600};};
 await assert.rejects(createDeletionCalendarApi(x.options)(user,path),/guard/);assert.deepEqual(x.calls,[]);
 const y=fixture();let attempts=0;y.options.api=async()=>{attempts++;throw Object.assign(Error('event changed'),{status:412});};
 await assert.rejects(createDeletionCalendarApi(y.options)(user,path,{method:'DELETE',etag:'old'}),e=>e.status===412);assert.equal(attempts,1);
});
