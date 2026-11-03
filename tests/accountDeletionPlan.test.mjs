import test from 'node:test';
import assert from 'node:assert/strict';
import { planDeletion } from '../lib/accountDeletionPlan.mjs';

test('only confirmed personal data without retention or sharing is eligible', () => {
 const records = [
  {id:'own',ownerId:'u',category:'personal',shared:false,legalHold:false},
  {id:'hold',ownerId:'u',category:'personal',shared:false,legalHold:true},
  {id:'shared',ownerId:'u',category:'personal',shared:true,legalHold:false},
  {id:'other',ownerId:'v',category:'personal',shared:false,legalHold:false},
  {id:'unknown',ownerId:'u',category:'personal',shared:false}
 ];
 assert.deepEqual(planDeletion({subjectId:'u', records}).map(x=>x.action),['eligible','retain','review','review','review']);
});
test('rejects invalid requests',()=> {
 assert.throws(()=>planDeletion({subjectId:'',records:[]}));
 assert.throws(()=>planDeletion({subjectId:'u',records:[{}]}));
});
