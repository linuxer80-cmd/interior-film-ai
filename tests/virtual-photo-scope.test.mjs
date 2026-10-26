import test from 'node:test';
import assert from 'node:assert/strict';
import {virtualPhotoScope} from '../lib/virtualPhotoScope.mjs';
const photo=targets=>({hierarchy_targets:targets});
test('standalone fridge with overhead cupboard stays fridge and includes exposed panels',()=>{
 const scope=virtualPhotoScope(photo([{part:'냉장고장',kind:'냉장고장',components:['상부장','우측 측판','주변 프레임'],notes:'배경 문과 엘리베이터는 시공하지 않음'}]));
 assert.deepEqual(scope.map(x=>x.key),['fridge_cabinet']);assert.match(scope[0].areas[0].label,/측판/);
});
test('kitchen only shows detected zones, never adds absent lower/fridge zones',()=>{
 const scope=virtualPhotoScope(photo([{part:'싱크대',kind:'일반 싱크대',components:['상부장','노출 측판']}]))[0];
 assert.deepEqual(scope.areas.map(x=>x.key),['kitchen_upper']);
});
test('combined kitchen includes fridge only when recorded in components',()=>{
 const scope=virtualPhotoScope(photo([{part:'싱크대',kind:'냉장고장 결합형 싱크대',components:['하부장','냉장고장','냉장고장 · 우측 측판']}]))[0];
 assert.deepEqual(scope.areas.map(x=>x.key),['kitchen_lower','fridge_cabinet']);
});
test('unknown/unsupported classifications do not fall back to the entire picker',()=>{
 assert.deepEqual(virtualPhotoScope(photo([{part:'문',kind:'확인 필요',components:[]}])),[]);
 assert.deepEqual(virtualPhotoScope(photo([{part:'창호',kind:'일반 창호',components:[]}])),[]);
 assert.equal(virtualPhotoScope(undefined),null);
});
test('elevator is available only for a classified elevator photo',()=>{
 assert.deepEqual(virtualPhotoScope(photo([{part:'엘리베이터',kind:'외부 출입구'}])).map(x=>x.key),['elevator_door']);
 assert.deepEqual(virtualPhotoScope(photo([{part:'붙박이장',kind:'침실 붙박이장'}])).map(x=>x.key),['built_in']);
});
