import test from 'node:test';
import assert from 'node:assert/strict';
import { createFilmStockReader } from '../lib/filmStockReader.mjs';

test('focus and visibility events share one request, product switches stay scoped, manual refresh is fresh', async () => {
  const calls = [];
  const reader = createFilmStockReader(async path => { calls.push(path); return { count: calls.length }; });
  const [a, b] = await Promise.all([reader.read('site', 'first'), reader.read('site', 'first')]);
  assert.equal(calls.length, 1);
  assert.equal(a, b);
  assert.equal((await reader.read('site', 'first')).count, 1);
  await reader.read('site', 'second');
  assert.match(calls[1], /materialId=second$/);
  assert.equal((await reader.read('site', 'first', { force: true })).count, 3);
  reader.clear();
  assert.equal((await reader.read('site', 'first')).count, 4);
});

test('stalled login or network releases the spinner, aborts the fetch and allows a retry', async () => {
  let signal, calls = 0;
  const reader = createFilmStockReader((_path, _body, options) => {
    signal = options.signal;
    return ++calls === 1 ? new Promise(() => {}) : Promise.resolve({ rolls: [] });
  }, { timeoutMs: 15 });
  await assert.rejects(reader.read('site', 'm'), /조회가 지연/);
  assert.equal(signal.aborted, true);
  assert.deepEqual(await reader.read('site', 'm'), { rolls: [] });
});

test('failed reads are not cached, unmount or writes cancel old reads and late responses cannot replace fresh data', async () => {
  let finish, calls = 0;
  const reader = createFilmStockReader(async () => {
    calls++;
    if (calls === 1) throw Error('접근 권한');
    if (calls === 2) return new Promise(resolve => { finish = resolve; });
    return { revision: 3 };
  });
  await assert.rejects(reader.read('site'), /접근 권한/);
  const old = reader.read('site');
  const rejected = assert.rejects(old);
  await Promise.resolve();
  reader.clear();
  await rejected;
  assert.deepEqual(await reader.read('site'), { revision: 3 });
  finish({ revision: 1 });
  await Promise.resolve();
  assert.deepEqual(await reader.read('site'), { revision: 3 });
});
