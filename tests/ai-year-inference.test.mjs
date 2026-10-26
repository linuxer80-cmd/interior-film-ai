import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewAiSchedule, inferUpcomingYear} from '../lib/aiScheduleDate.mjs';
test('omitted year uses this year or next occurrence rather than model-invented year',()=>{
 for(const [value,base,expected] of [['2023-11-11','2026-10-26','2026-11-11'],['2023-01-11','2026-11-01','2027-01-11'],['2023-11-01','2026-11-01','2026-11-01'],['2023-12-31','2026-01-01','2026-12-31']]) {
  assert.equal(inferUpcomingYear(value,base),expected);
  assert.deepEqual(reviewAiSchedule({work_dates:[value],inferred_year_dates:[value]},base).work_dates,[expected]);
 }
});
test('explicit past year remains excluded and explicit future year is preserved',()=>{
 assert.deepEqual(reviewAiSchedule({work_dates:['2023-11-11']},'2026-10-26').work_dates,[]);
 assert.deepEqual(reviewAiSchedule({work_dates:['2028-01-11']},'2026-11-01').work_dates,['2028-01-11']);
});
test('call date and times survive inferred rollover; invalid calendar dates do not',()=>{
 const result=reviewAiSchedule({date:'2023-01-11',start_time:'09:00',inferred_year_dates:['2023-01-11']},'2026-11-01');
 assert.equal(result.date,'2027-01-11');assert.equal(result.start_time,'09:00');
 assert.deepEqual(reviewAiSchedule({work_dates:['2024-02-29'],inferred_year_dates:['2024-02-29']},'2026-01-01').work_dates,[]);
});
