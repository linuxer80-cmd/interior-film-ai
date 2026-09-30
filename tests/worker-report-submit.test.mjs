import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const { code } = await swc.transform(fs.readFileSync(new URL('../app/worker/site/[siteId]/WorkerWorkReport.js', import.meta.url), 'utf8'), {
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' },
});
function findAll(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)];
}
function form({ failUploadOnce = false, failSaveOnce = false } = {}) {
  let cursor = 0, slots = [], uploads = 0, submits = 0, completed = 0;
  const calls = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useEffect() {}, useMemo(fn) { return fn(); },
  };
  class FormData { fields = {}; append(k, v) { this.fields[k] = v; } }
  const ctx = vm.createContext({ exports: {}, React, FormData, console: { error() {} },
    URL: { createObjectURL: (f) => f.name, revokeObjectURL() {} },
    require: (path) => path === 'react' ? React : { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } } },
    fetch: async (url, options) => {
      const upload = url.endsWith('site-photos');
      calls.push(upload ? `photo:${options.body.fields.photoType}:${options.body.fields.photos.name}` : 'report');
      const failed = upload ? (++uploads === 2 && failUploadOnce) : (++submits === 1 && failSaveOnce);
      return { ok: !failed, json: async () => failed ? { success: false, error: '저장 실패' } : { success: true, count: 1 } };
    },
  });
  vm.runInContext(code, ctx);
  const render = () => { cursor = 0; return ctx.exports.default({ siteId: 'site', site: {}, onSubmitted: () => { completed++; } }); };
  let tree = render();
  findAll(tree, (n) => n.type === 'textarea' && n.props.placeholder?.startsWith('예: 싱크대'))[0].props.onChange({ target: { value: '작업 완료' } });
  const files = findAll(tree, (n) => n.props.type === 'file');
  files[0].props.onChange({ target: { files: [{ name: 'before.jpg' }] } });
  files[1].props.onChange({ target: { files: [{ name: 'after1.jpg' }, { name: 'after2.jpg' }] } });
  return { calls, render, submit: () => render().props.onSubmit({ preventDefault() {} }), completed: () => completed };
}
test('all before/after photos precede submission; rapid double tap submits once', async () => {
  const h = form();
  await Promise.all([h.submit(), h.submit()]);
  assert.deepEqual(h.calls, ['photo:before:before.jpg', 'photo:after:after1.jpg', 'photo:after:after2.jpg', 'report']);
  assert.equal(h.completed(), 1);
});
test('photo failure leaves report unsubmitted; retry skips files already uploaded', async () => {
  const h = form({ failUploadOnce: true });
  await h.submit();
  assert.equal(h.calls.includes('report'), false);
  assert.equal(h.completed(), 0);
  await h.submit();
  assert.deepEqual(h.calls, ['photo:before:before.jpg', 'photo:after:after1.jpg', 'photo:after:after1.jpg', 'photo:after:after2.jpg', 'report']);
  assert.equal(h.completed(), 1);
});
test('cost/report failure can be retried without duplicating uploaded photos', async () => {
  const h = form({ failSaveOnce: true });
  await h.submit();
  assert.equal(h.completed(), 0);
  await h.submit();
  assert.deepEqual(h.calls, ['photo:before:before.jpg', 'photo:after:after1.jpg', 'photo:after:after2.jpg', 'report', 'report']);
  assert.equal(h.completed(), 1);
});
