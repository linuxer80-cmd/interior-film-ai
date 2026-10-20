import test from 'node:test';
import assert from 'node:assert/strict';
import {costBrandLabel,groupCostRows} from '../lib/costBrandGroups.mjs';
test('Hyundai and Younglim display aliases share canonical labels',()=>{
 for(const value of ['현대','현대 & C','현대L&C','현대보닥',' HYUNDAI '])assert.equal(costBrandLabel(value),'현대보닥');
 for(const value of ['영림','영림 인테리어필름','영림인테리어필름'])assert.equal(costBrandLabel(value),'영림');
 assert.equal(costBrandLabel('LX'),'LX');assert.equal(costBrandLabel('예림'),'예림');
});
test('merging screenshot aliases preserves every row and the grand total',()=>{
 const rows=[{brand:'영림',amount:1823800},{brand:'Lx',amount:767400},{brand:'현대',amount:749410},{brand:'현대보닥',amount:397980},{brand:'영림 인테리어필름',amount:72800},{brand:'현대&C',amount:0}];
 const before=JSON.stringify(rows),groups=groupCostRows(rows,'brand');
 assert.equal(groups.length,3);assert.equal(groups.find(g=>g.label==='영림').amount,1896600);assert.equal(groups.find(g=>g.label==='현대보닥').amount,1147390);
 assert.equal(groups.reduce((n,g)=>n+g.amount,0),3811390);assert.equal(groups.flatMap(g=>g.rows).length,6);assert.equal(JSON.stringify(rows),before);
});
test('non-brand grouping is preserved and unusual labels are safe',()=>{
 const row={product:'현대',amount:30};assert.equal(groupCostRows([row],'product')[0].label,'현대');
 assert.equal(groupCostRows([{brand:'__proto__',amount:10}], 'brand')[0].amount,10);
 assert.equal(costBrandLabel(null),'미분류');
});
