import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as groups from '../app/utils/quickRegisterGroups.js';
import * as categories from '../app/utils/quickRegisterCategories.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const { code } = await swc.transform(fs.readFileSync(new URL('../app/admin/QuickRegisterTab.js', import.meta.url), 'utf8'), {
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' },
});
const photo = (id, extra = {}) => ({ id, name: `${id}.jpg`, objectId: id, site: '1', category: '붙박이장', subCategory: '도어', type: 'after', confidence: 'high', groupingReview: false, file: new File([id], `${id}.jpg`, { type: 'image/jpeg' }), imageHash: `hash-${id}`, url: `blob:${id}`, tags: [], ...extra });
function harness(initialPhotos = [], initialPrices = {}, options = {}) {
  const slots = [initialPhotos, initialPrices];
  let index = 0, effects = [], tree;
  const calls = { items: [], photos: [], uploads: [], cleanup: [], focus: [], scroll: [], prepared: [] };
  const control = { failUpload: '', failCleanup: false };
  let unique = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo: fn => fn(),
    useEffect: fn => effects.push(fn),
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) },
    from: table => ({
      insert(value) {
        if (table === 'work_items') { calls.items.push(value); return { select: () => ({ single: async () => ({ data: { id: `item-${calls.items.length}` } }) }) }; }
        calls.photos.push(value); return Promise.resolve({});
      },
      delete: () => ({ eq: async (...where) => { calls.cleanup.push([table, ...where]); return { error: control.failCleanup ? new Error('rollback failed') : null }; } }),
    }),
    storage: { from: () => ({
      upload: async (path, file) => { calls.uploads.push(file.name); return { error: control.failUpload === file.name ? new Error('upload failed') : null }; },
      remove: async paths => { calls.cleanup.push(['storage', ...paths]); return {}; },
    }) },
  };
  const modules = {
    react: React, './AdminUi.module.css': new Proxy({}, { get: (_, key) => String(key) }),
    '../utils/quickRegisterCategories': categories, '../utils/quickRegisterGroups': groups,
    './quickRegisterFiles': { prepareBulkPhoto: async file => { calls.prepared.push(file.name); return options.prepare ? options.prepare(file) : { file, name: file.name, imageHash: 'prepared-hash', fileError: '' }; } },
    '../../lib/supabase': { supabase: client }, './adminConstants': { PROJECT_ID: 'project' },
    './aiUtils': { createEmbedding: async () => null }, './adminStyles': { inputStyle: {}, primaryButtonStyle: {}, sectionStyle: {} },
  };
  const context = {
    exports: {}, require: name => { assert.ok(modules[name], `unexpected module ${name}`); return modules[name]; }, React,
    crypto: { randomUUID: () => `unique-${++unique}` }, console,
    URL: { createObjectURL: () => `blob:new-${++unique}`, revokeObjectURL: () => {} },
    FormData: class { append() {} },
    fetch: async () => ({ ok: true, json: async () => ({ photos: options.results || [] }) }),
  };
  vm.createContext(context); vm.runInContext(code, context);
  const visit = (node, fn) => { if (Array.isArray(node)) return node.forEach(n => visit(n, fn)); if (!node || typeof node !== 'object') return; fn(node); visit(node.props?.children, fn); };
  function render() {
    index = 0; effects = [];
    tree = context.exports.default({ companyId: 'company', loadJobs: async () => {} });
    function mount(node, parent = null) {
      if (Array.isArray(node)) return node.forEach(n => mount(n, parent));
      if (!node || typeof node !== 'object') return;
      const element = { tagName: String(node.type).toUpperCase(), open: Boolean(node.props.open), parentElement: parent,
        focus: () => calls.focus.push(node), scrollIntoView: () => calls.scroll.push(node) };
      node.props.ref?.(element);
      mount(node.props.children, element);
    }
    mount(tree); effects.forEach(fn => fn());
    return tree;
  }
  function all(predicate) { const nodes = []; visit(tree, n => { if (predicate(n)) nodes.push(n); }); return nodes; }
  function button(label) { return all(n => n.type === 'button' && n.props.children.flat(Infinity).includes(label))[0]; }
  return { calls, control, render, all, button, get photos() { return slots[0]; }, get prices() { return slots[1]; }, get message() { return slots[4]; } };
}

