import test from 'node:test';
import assert from 'node:assert/strict';
import { siteNextActions } from '../lib/siteNextActions.mjs';
const today = '2026-10-21';
const base = () => ({ site: { status: 'scheduled' }, today,
  schedule: { dates: [today, '2026-10-23'], hasDailySchedule: true, assignments: [
    {work_date: today, role: 'leader', worker_id: 'w'},
    {work_date: '2026-10-23', role: 'leader', worker_id: 'w'},
  ] }, material: {status: 'recorded'}, report: {hasReport: false} });
const ids = value => siteNextActions(value).map(a => a.id);
test('missing data is unknown, never misrepresented as unassigned or unregistered', () => {
  assert.deepEqual(ids({site: {status: 'scheduled'}, today}), []);
  assert.deepEqual(ids({...base(), schedule: undefined, material: undefined}), []);
});
test('missing dates take priority and no assignment/material task is invented', () => {
  assert.deepEqual(ids({...base(), schedule: {dates: [], assignments: []}}), ['date']);
});
test('daily gaps are not work days, but each real upcoming day needs a leader', () => {
  assert.deepEqual(ids(base()), ['today']);
  const value = base(); value.schedule.assignments.pop();
  const result = siteNextActions(value);
  assert.equal(result[0].id, 'assignment');
  assert.match(result[0].message, /10\/23/);
});
test('legacy crews apply to every date only when daily schedule is absent', () => {
  const value = {...base(), schedule: {dates: [today], hasDailySchedule: false, assignments: [{role: 'leader', worker_id: 'w'}]}};
  assert.deepEqual(ids(value), ['today']);
  value.schedule.hasDailySchedule = true;
  assert.deepEqual(ids(value), ['assignment', 'today']);
});
test('completed preparation disappears; missing and partial issues remain actionable', () => {
  for (const status of ['unregistered', 'none', 'partial']) assert.ok(ids({...base(), material: {status}}).includes('material'));
  assert.ok(!ids(base()).includes('material'));
});
test('submitted reports replace assignment/material requests, even after manual completion', () => {
  for (const site of [{status:'completed'}, {status:'scheduled'}]) {
    const value = {...base(), site, report: {hasReport:true, report:{review_status:'pending'}}};
    assert.deepEqual(ids(value), ['review']);
    value.report.review = {status:'rejected'};
    assert.deepEqual(ids(value), ['revision']);
  }
});
test('approved reports require actual payment state; settled work has no repeated task', () => {
  const value = {...base(), report:{hasReport:true, review:{status:'approved'}}};
  assert.deepEqual(ids(value), []);
  value.payment = {site:{confirmed:false, outstanding:null}};
  assert.deepEqual(ids(value), ['confirm-payment']);
  value.payment = {site:{confirmed:true, outstanding:null}};
  assert.deepEqual(ids(value), ['confirm-payment']);
  value.payment = {site:{confirmed:true, outstanding:'300000', due_date:'2026-10-20'}};
  assert.deepEqual(ids(value), ['payment']);
  assert.match(siteNextActions(value)[0].message, /300,000/);
  assert.match(siteNextActions(value)[0].message, /지났습니다/);
  for (const outstanding of [0, '0', -100]) {
    value.payment.site.outstanding = outstanding;
    assert.deepEqual(ids(value), []);
  }
});
test('cancelled sites never generate tasks; completed or past work asks for a missing report', () => {
  assert.deepEqual(ids({...base(), site:{status:'cancelled'}}), []);
  assert.deepEqual(ids({...base(), site:{status:'completed'}}), ['report']);
  assert.deepEqual(ids({...base(), schedule:{dates:['2026-10-20'], assignments:[]}}), ['report']);
});
test('own work shortcut only appears on an actual assigned day', () => {
  const value = {...base(), myWorkerIds:['w']};
  assert.equal(siteNextActions(value).find(a => a.id === 'today').menu, 'work');
  value.myWorkerIds = ['other'];
  assert.equal(siteNextActions(value).find(a => a.id === 'today').menu, 'chat');
  value.today = '2026-10-22';
  assert.ok(!ids(value).includes('today'));
});
