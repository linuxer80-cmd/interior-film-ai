import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedEmbedding } from '../lib/embeddingCache.js';
test('same company/model/exact input shares in-flight work, but not mutable output', async () => {
  let calls=0; const args={companyId:'a',model:'m',text:'same',load:async()=>{calls++; return [1,2];}};
  const [a,b]=await Promise.all([cachedEmbedding(args),cachedEmbedding(args)]);
  assert.equal(calls,1); a[0]=99; assert.equal(b[0],1);
  for(const patch of [{companyId:'b'},{model:'n'},{text:'different'}]) await cachedEmbedding({...args,...patch});
  assert.equal(calls,4);
});
test('expired and failed vectors are regenerated',async()=>{
 let calls=0;let clock=0;const args={companyId:'expiry',model:'m',text:'x',now:()=>clock,load:async()=>{calls++;return [1];}};
 await cachedEmbedding(args);clock=600001;await cachedEmbedding(args);assert.equal(calls,2);
 let fail=true;const broken={...args,text:'broken',load:async()=>{if(fail)throw Error('fail');return [2];}};
 await assert.rejects(cachedEmbedding(broken));fail=false;assert.deepEqual(await cachedEmbedding(broken),[2]);
});
