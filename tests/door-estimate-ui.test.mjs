import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as pricing from '../app/utils/doorEstimate.js';
import * as filmPricing from '../app/utils/estimatePrice.js';

const require = createRequire(import.meta.url), swc = require('next/dist/build/swc');
await swc.loadBindings();
async function compile(path, imports, globals = {}) {
  const { code } = await swc.transform(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' },
  });
  const context = { exports: {}, React, console, require: imports, ...globals };
  vm.createContext(context); vm.runInContext(code, context);
  return context.exports.default;
}
const Selector = await compile('../app/components/DoorQuantitySelector.js', (name) => name === 'react' ? React : pricing);
const Total = await compile('../app/components/EstimateTotal.js', () => React);
const groups = [190000, 195000].map((average, i) => ({ key: `door-${i}`, category: '문 및 문틀', subCategory: '방문 및 문틀', photos: [], estimate: { min: average, max: average, average } }));

test('visible selector names the two detected sets and prices requested five from one-set average', () => {
  const initial = pricing.calculateQuantityEstimate(groups);
  const first = renderToStaticMarkup(React.createElement(Selector, { summary: initial.door, quantity: initial.door.quantity }));
  assert.ok(first.includes('사진 속 문·문틀 2세트'));
  assert.ok(first.includes('192,500'));
  assert.ok(first.includes('value="2"'));
  const five = pricing.calculateQuantityEstimate(groups, 5);
  const html = renderToStaticMarkup(React.createElement(Selector, { summary: five.door, quantity: 5 }));
  assert.ok(html.includes('962,500'));
  assert.ok(!html.includes('1,925,000'));
});

test('one unpriced door is displayed as a partial estimate without falsely blaming the database', () => {
  const partial = pricing.calculateQuantityEstimate([groups[0], { ...groups[1], estimate: null, requiresConfirmation: true }]);
  const html = renderToStaticMarkup(React.createElement(Total, { totalEstimate: partial.total }));
  assert.ok(html.includes('계산된 부위의 부분 견적'));
  assert.ok(html.includes('190,000'));
  assert.ok(html.includes('아직 견적이 확정되지 않은'));
  assert.ok(html.includes('위 금액에 포함되지 않았습니다'));
  assert.ok(!html.includes('데이터가 부족'));
  assert.ok(!html.includes('총 예상 시공 견적'));
});

test('actual customer page uses total set count once in result, film preview and consultation', async () => {
  const state = [], components = new Map(), submissions = [];
  let cursor = 0;
  const component = (name) => { if (!components.has(name)) components.set(name, () => null); return components.get(name); };
  const hooks = { ...React,
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = initial === 'home' ? 'result' : initial;
      return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
    useEffect() {},
  };
  const Page = await compile('../app/components/CustomerEstimatePage.js', (name) => {
    if (name === 'react') return hooks;
    if (name.includes('doorEstimate')) return pricing;
    if (name.includes('estimatePrice')) return filmPricing;
    if (name.includes('useEstimate')) return () => ({ groups, images: [], resultReady: true, storageStatus: '', usageIdRef: { current: null }, ensureEstimatePhotos: async () => ['customer/test.jpg'], readJsonSafely: (response) => response.json() });
    if (name.includes('supabase')) return { supabase: {} };
    if (name.endsWith('.css')) return {};
    return component(name);
  }, { fetch: async (url, options) => { assert.equal(url, '/api/lead'); submissions.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ success: true }) }; } });
  const render = () => { cursor = 0; return Page({ companySlug: null }); };
  function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return null;
    if (Array.isArray(tree)) return tree.map((item) => find(item, predicate)).find(Boolean);
    if (predicate(tree)) return tree;
    return find(tree.props?.children, predicate);
  }
  const byType = (tree, name) => find(tree, (node) => node.type === components.get(name));
  let tree = render();
  let selector = byType(tree, './DoorQuantitySelector');
  assert.equal(selector.props.quantity, 2);
  assert.equal(byType(tree, './EstimateTotal').props.totalEstimate.average, 385000);
  selector.props.onChange(5);
  tree = render();
  assert.equal(byType(tree, './EstimateTotal').props.totalEstimate.average, 962500);
  const virtual = find(tree, (node) => node.type === 'button' && String(node.props.children).includes('가상시공 해보기'));
  virtual.props.onClick();
  tree = render();
  await byType(tree, '../FilmColorPicker').props.onSelect({ product_code: 'test', non_fire_price_per_meter: 11000 });
  tree = render();
  assert.equal(byType(tree, './FilmAdjustedEstimate').props.baseEstimate.average, 962500);
  assert.equal(byType(tree, './FilmAdjustedEstimate').props.adjustedEstimate.average, 962500);
  const consult = find(tree, (node) => node.type === 'button' && String(node.props.children).includes('상담'));
  consult.props.onClick();
  tree = render();
  const form = byType(tree, './LeadForm');
  form.props.onCustomerNameChange('테스트');
  form.props.onPhoneChange('01000000000');
  form.props.onRegionChange('인천');
  form.props.onPrivacyAgreeChange(true);
  tree = render();
  await byType(tree, './LeadForm').props.onSubmit();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].estimate_average, 962500);
  assert.equal(submissions[0].estimate_details[0].quantity, 5);
  assert.equal(submissions[0].estimate_details[0].unit_average, 192500);
  assert.ok(submissions[0].memo.includes('요청 총 5세트'));
  assert.ok(submissions[0].memo.includes('문·문틀 합계 962,500원'));

});
