import test from 'node:test';
import assert from 'node:assert/strict';
import {materialTrips} from '../lib/materialTripScope.mjs';
const trips=[{id:'a',site_id:'site',material_id:'px',returned:null},{id:'b',site_id:'site',material_id:'ps',returned:null},{id:'c',site_id:'other',material_id:'px',returned:null},{id:'d',site_id:'site',material_id:'px',returned:0},{id:'e',site_id:'site',material_id:'ps',returned:5}];
test('expanded product only shows its own outstanding rolls',()=>assert.deepEqual(materialTrips(trips,'site','px').map(t=>t.id),['a']));
test('returned history uses the same product and site and preserves zero returns',()=>assert.deepEqual(materialTrips(trips,'site','px',true).map(t=>t.id),['d']));
test('noncompact workspace keeps all site products without cross-site rows',()=>assert.deepEqual(materialTrips(trips,'site').map(t=>t.id),['a','b']));
