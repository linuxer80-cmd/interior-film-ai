import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url), swc = require('next/dist/build/swc');
await swc.loadBindings();
const { code } = await swc.transform(fs.readFileSync(new URL('../app/components/EstimateResult.js', import.meta.url), 'utf8'), {
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' },
});
const context = { React, exports: {}, require: name => { assert.equal(name, 'react'); return React; } };
vm.createContext(context); vm.runInContext(code, context);
const render = (group) => renderToStaticMarkup(React.createElement(context.exports.default, { imageCount: 1, onEditPhotos() {}, groups: [{ key: 'a', category: '싱크대', subCategory: '하부장', photos: [], ...group }] }));

test('customer result shows visual reasons, not a description score or an unverified price', () => {
  const html = render({ similarItems: [
    { actual_cost: 9999999, similarity: 1, visual_verified: false },
    { actual_cost: 400000, similarity: .72, visual_verified: true, visual_rank: 1, match_reason: '하부장 범위와 문 수가 유사합니다.', differences: ['색상 차이'], beforeStatus: 'missing', afterStatus: 'missing' },
  ] });
  assert.ok(html.includes('400,000'));
  assert.ok(!html.includes('9,999,999'));
  assert.ok(html.includes('하부장 범위와 문 수가 유사합니다.'));
  assert.ok(html.includes('차이점: 색상 차이'));
  assert.ok(!html.includes('유사도'));
});

test('history-only verified case is visibly marked as unknown before/after', () => {
  const html = render({ similarItems: [{ actual_cost: 180000, visual_verified: true, visual_rank: 1, reference_path: 'history/a.jpg', referenceUrl: 'https://example.test/a.jpg', referenceStatus: 'ready', before_path: null, after_path: null }] });
  assert.ok(html.includes('참고사진 · 전후 미확인'));
  assert.ok(!html.includes('alt="시공 후"'));
  assert.ok(!html.includes('alt="시공 전"'));
});

test('failed visual comparison explains the failure and does not render an average estimate', () => {
  const html = render({ estimate: null, similarItems: [], searchMessage: '사진 비교를 완료하지 못해 금액을 계산하지 않았습니다.' });
  assert.ok(html.includes('사진 비교를 완료하지 못해 금액을 계산하지 않았습니다.'));
  assert.ok(!html.includes('비교 사례 평균 금액'));
});

test('blocked classification shows a scope correction action and never falsely claims a failed case search', () => {
  const html = render({ requiresConfirmation: true, confirmationReasons: ['unknown_scope'], estimate: null });
  assert.ok(html.includes('상부장만, 하부장만, 상부장+하부장'));
  assert.ok(html.includes('시공 부위·사진 확인하기'));
  assert.ok(!html.includes('사례가 부족합니다'));
  assert.ok(!html.includes('비교 사례 평균 금액'));
});

test('a completed search with no candidates still displays its actual shortage message', () => {
  const html = render({ requiresConfirmation: false, estimate: null, searchStatus: 'no_candidates' });
  assert.ok(html.includes('사례가 부족합니다'));
  assert.ok(!html.includes('시공 부위·사진 확인하기'));
});
