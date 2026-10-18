import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedTeam,teamDate,teamMessage} from '../lib/workerTeam.mjs';
const workers=[{id:'a',user_id:'u',company_id:'c',is_active:true},{id:'b',user_id:'v',company_id:'c',is_active:true},{id:'x',user_id:'other',company_id:'other',is_active:true}];
const assignments=[{worker_id:'a',company_id:'c',site_id:'s',work_date:'2026-10-19'},{worker_id:'b',company_id:'c',site_id:'s',work_date:'2026-10-19'},{worker_id:'x',company_id:'other',site_id:'s',work_date:'2026-10-19'}];
test('team is limited to same company, site and day',()=>{assert.equal(authorizedTeam(assignments,workers,'u','c','s','2026-10-19').length,2);for(const args of [['u','c','s','2026-10-20'],['other','c','s','2026-10-19'],['u','c','another','2026-10-19']])assert.throws(()=>authorizedTeam(assignments,workers,...args),e=>e.status===403);});
test('inactive or removed membership cannot authorize team access',()=>{assert.throws(()=>authorizedTeam(assignments,workers.map(w=>({...w,is_active:false})),'u','c','s','2026-10-19'));assert.throws(()=>authorizedTeam(assignments.slice(1),workers,'u','c','s','2026-10-19'));});
test('validates dates and bounded message content',()=>{assert.equal(teamDate('2026-10-19'),'2026-10-19');assert.throws(()=>teamDate('2026-02-30'));assert.throws(()=>teamDate(null));assert.equal(teamMessage(' hi '),'hi');assert.throws(()=>teamMessage(' '));assert.throws(()=>teamMessage('x'.repeat(2001)));});
