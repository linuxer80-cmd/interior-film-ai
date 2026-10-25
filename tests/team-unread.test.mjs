import test from 'node:test';
import assert from 'node:assert/strict';
import { teamUnread } from '../lib/teamUnread.mjs';
import { createClient } from '@supabase/supabase-js';

test('unread count is scoped to recipient, company and site and is not capped by sample row',async()=>{
 let requested;
 const db=createClient('https://example.supabase.co','placeholder',{global:{fetch:async(url)=>{
  requested=new URL(url);
  return new Response(JSON.stringify([{message_id:'one',worker_team_messages:{work_date:'2026-10-27'}}]),{status:206,headers:{'Content-Type':'application/json','Content-Range':'0-0/125'}});
 }}});
 assert.deepEqual(await teamUnread(db,'self',{id:'site',company_id:'company'}),{count:125,date:'2026-10-27'});
 assert.equal(requested.searchParams.get('user_id'),'eq.self');
 assert.equal(requested.searchParams.get('read_at'),'is.null');
 assert.equal(requested.searchParams.get('worker_team_messages.company_id'),'eq.company');
 assert.equal(requested.searchParams.get('worker_team_messages.site_id'),'eq.site');
 assert.equal(requested.searchParams.get('limit'),'1');
 assert.match(requested.searchParams.get('select'),/!inner/);
});
test('empty inbox is zero but lookup errors are not shown as zero',async()=>{
 const result=value=>({from(){const q={select(){return q},eq(){return q},is(){return q},order(){return q},limit(){return Promise.resolve(value)}};return q}});
 assert.deepEqual(await teamUnread(result({data:[],count:0}), 'self',{id:'site',company_id:'company'}),{count:0,date:null});
 await assert.rejects(()=>teamUnread(result({error:Error('denied')}),'self',{id:'site',company_id:'company'}),/denied/);
});