test('save moves to the missing amount, then the unassigned before/after field without losing amounts', async () => {
  const first = photo('a', { type: 'unknown' });
  const h = harness([first]); h.render();
  await h.button('입력한 시공 데이터 일괄 등록').props.onClick(); h.render();
  const invalidPrice = h.all(n => n.type === 'input' && n.props['aria-invalid'])[0];
  assert.equal(invalidPrice.props['aria-label'], '현장 1 묶음 1 실제금액');
  assert.equal(h.calls.focus.at(-1), invalidPrice);
  invalidPrice.props.onChange({ target: { value: '380000' } }); h.render();
  await h.button('입력한 시공 데이터 일괄 등록').props.onClick(); h.render();
  const invalidType = h.all(n => n.type === 'select' && n.props['aria-invalid'])[0];
  assert.ok(invalidType);
  assert.equal(h.calls.focus.at(-1), invalidType);
  assert.equal(h.all(n => n.type === 'details')[0].props.open, true);
  assert.equal(h.prices[groups.bulkGroupKey(first)], '380000');
  assert.equal(h.calls.items.length, 0);
  invalidType.props.onChange({ target: { value: 'before' } }); h.render();
  await h.button('입력한 시공 데이터 일괄 등록').props.onClick(); h.render();
  assert.equal(h.calls.items.length, 1);
  assert.equal(h.calls.items[0].actual_cost, 380000);
  assert.equal(h.calls.photos[0].photo_type, 'before');
  assert.equal(h.photos.length, 0);
});

test('partial storage failure keeps failed group and amount; retry never resaves completed photos', async () => {
  const photos = [photo('a1', { objectId: 'same' }), photo('a2', { objectId: 'same' }), photo('b')];
  const priceA = groups.bulkGroupKey(photos[0]), priceB = groups.bulkGroupKey(photos[2]);
  const h = harness(photos, { [priceA]: '300000', [priceB]: '400000' });
  h.control.failUpload = 'b.jpg'; h.render();
  await h.button('입력한 시공 데이터 일괄 등록').props.onClick(); h.render();
  assert.deepEqual(Array.from(h.photos, p => p.id), ['b']);
  assert.equal(h.prices[priceB], '400000');
  assert.equal(h.prices[priceA], undefined);
  assert.match(h.message, /b.jpg/);
  assert.match(h.message, /저장된 2장/);
  assert.equal(h.calls.items[0].actual_cost, 300000);
  assert.equal(h.calls.photos[0].work_item_id, h.calls.photos[1].work_item_id);
  assert.ok(h.calls.cleanup.some(row => row[0] === 'work_items' && row[2] === 'item-2'));
  assert.equal(h.all(n => n.type === 'input' && n.props['aria-invalid'])[0].props.type, 'file');
  h.control.failUpload = '';
  await h.button('입력한 시공 데이터 일괄 등록').props.onClick(); h.render();
  assert.deepEqual(h.calls.uploads, ['a1.jpg', 'a2.jpg', 'b.jpg', 'b.jpg']);
  assert.equal(h.calls.items[2].actual_cost, 400000);
  assert.equal(h.photos.length, 0);
});

test('picker is cleared only after preparation, and file reselection preserves edits and amount', async () => {
  const original = photo('mobile', { type: 'before' });
  const key = groups.bulkGroupKey(original);
  const input = { files: [new File(['replacement'], 'mobile-again.jpg', { type: 'image/jpeg' })], value: 'selected' };
  const h = harness([original], { [key]: '280000' }, { prepare: async file => {
    assert.equal(input.value, 'selected');
    return { file, name: file.name, imageHash: 'new-hash', fileError: '' };
  } }); h.render();
  const reselect = h.all(n => n.type === 'input' && n.props.type === 'file' && !n.props.multiple)[0];
  await reselect.props.onChange({ target: input }); h.render();
  assert.equal(input.value, '');
  assert.equal(h.photos[0].type, 'before');
  assert.equal(h.photos[0].objectId, original.objectId);
  assert.equal(h.prices[key], '280000');
  assert.equal(h.photos[0].imageHash, 'new-hash');
  await h.button('입력한 시공 데이터 일괄 등록').props.onClick(); h.render();
  assert.deepEqual(h.calls.prepared, ['mobile-again.jpg']);
  assert.deepEqual(h.calls.uploads, ['mobile-again.jpg']);
});

test('a rollback failure blocks another save instead of duplicating a partially written group', async () => {
  const p = photo('failed');
  const h = harness([p], { [groups.bulkGroupKey(p)]: '300000' });
  h.control.failUpload = 'failed.jpg'; h.control.failCleanup = true; h.render();
  await h.button('입력한 시공 데이터 일괄 등록').props.onClick(); h.render();
  assert.equal(h.all(n => n.type === 'fieldset')[0].props.disabled, true);
  const count = h.calls.items.length;
  await h.button('입력한 시공 데이터 일괄 등록').props.onClick();
  assert.equal(h.calls.items.length, count);
  assert.match(h.message, /중복 저장/);
});
