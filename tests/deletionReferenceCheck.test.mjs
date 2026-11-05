import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDeletionReferences} from '../lib/deletionReferenceCheck.mjs';
const row={schema:'public',table:'labor_payment_records',column:'created_by',rows:1,delete_action:'a'};
const db=data=>({rpc:async()=>({data})});
test('remaining blocking references stop auth deletion',async()=>{assert.equal((await inspectDeletionReferences(db([row]),'u')).blocked,true);});
test('empty reference list is not represented as complete deletion',async()=>{assert.deepEqual(await inspectDeletionReferences(db([]),'u'),{references:[],blocked:false});});
test('malformed inventory and query errors fail closed',async()=>{for(const value of [null,{},[{}],[{...row,rows:'1'}],[{...row,delete_action:'unknown'}]]) await assert.rejects(inspectDeletionReferences(db(value),'u'));await assert.rejects(inspectDeletionReferences({rpc:async()=>({error:new Error('query failed')})},'u'),/query failed/);});
