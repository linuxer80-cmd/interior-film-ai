import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCalendarTeams } from '../lib/calendarTeam.mjs';
import { siteCalendarSummary, enrichCalendarSites, sameCalendarContent } from '../lib/googleCalendar.mjs';

const from='2026-11-09',to='2026-11-10';
function database(failure='') {
  const tables={
    site_daily_assignments:[
      {id:'1',site_id:'s',company_id:'c',work_date:from,worker_id:'w1',role:'leader'},
      {id:'2',site_id:'s',company_id:'c',work_date:from,worker_id:'w2',role:'member'},
      {id:'3',site_id:'s',company_id:'c',work_date:to,worker_id:'w3',role:'member'},
      {id:'4',site_id:'s',company_id:'other',work_date:from,worker_id:'w4',role:'member'},
    ],
    site_workers:[
      {id:'5',site_id:'s',company_id:'c',worker_id:'w3',role:'member'},
      {id:'6',site_id:'legacy',company_id:'c',worker_id:'w2',role:'member'},
      {id:'7',site_id:'empty',company_id:'c',worker_id:'w1',role:'leader'},
    ],
    workers:[
      {id:'w1',company_id:'c',name:'김팀장'}, {id:'w2',company_id:'c',name:'박팀원'},
      {id:'w3',company_id:'c',name:'이다른날'}, {id:'w4',company_id:'other',name:'다른업체'},
    ],
  };
  return {from(table){const filters=[];const q={
    select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},
    in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(){return q},
    async range(a,b){return table===failure ? {error:Error('read failed')} :
      {data:(tables[table]||[]).filter(r=>filters.every(f=>f(r))).slice(a,b+1)}},
  };return q;}};
}
test('worker receives only team members from their assigned days and same company',async()=>{
  const site={site_id:'s',work_dates:[from],assigned_dates:[{work_date:from}]};
  const teams=await loadCalendarTeams(database(),'c',[site]);
  assert.deepEqual(teams.get('s').map(x=>x.name),['김팀장','박팀원']);
});
test('daily assignments override stale legacy rows; legacy sites remain supported',async()=>{
  const sites=[{site_id:'s',work_dates:[from,to]},{site_id:'legacy',work_dates:null},{site_id:'empty',work_dates:[]}];
  const teams=await loadCalendarTeams(database(),'c',sites);
  assert.deepEqual(teams.get('legacy').map(x=>x.name),['박팀원']);
  assert.deepEqual(teams.get('empty'),[]);
  const summary=day=>siteCalendarSummary({...sites[0],calendar_team:teams.get('s')},day,'https://app.test');
  assert.match(summary(from),/김팀장 \(팀장\)/);assert.match(summary(from),/박팀원/);
  assert.doesNotMatch(summary(from),/이다른날/);assert.match(summary(to),/이다른날/);
  assert.doesNotMatch(summary(to),/김팀장/);
  assert.equal(sameCalendarContent({description:summary(from)},{description:summary(to)}),false);
});
test('manual export hydrates authorized team and a failed team query stops sync',async()=>{
  const site={site_id:'s',work_dates:[from],assigned_dates:[{work_date:from}]};
  const teams=await loadCalendarTeams(database(),'c',[site]);
  const result=await enrichCalendarSites([site],from,from,async()=>({site:{...site,calendar_team:teams.get('s')},materials:[]}));
  assert.deepEqual(result[0].calendar_team,teams.get('s'));
  await assert.rejects(loadCalendarTeams(database('workers'),'c',[site]),/read failed/);
});
