import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, matchDoors, validate } from '../../lib/test/doorMatch.mjs';
const a={kind:'room',opening:'hinged',surface:'flat',glass:'none',frame:'simple',condition:'sound',leaves:1,completeness:'full',confidence:'high',description:'방문'};
const row=(id,extra={})=>({photo_id:id,analysis:a,version:VERSION,scope:'leaf_frame',unit_price:180000,...extra});
test('matching is deterministic and prices come only from best compatible database row',()=>{
 const rows=[row('b',{unit_price:220000}),row('a')];
 assert.equal(matchDoors(a,rows,'leaf_frame',2).estimate.total,360000);
 assert.deepEqual(matchDoors(a,rows,'leaf_frame'),matchDoors(a,[...rows].reverse(),'leaf_frame'));
});
test('reject different kind, scope, opening, leaf count, version and missing prices',()=>{
 const rows=[row('1',{analysis:{...a,kind:'fire'}}),row('2',{scope:'leaf_one'}),row('3',{analysis:{...a,opening:'sliding'}}),row('4',{analysis:{...a,leaves:2}}),row('5',{version:'old'}),row('6',{unit_price:0})];
 assert.equal(matchDoors(a,rows,'leaf_frame').estimate,null);
});
test('unclear, non-door and partial input never produce prices',()=>{
 for(const extra of [{confidence:'low'},{kind:'not_door'},{completeness:'partial'},{leaves:0},{opening:'unknown'}])assert.equal(matchDoors({...a,...extra},[row('a')],'leaf_frame').estimate,null);
});
test('unknown attributes do not gain similarity points and weak matches abstain',()=>{
 assert.equal(matchDoors({...a,surface:'unknown',glass:'unknown',frame:'unknown'},[row('a')],'leaf_frame').estimate,null);
});
test('quantity and AI output validation',()=>{
 for(const n of [0,-1,1.5,21,NaN])assert.throws(()=>matchDoors(a,[],'leaf_frame',n));
 assert.throws(()=>validate({...a,leaves:'1'}));assert.throws(()=>validate({...a,kind:'cabinet'}));assert.deepEqual(validate(a),a);
});

test('exact known image wins tied structure scores without crossing scope',()=>{
 const q={...a,image_hash:'same'};
 const rows=[row('a',{image_hash:'other'}),row('b',{image_hash:'same',unit_price:200000})];
 assert.equal(matchDoors(q,rows,'leaf_frame').estimate.unit,200000);
 assert.equal(matchDoors(q,rows,'leaf_one').estimate,null);
});
