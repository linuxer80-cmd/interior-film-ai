import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteDrafts, assignmentSignature } from '../lib/siteDrafts.mjs';

test('navigation reads the latest form state, not a stale registration snapshot', () => {
  const drafts = createSiteDrafts();
  let current = {label:'기본정보', dirty:false, pending:false};
  drafts.register('basic', () => current);
  assert.equal(drafts.snapshot()[0].dirty, false);
  current = {...current, dirty:true};
  assert.equal(drafts.snapshot()[0].dirty, true);
  current = {...current, dirty:false};
  assert.equal(drafts.snapshot()[0].dirty, false);
});
test('continue editing does not mutate any draft; explicit discard restores only selected scopes', () => {
  const drafts = createSiteDrafts();
  const changed = {basic:true, link:true, assignment:true};
  for (const id of Object.keys(changed)) drafts.register(id, () => ({dirty:changed[id], discard:() => {changed[id]=false;}}));
  const request = drafts.snapshot(['basic']);
  assert.deepEqual(changed, {basic:true, link:true, assignment:true});
  assert.equal(drafts.discard(request), true);
  assert.deepEqual(changed, {basic:false, link:true, assignment:true});
});
test('saving or an unresolved transaction blocks discard, including a save begun after the prompt opened', () => {
  const drafts = createSiteDrafts();
  let pending = false, discarded = false;
  drafts.register('link', () => ({dirty:true, pending, discard:() => {discarded=true;}}));
  const entries = drafts.snapshot();
  pending = true;
  assert.equal(drafts.discard(entries), false);
  assert.equal(discarded, false);
  pending = false;
  assert.equal(drafts.discard(entries), true);
  assert.equal(discarded, true);
});
test('unmounted forms are removed and can be replaced when switching sites', () => {
  const drafts = createSiteDrafts();
  drafts.register('basic', () => ({dirty:true}));
  drafts.register('basic', null);
  assert.deepEqual(drafts.snapshot(), []);
  drafts.register('basic', () => ({dirty:false}));
  assert.equal(drafts.snapshot()[0].dirty, false);
});
test('assignment comparison ignores member ordering and detects reversions, leaders and copied days', () => {
  const initial = {'2026-10-21':{leaderId:'a',memberIds:['c','b']}};
  const reordered = {'2026-10-21':{leaderId:'a',memberIds:['b','c','b']}};
  assert.equal(assignmentSignature(initial), assignmentSignature(reordered));
  assert.notEqual(assignmentSignature(initial), assignmentSignature({'2026-10-21':{leaderId:'b',memberIds:['c']}}));
  assert.notEqual(assignmentSignature(initial), assignmentSignature({...initial,'2026-10-22':initial['2026-10-21']}));
  assert.equal(assignmentSignature(initial), assignmentSignature(structuredClone(initial)));
});
