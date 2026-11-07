import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarSites } from '../lib/calendarAutoSites.mjs';
import { siteCalendarEvents } from '../lib/googleCalendar.mjs';

const from='2026-11-17',to='2026-11-18';
function database(extra={},failure='') {
  const tables={profiles:[{id:'u',role:'owner',company_id:'a',is_active:true}],companies:[{id:'a',is_active:true},{id:'b',is_active:true}],
    workers:[{id:'wa',user_id:'u',company_id:'a',is_active:true},{id:'wb',user_id:'u',company_id:'b',is_active:true}],
    sites:[{id:'own',company_id:'a',site_name:'내 업체',status:'scheduled',work_dates:[from,to]},
      {id:'foreign',company_id:'b',site_name:'타 업체',status:'scheduled',work_dates:[from,to]},
      {id:'foreign-unassigned',company_id:'b',status:'scheduled',work_dates:[from]},
      {id:'cancel',company_id:'a',status:'cancelled',work_dates:[from]}],
    site_workers:[],site_daily_assignments:[{id:'x',company_id:'a',site_id:'own',worker_id:'wa',work_date:from,role:'leader'},
      {id:'y',company_id:'b',site_id:'foreign',worker_id:'wb',work_date:from,role:'member'}],site_materials:[],...extra};
  return {from(table){let filters=[],start=0,end=499;const result=(single=false)=>{if(table===failure)return {error:Error('read failed')};const found=(tables[table]||[]).filter(r=>filters.every(f=>f(r))).slice(start,end+1);return {data:single?found[0]||null:found};};
    const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(){return q},range(a,b){start=a;end=b;return q},maybeSingle:async()=>result(true),then(a,b){return Promise.resolve(result()).then(a,b)}};return q;}};
}
test('owner gets all own company dates, only assigned dates elsewhere, and no duplicate events',async()=>{
  const sites=await calendarSites(database(),'u',from,to);
  assert.deepEqual(sites.map(s=>s.site_id).sort(),['foreign','own']);
  const events=await siteCalendarEvents(sites,'u',from,to,'https://interior-film-ai.vercel.app');
  assert.equal(events.length,3);assert.equal(new Set(events.map(e=>e.id)).size,3);
  const own=events.filter(e=>e.extendedProperties.private.siteId==='own');
  assert.match(own.find(e=>e.start.date===from).description,/내 배정\n팀장/);
  assert.match(own.find(e=>e.start.date===to).description,/내 배정\n배정 없음/);
  assert.match(own[0].description,/\/admin\?tab=sites&site=own/);
  const foreign=events.find(e=>e.extendedProperties.private.siteId==='foreign');
  assert.equal(foreign.start.date,from);assert.match(foreign.description,/내 배정\n팀원/);
});
test('owner does not need a worker membership; inactive owner and company are excluded',async()=>{
  assert.deepEqual((await calendarSites(database({workers:[],site_daily_assignments:[]}),'u',from,to)).map(s=>s.site_id),['own']);
  assert.deepEqual(await calendarSites(database({profiles:[{id:'u',role:'owner',company_id:'a',is_active:false}]}),'u',from,to),[]);
  assert.deepEqual(await calendarSites(database({workers:[],companies:[{id:'a',is_active:false}]}),'u',from,to),[]);
});
test('workers see assigned dates only and database errors stop synchronization',async()=>{
  const db=database({profiles:[{id:'u',role:'worker',company_id:'a',is_active:true}]});
  const events=await siteCalendarEvents(await calendarSites(db,'u',from,to),'u',from,to,'https://interior-film-ai.vercel.app');
  assert.equal(events.length,2);assert.ok(events.every(e=>e.start.date===from));
  await assert.rejects(calendarSites(database({},'sites'),'u',from,to),/read failed/);
});

test('owner and assigned worker consultations are excluded before detail loading',async()=>{
  const db=database({sites:[
    {id:'own',company_id:'a',status:'consulting',work_dates:[from,to]},
    {id:'foreign',company_id:'b',status:'consulting',work_dates:[from,to]},
  ]},'site_materials');
  assert.deepEqual(await calendarSites(db,'u',from,to),[]);
});
