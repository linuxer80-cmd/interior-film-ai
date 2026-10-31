import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentNotifications } from '../lib/assignment-notifications.mjs';

test('one notice per recipient summarizes all dates and does not notify the acting administrator', () => {
  const workers=[{id:'w1',user_id:'admin'},{id:'w2',user_id:'other'},{id:'w3',user_id:null}];
  const changes=[
    {kind:'added',row:{worker_id:'w1',work_date:'2026-11-01',role:'leader'}},
    {kind:'added',row:{worker_id:'w2',work_date:'2026-11-03',role:'member'}},
    {kind:'removed',row:{worker_id:'w2',work_date:'2026-11-02',role:'leader'}},
    {kind:'added',row:{worker_id:'w3',work_date:'2026-11-03',role:'member'}},
  ];
  const result=assignmentNotifications({changes,workers,actorId:'admin',companyId:'co',siteId:'site',now:1});
  assert.equal(result.length,1);
  assert.equal(result[0].recipient_user_id,'other');
  assert.equal(result[0].title,'현장 배정 변경');
  assert.match(result[0].message,/2026-11-02 · 팀장 · 배정 해제/);
  assert.match(result[0].message,/2026-11-03 · 팀원 · 신규 배정/);
  assert.equal(result[0].link,'/worker/site/site');
});

test('different people and different saves do not collapse into one notice', () => {
  const workers=[{id:'w1',user_id:'u1'},{id:'w2',user_id:'u2'}];
  const changes=workers.map(w=>({kind:'added',row:{worker_id:w.id,work_date:'2026-11-01',role:'member'}}));
  const args={changes,workers,actorId:'actor',companyId:'co',siteId:'s'};
  const first=assignmentNotifications({...args,now:1});
  const second=assignmentNotifications({...args,now:2});
  assert.equal(first.length,2);
  assert.notEqual(first[0].dedupe_key,first[1].dedupe_key);
  assert.notEqual(first[0].dedupe_key,second[0].dedupe_key);
});
