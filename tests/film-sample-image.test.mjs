import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const { code } = await swc.transform(fs.readFileSync(new URL('../app/components/FilmSampleImage.js', import.meta.url), 'utf8'), {
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
  module: { type: 'commonjs' },
});

function harness(product, large = false) {
  let slots = [], cursor = 0, identity;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
  };
  const context = { exports: {}, React, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' } },
    require: name => name === 'react' ? React : name === 'next/image' ? 'Image' : assert.fail(name) };
  vm.createContext(context); vm.runInContext(code, context);
  return {
    url: context.exports.getFilmSampleUrl,
    render(nextProduct = product) {
      const entry = context.exports.default({ product: nextProduct, large });
      if (entry.props.key !== identity) { identity = entry.props.key; slots = []; }
      cursor = 0;
      return entry.type(entry.props);
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map(n => find(n, predicate)).find(Boolean) || null;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const product = { id: 'one', product_code: 'LW101', sample_image_path: 'film-samples/wood/LW101.jpg' };

test('storage paths encode literal hashes/spaces without double encoding, and local repairs remain local', () => {
  const { url } = harness(product);
  assert.equal(url(' film-samples/a #1.webp '), 'https://example.supabase.co/storage/v1/object/public/film-samples/a%20%231.webp');
  assert.equal(url('film-samples/a%20b.webp'), 'https://example.supabase.co/storage/v1/object/public/film-samples/a%20b.webp');
  assert.equal(url('/film-samples/APZ05.jpg'), '/film-samples/APZ05.jpg');
  assert.equal(url('https://cdn.example/a.jpg?token=abc'), 'https://cdn.example/a.jpg?token=abc');
  assert.equal(url('javascript:alert(1)'), '');
  assert.equal(url('film-samples/a.jpg', ''), '');
});

test('portrait and landscape samples remain fully visible; enlargement retains native proportions', () => {
  const h = harness(product, true);
  let tree = h.render();
  const img = find(tree, n => n.type === 'Image');
  assert.equal(img.props.style.objectFit, 'contain');
  img.props.onLoad({ currentTarget: { naturalWidth: 900, naturalHeight: 1200 } });
  tree = h.render();
  assert.equal(find(tree, n => n.props.style?.position === 'relative').props.style.aspectRatio, '900 / 1200');
  img.props.onLoad({ currentTarget: { naturalWidth: 187, naturalHeight: 107 } });
  tree = h.render();
  assert.equal(tree.props.style.maxWidth, 'min(100%, 187px)');
  assert.equal(find(tree, n => n.props.style?.position === 'relative').props.style.aspectRatio, '187 / 107');
});

test('a failed image becomes an explicit message and can be retried without changing the product', () => {
  const h = harness(product, true);
  find(h.render(), n => n.type === 'Image').props.onError();
  const failed = h.render();
  assert.equal(find(failed, n => n.type === 'Image'), null);
  assert.ok(find(failed, n => n.props.role === 'status'));
  find(failed, n => n.type === 'button').props.onClick();
  assert.equal(find(h.render(), n => n.type === 'Image').props.alt, 'LW101');
});

test('changing an image path clears a previous error; cards never contain a nested retry button', () => {
  const h = harness(product);
  find(h.render(), n => n.type === 'Image').props.onError();
  assert.equal(find(h.render(), n => n.type === 'button'), null);
  const changed = h.render({ ...product, sample_image_path: '/film-samples/fixed.jpg' });
  assert.equal(find(changed, n => n.type === 'Image').props.src, '/film-samples/fixed.jpg');
});
