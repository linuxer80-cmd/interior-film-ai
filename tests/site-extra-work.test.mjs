import test from 'node:test';
import assert from 'node:assert/strict';
import { extraAmount, extraDescription, imageType } from '../lib/siteExtraWork.mjs';
test('amount requires whole won and keeps blank distinct from zero',()=>{
 assert.equal(extraAmount(''),null);assert.equal(extraAmount('0',true),0);assert.equal(extraAmount('100000'),100000);
 for(const n of ['',-1,'1.5','Infinity','1e6',1000000001])assert.throws(()=>extraAmount(n,true));
});
test('description is required and bounded',()=>{assert.equal(extraDescription(' 문 추가 '),'문 추가');for(const v of [null,' ', '가'.repeat(3001)])assert.throws(()=>extraDescription(v));});
test('only supported image signatures are accepted',()=>{
 assert.deepEqual(imageType(new Uint8Array([255,216,255,0])),['image/jpeg','jpg']);
 assert.deepEqual(imageType(new Uint8Array([137,80,78,71,13,10,26,10])),['image/png','png']);
 assert.throws(()=>imageType(new TextEncoder().encode('<svg onload="bad"/>')));
});
