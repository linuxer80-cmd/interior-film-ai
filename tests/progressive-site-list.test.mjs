import test from 'node:test';
import assert from 'node:assert/strict';
import {createProgressiveSiteList} from '../lib/progressiveSiteList.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const data=[], errors=[], syncErrors=[], loading=[];
  return {data,errors,syncErrors,loading,options:{companyId:'company-a',
    onData:value=>data.push(value),onError:error=>errors.push(error),
    onSyncError:error=>syncErrors.push(error),onLoading:value=>loading.push(value)}};
}
test('shows the list before a stalled status check and rereads only changed statuses',async()=>{
  const f=fixture(), status=deferred(); let reads=0;
  const load=createProgressiveSiteList().load({...f.options,read:async()=>[{status:++reads===1?'scheduled':'in_progress'}],sync:()=>status.promise});
  await load.ready;
  assert.equal(f.data[0][0].status,'scheduled'); assert.deepEqual(f.loading,[true,false]);
  status.resolve({changed:1}); await load.synced;
  assert.equal(reads,2); assert.equal(f.data[1][0].status,'in_progress');
});
test('unchanged statuses do not fetch a second copy of the list',async()=>{
  const f=fixture(); let reads=0;
  const load=createProgressiveSiteList().load({...f.options,read:async()=>{reads++;return [];},sync:async()=>({changed:0})});
  await load.synced; assert.equal(reads,1);
});
test('failed status check or follow-up read retains the usable list',async()=>{
  for(const fail of ['sync','refresh']) {
    const f=fixture(); let reads=0;
    const load=createProgressiveSiteList().load({...f.options,
      read:async()=>{if(++reads>1)throw Error('offline');return ['existing'];},
      sync:async()=>{if(fail==='sync')throw Error('timeout');return {changed:1};}});
    await load.synced; assert.deepEqual(f.data,[['existing']]);
    assert.equal(f.syncErrors.length,1);assert.equal(f.errors.length,0);
  }
});
test('overlapping loads share only the pending status check and ignore old responses',async()=>{
  const f=fixture(), loader=createProgressiveSiteList(), old=deferred(), status=deferred();let syncCalls=0;
  const sync=()=>{syncCalls++;return status.promise;};
  const first=loader.load({...f.options,read:()=>old.promise,sync});
  const second=loader.load({...f.options,read:async()=>['new'],sync});
  await second.ready;old.resolve(['old']);status.resolve({changed:0});
  await Promise.all([first.synced,second.synced]);
  assert.equal(syncCalls,1);assert.deepEqual(f.data,[['new']]);
  const third=loader.load({...f.options,read:async()=>['latest'],sync});
  await third.synced;assert.equal(syncCalls,2);
});
test('changing company or unmounting blocks the previous screen from updating',async()=>{
  const f=fixture(), loader=createProgressiveSiteList(), status=deferred(); const scopes=[];
  const first=loader.load({...f.options,read:async id=>[id],sync:id=>{scopes.push(id);return status.promise;}});
  await first.ready;
  const second=loader.load({...f.options,companyId:'company-b',read:async id=>[id],sync:async id=>{scopes.push(id);return {changed:0};}});
  await second.synced;status.resolve({changed:1});await first.synced;
  assert.deepEqual(scopes,['company-a','company-b']);assert.deepEqual(f.data,[['company-a'],['company-b']]);
  const pending=deferred();
  const third=loader.load({...f.options,read:()=>pending.promise,sync:async()=>({changed:1})});
  loader.invalidate();pending.resolve(['unmounted']);await third.synced;
  assert.equal(f.data.length,2);await flush();
});
