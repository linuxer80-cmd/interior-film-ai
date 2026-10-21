import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildClosingTasks} from '../lib/adminClosingTasks.mjs';
const site=(id='s',extra={})=>({id,site_name:'테스트 현장',status:'completed',...extra});
const report=(status='approved',extra={})=>({id:'r',site_id:'s',review_status:status,updated_at:'2026-10-21T00:00:00Z',...extra});
const balance=(extra={})=>({id:'s',confirmed:true,contract_amount:1000000,outstanding:0,...extra});
const base=()=>({sites:[site()],reports:[report()],balances:[balance()],trips:[],materials:[]});
test('one site card combines review, debt and material follow-ups with direct destinations',()=>{
 const b=base();b.reports=[report('pending')];b.balances=[balance({outstanding:200000})];b.trips=[{site_id:'s',returned:null}];b.materials=[{site_id:'s',quantity:10,unit_price:null}];const r=buildClosingTasks(b);assert.equal(r.rows.length,1);assert.deepEqual(r.rows[0].actions.map(a=>a.id),['review','payment','returns','price']);assert.deepEqual(r.rows[0].actions.map(a=>a.section),['report','settlement','material-returns','material-prices']);assert.deepEqual(r.counts,{all:1,review:1,payment:1,materials:1});
});
test('resolved tasks and fully tidied sites disappear; zero returns and zero prices remain valid',()=>{
 const b=base();b.trips=[{site_id:'s',returned:0}];b.materials=[{site_id:'s',quantity:10,unit_price:0}];assert.equal(buildClosingTasks(b).rows.length,0);b.reports=[report('pending')];assert.deepEqual(buildClosingTasks(b).rows[0].actions.map(a=>a.id),['review']);
});
test('only latest review is used; cancelled and unreported sites stay out',()=>{
 const b=base();b.sites.push(site('cancel',{status:'cancelled'}),site('unreported'));b.reports.push(report('pending',{id:'older',updated_at:'2026-10-20T00:00:00Z'}),report('pending',{id:'c',site_id:'cancel'}));assert.equal(buildClosingTasks(b).rows.length,0);b.reports.push(report('rejected',{id:'new',updated_at:'2026-10-22T00:00:00Z'}));assert.equal(buildClosingTasks(b).rows[0].actions[0].label,'보완 내용 확인');
});
test('a missing balance is an explicit task, never a clean bill',()=>{const b=base();b.balances=[];const r=buildClosingTasks(b);assert.equal(r.rows.length,1);assert.equal(r.rows[0].actions[0].menu,'settlement');assert.match(r.rows[0].actions[0].message,/확인 필요/);});
const source=fs.readFileSync(new URL('../app/api/admin/closing-tasks/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
function api({role='owner',active=true,failTable,materialCount=1}={}){
 const reads=[];
 const tables={profiles:[{id:'user',company_id:'co',role,is_active:active}],companies:[{id:'co',is_active:true}],sites:[{...site(),company_id:'co'},{...site('foreign'),company_id:'other'}],work_reports:[{...report('pending'),company_id:'co'},{...report('pending',{id:'f',site_id:'foreign'}),company_id:'other'}],site_receivable_balances:[{...balance({outstanding:200000}),company_id:'co'}],film_stock_trips:[{id:'t',site_id:'s',returned:null,company_id:'co'},{id:'foreign',site_id:'s',returned:null,company_id:'other'}],site_materials:Array.from({length:materialCount},(_,i)=>({id:'m'+i,site_id:'s',quantity:1,unit_price:null,material_type:'actual',company_id:'co'}))};
 const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){const filters=[];let single=false,offset=0,end=999;reads.push({table,filters});const query={select(){return query;},eq(k,v){filters.push(r=>r[k]===v);return query;},in(k,v){filters.push(r=>v.includes(r[k]));return query;},order(){return query;},range(a,b){offset=a;end=b;return query;},maybeSingle(){single=true;return query;},then(resolve){const data=(tables[table]||[]).filter(r=>filters.every(f=>f(r))).slice(offset,end+1);return Promise.resolve({data:single?data[0]:data,error:table===failTable?{code:'error'}:null}).then(resolve);}};return query;}};
 const GET=new Function('createClient','buildClosingTasks','process',source+';return GET;')(()=>db,buildClosingTasks,{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'}});
 return {GET,reads};
}
const request=token=>new Request('https://test.invalid/api/admin/closing-tasks?companyId=other',{headers:token?{authorization:'Bearer token'}:{}});
test('API rejects unauthenticated, worker and disabled-owner access before reading sites',async()=>{
 for(const [options,token,status] of [[{},false,401],[{role:'worker'},true,403],[{active:false},true,403]]){const f=api(options);assert.equal((await f.GET(request(token))).status,status);assert.equal(f.reads.some(r=>r.table==='sites'),false);}
});
test('API scopes every source to the authenticated company and paginates actual materials',async()=>{
 const f=api({materialCount:501});const response=await f.GET(request(true));assert.equal(response.status,200);const data=await response.json();assert.equal(data.rows.length,1);assert.equal(data.rows[0].siteId,'s');assert.match(data.rows[0].actions.find(a=>a.id==='returns').message,/1개/);assert.match(data.rows[0].actions.find(a=>a.id==='price').message,/501건/);assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('failed ledger queries return an error rather than empty or complete results',async()=>{
 const f=api({failTable:'site_receivable_balances'});const response=await f.GET(request(true));assert.equal(response.status,500);const data=await response.json();assert.equal('rows' in data,false);assert.ok(data.error);
});
