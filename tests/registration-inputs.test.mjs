import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRegistrationMaterials, registrationCustomerFields, registrationAmountValues, normalizeRegistrationDraft, registrationMaterialTypeError } from '../lib/registrationInputs.mjs';

const extracted = { brand: '현대보닥', product_code: 'S263', product_name: '솔리드', unit: 'm', memo: '방문' };

test('generic trade names become consultation notes without inventing a fire type or losing details',()=>{
 const draft={memo:'기존 상담 메모',materials:[{brand:'현대',product_name:' 인테리어 필름 ',memo:'방문 후 샘플 결정',quantity:'20',unit:'m'},{product_name:'자재 미정'}]};
 const result=normalizeRegistrationDraft(draft);assert.equal(result.materials.length,0);assert.match(result.memo,/기존 상담 메모/);assert.match(result.memo,/현대.*인테리어 필름.*20m.*방문 후 샘플 결정/);assert.match(result.memo,/자재 미정/);
 assert.equal(draft.materials.length,2);assert.deepEqual(normalizeRegistrationDraft(result),result);
 assert.equal(normalizeRegistrationDraft({...draft,memo:result.memo}).memo,result.memo);
 assert.equal(registrationMaterialTypeError(result.materials),'');
});

test('coded, catalog-selected and specifically named products retain mandatory fire choices',()=>{
 const materials=[{product_code:'S245',product_name:'인테리어필름'},{film_product_id:'catalog',product_name:'필름'},{product_name:'오크 무늬목'},{product_name:'제품명 미정이 아닌 실제 제품'}];
 assert.deepEqual(normalizeRegistrationDraft({materials}).materials,materials);
 assert.match(registrationMaterialTypeError(materials),/S245/);
 assert.equal(registrationMaterialTypeError(materials.map(row=>({...row,price_type:'non_fire'}))),'');
 assert.match(registrationMaterialTypeError([{...materials[0],price_type:'unspecified'}]),/방염/);
});

test('reapplying an extraction does not duplicate material or discard confirmed type and price', () => {
  const saved = { ...extracted, local_id: 'existing', film_product_id: 'catalog', price_type: 'non_fire', unit_price: '5800' };
  const rows = mergeRegistrationMaterials([saved], [{ ...extracted, local_id: 'new', product_code: ' s263 ', price_type: '', unit_price: '' }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0], saved);
  assert.deepEqual(mergeRegistrationMaterials(rows, [extracted]), rows);
});

test('duplicates within one analysis are collapsed while different notes and fire variants remain', () => {
  const rows = mergeRegistrationMaterials([], [extracted, {...extracted}, {...extracted,memo:'싱크대'}, {...extracted,price_type:'fire'}, {product_code:'',product_name:''}]);
  assert.equal(rows.length, 3);
  const variants = mergeRegistrationMaterials([{...extracted,price_type:'non_fire'}], [{...extracted,price_type:'fire'}]);
  assert.equal(variants.length, 2);
  assert.equal(variants[1].price_type, 'fire');
});

test('switching customer type without choosing a client preserves entered customer data', () => {
  const form = { customer_name:'직접 입력한 고객',customer_phone:'01012345678',address:'현장 주소' };
  for (const type of ['business','personal']) {
    assert.equal(registrationCustomerFields(form,{type,clientId:'',name:'',phone:''}), form);
  }
});

test('selecting a business uses its contact and does not carry a previous phone into a client without one', () => {
  const form = { customer_name:'기존 고객',customer_phone:'01012345678',address:'현장 주소' };
  assert.deepEqual(registrationCustomerFields(form,{type:'business',clientId:'client',name:'새 업체',phone:'0212345678'}), {...form,customer_name:'새 업체',customer_phone:'0212345678'});
  assert.equal(registrationCustomerFields(form,{type:'business',clientId:'client',name:'새 업체',phone:''}).customer_phone,'');
});

 test('explicit extracted contract and deposit amounts are retained, without guessing ambiguous or invalid values',()=>{
 assert.deepEqual(registrationAmountValues({contract_amount:'1500000',deposit_amount:0}),{contract_amount:'1500000',deposit_amount:'0'});
 for(const value of [null,undefined,'','미정','150만원',-1,NaN,1.5,{},Infinity])assert.deepEqual(registrationAmountValues({contract_amount:value}),{});
 });
