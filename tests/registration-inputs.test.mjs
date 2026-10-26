import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRegistrationMaterials, registrationCustomerFields } from '../lib/registrationInputs.mjs';

const extracted = { brand: '현대보닥', product_code: 'S263', product_name: '솔리드', unit: 'm', memo: '방문' };

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
