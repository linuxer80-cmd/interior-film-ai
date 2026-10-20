import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extraAmount,extraDescription,imageType} from '../lib/siteExtraWork.mjs';
// Use actual access resolver copied by the repo; never trust a UI-supplied role.
import {resolveTeamSite} from '../lib/teamSiteAccess.mjs';
const siteId='30000000-0000-4000-8000-000000000001',requestId='40000000-0000-4000-8000-000000000001';
function fixture(){
 const tables={profiles:[{id:'owner',company_id:'co',role:'owner',is_active:true},{id:'worker',role:'worker',is_active:true},{id:'outsider',role:'owner',company_id:'foreign',is_active:true}],companies:[{id:'co',is_active:true},{id:'foreign',is_active:true}],sites:[{id:siteId,company_id:'co',status:'in_progress',contract_amount:1000000,work_dates:['2026-10-21']}],workers:[{id:'w',company_id:'co',user_id:'worker',is_active:true}],site_daily_assignments:[{id:'a',company_id:'co',site_id:siteId,worker_id:'w',work_date:'2026-10-21'}],site_workers:[],site_extra_work:[]};
 let rpcCalls=0;
 const db={from(name){let filters=[],single=false,insert=null,range=null;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},range(a,b){range=[a,b];return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(r){insert=r;return q},then(resolve){if(insert){insert={...insert,id:requestId,status:'pending',created_at:new Date().toISOString()};tables[name].push(insert);return Promise.resolve({data:insert}).then(resolve);}let rows=(tables[name]||[]).filter(r=>filters.every(f=>f(r))),count=rows.length;if(range)rows=rows.slice(range[0],range[1]+1);return Promise.resolve({data:single?rows[0]||null:rows,count}).then(resolve)}};return q;},rpc(){rpcCalls++;return Promise.resolve({data:{success:true}})}};
 return {db,tables,get rpcCalls(){return rpcCalls}};
}
function route(f,user='owner'){
 const src=fs.readFileSync(new URL('../app/api/site-extra-work/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 const auth=async(req,ownerOnly)=>!user?{error:'로그인 필요',status:401}:ownerOnly&&user!=='owner'?{error:'관리자 전용',status:403}:{db:f.db,user:{id:user},companyId:'co'};
 return new Function('privateAuth','privateJson','uuid','resolveTeamSite','extraAmount','extraDescription','imageType',src+';return {GET,POST};')(auth,(b,s=200)=>Response.json(b,{status:s}),v=>/^[0-9a-f-]{36}$/i.test(v),resolveTeamSite,extraAmount,extraDescription,imageType);
}
const get=(r,query='')=>r.GET(new Request('https://example.com/api/site-extra-work'+query));
const post=(r,body)=>r.POST(new Request('https://example.com/api/site-extra-work',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({siteId,...body})}));
test('anonymous and unrelated user cannot read site requests',async()=>{const f=fixture();assert.equal((await get(route(f,null),'?siteId='+siteId)).status,401);assert.equal((await get(route(f,'outsider'),'?siteId='+siteId)).status,403);});
test('assigned worker can request but cannot approve or read manager overview',async()=>{const f=fixture(),r=route(f,'worker');let res=await post(r,{action:'create',requestId,description:'문 추가',amount:'50000'});assert.equal(res.status,200);assert.equal(f.tables.site_extra_work[0].company_id,'co');res=await post(r,{action:'approve',id:requestId,amount:50000});assert.equal(res.status,403);assert.equal(f.rpcCalls,0);assert.equal((await get(r)).status,403);});
test('request retry keeps a single record and ignores forged company and creator',async()=>{const f=fixture(),r=route(f,'worker'),body={action:'create',requestId,description:'추가',amount:0,company_id:'foreign',requested_by:'owner'};await post(r,body);await post(r,body);assert.equal(f.tables.site_extra_work.length,1);assert.equal(f.tables.site_extra_work[0].requested_by,'worker');});
test('owner overview excludes foreign-company and processed requests',async()=>{const f=fixture();f.tables.site_extra_work.push({id:'a',company_id:'co',site_id:siteId,status:'pending',photo_paths:[]},{id:'b',company_id:'foreign',site_id:siteId,status:'pending',photo_paths:[]},{id:'c',company_id:'co',site_id:siteId,status:'approved',photo_paths:[]});const body=await (await get(route(f))).json();assert.deepEqual(body.rows.map(x=>x.id),['a']);assert.equal(body.count,1);});
test('negative and missing approval amounts fail before RPC',async()=>{const f=fixture();for(const amount of [-1,null,''])assert.equal((await post(route(f),{action:'approve',id:requestId,amount})).status,400);assert.equal(f.rpcCalls,0);assert.equal((await post(route(f),{action:'approve',id:requestId,amount:50000})).status,200);assert.equal(f.rpcCalls,1);});
