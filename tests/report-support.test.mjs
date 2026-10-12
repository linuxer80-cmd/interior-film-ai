import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app/api/report-support/route.js',import.meta.url),'utf8').replace(/import[^;]+;/g,'').replaceAll('export ','');
const site='00000000-0000-0000-0000-000000000001';
test('report support selects the newest own-site report when history has multiple reports',async()=>{
 const rows={sites:[{id:site,company_id:'company'}],work_reports:[{id:'old',company_id:'company',site_id:site,review_status:'approved',updated_at:'2026-10-01'},{id:'latest',company_id:'company',site_id:site,review_status:'rejected',updated_at:'2026-10-12',work_summary:'수정 필요'},{id:'foreign',company_id:'other',site_id:site,updated_at:'2099-01-01'}],site_materials:[],site_expenses:[],site_photos:[]};
 const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},rpc:async()=>({data:{owner:false,canReturn:true,materials:[]}}),from(table){let predicates=[],orders=[],limit=Infinity,single=false;const q={select(){return q},eq(k,v){predicates.push(r=>r[k]===v);return q},order(k,{ascending=true}={}){orders.push([k,ascending]);return q},limit(n){limit=n;return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve){const result=rows[table].filter(r=>predicates.every(p=>p(r))).sort((a,b)=>{for(const [k,asc] of orders){const n=String(a[k]).localeCompare(String(b[k]));if(n)return asc?n:-n}return 0}).slice(0,limit);return Promise.resolve(single&&result.length>1?{error:{code:'PGRST116'}}:{data:single?result[0]:result,count:result.length}).then(resolve)}};return q}};
 const ctx=vm.createContext({createClient:()=>db,Response,Request,URL,process:{env:{}},console:{error(){}}});vm.runInContext(source+'\nglobalThis.handler=GET',ctx);
 const response=await ctx.handler(new Request('https://test/api/report-support?siteId='+site,{headers:{authorization:'Bearer test'}}));assert.equal(response.status,200);const body=await response.json();assert.equal(body.report.id,'latest');assert.equal(body.seed.work_summary,'수정 필요');assert.equal(body.report.review_status,'rejected');
});
