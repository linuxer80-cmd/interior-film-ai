import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveTeamSite} from '../lib/teamSiteAccess.mjs';
import {authorizedTeam,includeTeamOwners,teamDate,teamMessage} from '../lib/workerTeam.mjs';
const S='11111111-1111-4111-8111-111111111111',DAY='2026-10-21';
function fixture(extra={}){
 const tables={profiles:[{id:'owner',role:'owner',company_id:'co',name:'관리자',is_active:true}],companies:[{id:'co',is_active:true}],sites:[{id:S,company_id:'co',status:'in_progress',work_dates:[DAY]}],workers:[{id:'w',user_id:'worker',company_id:'co',is_active:true,name:'팀원'}],site_daily_assignments:[{id:'a',site_id:S,company_id:'co',work_date:DAY,worker_id:'w',role:'member'}],site_workers:[],worker_team_messages:[],labor_profiles:[],...extra};
 const db={rpc:async()=>({data:[]}),from(name){const filters=[];let single=false,range=null,insert=null;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},range(a,b){range=[a,b];return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(row){insert=row;return q},then(resolve){if(insert){(tables[name]??=[]).push(insert);return Promise.resolve({error:null}).then(resolve)}let rows=(tables[name]||[]).filter(r=>filters.every(f=>f(r)));if(range)rows=rows.slice(range[0],range[1]+1);return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve)}};return q}};return {db,tables};
}
test('owner accesses own site without worker membership, never another company',async()=>{
 const f=fixture();assert.equal((await resolveTeamSite(f.db,'owner',S)).ownerAccess,true);
 f.tables.sites[0].company_id='foreign';f.tables.companies.push({id:'foreign',is_active:true});await assert.rejects(resolveTeamSite(f.db,'owner',S),e=>e.status===403);
});
test('inactive owner or company cannot use manager chat access',async()=>{
 for(const table of ['profiles','companies']){const f=fixture();f.tables[table][0].is_active=false;await assert.rejects(resolveTeamSite(f.db,'owner',S),e=>e.status===403);}
});
test('owner helping another company retains only assigned worker access',async()=>{
 const f=fixture();f.tables.profiles[0].company_id='own-other';f.tables.workers[0].user_id='owner';
 assert.equal((await resolveTeamSite(f.db,'owner',S)).ownerAccess,false);
 assert.throws(()=>authorizedTeam([],f.tables.workers,'owner','co',S,DAY),e=>e.status===403);
});
test('team adds active same-company owner once and preserves assignment role',()=>{
 const owners=[{id:'owner',role:'owner',company_id:'co',name:'관리자'}, {id:'x',role:'owner',company_id:'foreign'}, {id:'inactive',role:'owner',company_id:'co',is_active:false}];
 const members=includeTeamOwners([{id:'w',user_id:'owner',role:'leader'}],owners,'co');assert.equal(members.length,1);assert.equal(members[0].role,'owner');assert.equal(members[0].assignment_role,'leader');
});
function route(f,user='owner'){
 const src=fs.readFileSync(new URL('../app/api/worker/team/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 return new Function('after','dispatchTeamMessage','privateAuth','privateJson','uuid','resolveTeamSite','authorizedTeam','includeTeamOwners','teamDate','teamMessage',src+';return {GET,POST,PATCH};')(()=>{},()=>{},async()=>({db:f.db,user:{id:user}}),(b,s=200)=>Response.json(b,{status:s}),v=>/^[0-9a-f-]{36}$/i.test(v),resolveTeamSite,authorizedTeam,includeTeamOwners,teamDate,teamMessage);
}
test('unassigned owner reads and writes team messages; workers still require exact day',async()=>{
 const f=fixture();const url='https://app.example/api/worker/team?siteId='+S+'&date='+DAY;
 const r=route(f);let res=await r.GET(new Request(url));assert.equal(res.status,200);let body=await res.json();assert.equal(body.members.find(m=>m.role==='owner').user_id,'owner');
 res=await r.POST(new Request(url,{method:'POST',body:JSON.stringify({id:'22222222-2222-4222-8222-222222222222',body:'관리자 메시지'})}));assert.equal(res.status,200);assert.equal(f.tables.worker_team_messages[0].company_id,'co');assert.equal(f.tables.worker_team_messages[0].sender_id,'owner');
 const workerRoute=route(f,'worker');res=await workerRoute.GET(new Request(url.replace(DAY,'2026-10-22')));assert.equal(res.status,403);
});
test('date listing is owner-only and contains current and historical chat dates',async()=>{
 const f=fixture();f.tables.worker_team_messages.push({id:'m',company_id:'co',site_id:S,work_date:'2026-10-19'});
 const url='https://app.example/api/worker/team?siteId='+S+'&mode=dates';let res=await route(f).GET(new Request(url));assert.equal(res.status,200);assert.deepEqual((await res.json()).dates.map(d=>d.work_date),['2026-10-19',DAY]);
 res=await route(f,'worker').GET(new Request(url));assert.equal(res.status,403);
});

test('read acknowledgements use authenticated user and exact authorized room; GET reports unread count',async()=>{
 const f=fixture();const calls=[];const mid='22222222-2222-4222-8222-222222222222';
 f.tables.worker_team_messages.push({id:mid,company_id:'co',site_id:S,work_date:DAY,sender_id:'owner',body:'메시지'});
 f.db.rpc=async(name,args)=>{calls.push({name,args});return {data:name==='team_message_read_counts'?[{message_id:mid,unread_count:1}]:null};};
 const url='https://app.example/api/worker/team?siteId='+S+'&date='+DAY;
 const routes=route(f,'worker');const result=await (await routes.GET(new Request(url))).json();assert.equal(result.messages[0].unreadCount,1);
 const response=await routes.PATCH(new Request(url,{method:'PATCH',body:JSON.stringify({messageIds:[mid,mid],userId:'owner'})}));assert.equal(response.status,200);
 const call=calls.find(c=>c.name==='mark_team_messages_read');assert.equal(call.args.p_user,'worker');assert.equal(call.args.p_company,'co');assert.equal(call.args.p_site,S);assert.equal(call.args.p_date,DAY);assert.deepEqual(call.args.p_ids,[mid]);
 assert.equal((await routes.PATCH(new Request(url.replace(DAY,'2026-10-22'),{method:'PATCH',body:JSON.stringify({messageIds:[mid]})}))).status,403);
 assert.equal((await routes.PATCH(new Request(url,{method:'PATCH',body:JSON.stringify({messageIds:['invalid']})}))).status,400);
});
