import test from 'node:test';
import assert from 'node:assert/strict';
import {signDraft,readDraft,imageHash} from '../../lib/test/doorDraft.mjs';
test('signed analysis cannot be altered and expires after one hour',()=>{
 const value={analysis:{kind:'room'},company:'one',user:'owner',hash:imageHash(Buffer.from('photo'))};
 const token=signDraft(value,'test-key',1000);
 assert.equal(readDraft(token,'test-key',2000).company,'one');
 assert.throws(()=>readDraft(token,'wrong-key',2000));
 assert.throws(()=>readDraft('x'+token,'test-key',2000));
 assert.throws(()=>readDraft(token,'test-key',3601001));
});
