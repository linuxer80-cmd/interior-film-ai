import test from 'node:test';
import assert from 'node:assert/strict';
import { koreanDay, monthDays, nextWorkDay, isUndated, shiftMonth, workerMonth } from '../app/utils/workerCalendar.js';

const site = (extra = {}) => ({ site_id: 'site-1', schedule_start: '2026-10-21T15:00:00Z', schedule_end: '2026-10-23T14:59:00Z', worker_role: 'leader', ...extra });

test('personal days preserve gaps and daily roles instead of filling the whole site period', () => {
  const item = site({ schedule_end: '2026-10-25', assigned_dates: [
    { work_date: '2026-10-22', role: 'leader' }, { work_date: '2026-10-24', role: 'member' },
  ] });
  const month = workerMonth([item], '2026-10');
  assert.equal(month.byDay.get('2026-10-22')[0].role, 'leader');
  assert.equal(month.byDay.get('2026-10-23').length, 0);
  assert.equal(month.byDay.get('2026-10-24')[0].role, 'member');
  assert.equal(month.byDay.get('2026-10-25').length, 0);
  assert.equal(month.workDays, 2);
  assert.equal(month.siteCount, 1);
  assert.equal(workerMonth([site({ assigned_dates: [] })], '2026-10').workDays, 0);
});

test('legacy ranges include both Korean dates and work across months and leap days', () => {
  const month = workerMonth([site()], '2026-10');
  assert.equal(month.workDays, 2);
  assert.equal(month.byDay.get('2026-10-22').length, 1);
  assert.equal(month.byDay.get('2026-10-23').length, 1);
  const crossing = site({ schedule_start: '2028-02-28', schedule_end: '2028-03-02' });
  assert.equal(workerMonth([crossing], '2028-02').workDays, 2);
  assert.equal(workerMonth([crossing], '2028-03').workDays, 2);
  assert.equal(workerMonth([site({ schedule_end: null })], '2026-10').workDays, 1);
});

test('multiple jobs and duplicated assignment rows count once per site per day', () => {
  const first = site({ assigned_dates: [{ work_date: '2026-10-22', role: 'member' }, { work_date: '2026-10-22', role: 'leader' }] });
  const second = site({ site_id: 'site-2', assigned_dates: [{ work_date: '2026-10-22', role: 'member' }] });
  const month = workerMonth([first, first, second], '2026-10');
  assert.equal(month.byDay.get('2026-10-22').length, 2);
  assert.equal(month.byDay.get('2026-10-22')[0].role, 'leader');
  assert.equal(month.siteCount, 2);
  assert.equal(month.workDays, 1);
});

test('month navigation and week positions are independent of server/browser timezone', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
  const february = monthDays('2028-02');
  assert.equal(february.days.length, 29);
  assert.equal(february.cells.indexOf('2028-02-01'), 2);
  assert.equal(monthDays('2026-08').cells.length, 42);
  assert.equal(koreanDay('2026-09-29T15:30:00Z'), '2026-09-30');
  assert.equal(koreanDay('2026-02-30'), null);
  assert.equal(koreanDay('invalid'), null);
});

test('undated or invalid periods stay out of calendar and are available separately', () => {
  const missing = site({ schedule_start: null, schedule_end: null });
  const reversed = site({ schedule_start: '2026-10-24', schedule_end: '2026-10-22' });
  assert.equal(isUndated(missing), true);
  assert.equal(isUndated(reversed), true);
  assert.equal(workerMonth([missing, reversed], '2026-10').workDays, 0);
  assert.equal(isUndated(site({ assigned_dates: [] })), false);
});

test('next work day skips earlier jobs, honors personal gaps and ongoing legacy periods', () => {
  const personal = site({ assigned_dates: [{ work_date: '2026-10-22', role: 'leader' }, { work_date: '2026-10-24', role: 'member' }] });
  assert.equal(nextWorkDay([personal], '2026-10-23'), '2026-10-24');
  assert.equal(nextWorkDay([site()], '2026-10-23'), '2026-10-23');
  assert.equal(nextWorkDay([site()], '2026-10-24'), null);
  assert.equal(nextWorkDay([site({ assigned_dates: [] })], '2026-10-22'), null);
});
