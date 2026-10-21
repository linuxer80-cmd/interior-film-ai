import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {assignmentChanges,applyTeamToDates} from '../lib/assignmentReview.mjs';
const site='10000000-0000-0000-0000-000000000001',worker='10000000-0000-0000-0000-000000000002',other='10000000-0000-0000-0000-000000000003';
const source=fs.readFileSync(new URL('../app/api/site-daily-assignments/route.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export ','');
function fixture({role='owner',foreign=false,broken=false}={}) {
 const rows={profiles:[{id:'u',role,company_id:'c',is_active:true}],companies:[{id:'c',is_active:true}],sites:[{id:site,company_id:foreign?'other':'c',status:'scheduled',work_dates:['2026-10-22']}],workers:[{id:worker,company_id:'c',is_active:true,user_id:'person',name:'김시공',daily_wage:0},{id:other,company_id:'other',is_active:true,user_id:'person'}],worker_relationships:[{worker_id:worker,company_id:'c',relationship_type:'employee',ended_at:null}],site_daily_assignments:[{id:'other-assignment',site_id:'other-site',company_id:'other',worker_id:other,work_date:'2026-10-22',role:'leader'}],labor_profiles:[]};
 let writes=0;
 const db={auth:{getUser:async()=>({data:{user:{id:'u'}}})},rpc:async()=>{writes++;return {error:{code:'XX000'}};},from(table){let checks=[],start=0,end=Infinity,single=false;const q={select(){return q;},eq(key,value){checks.push(row=>row[key]===value);return q;},in(key,values){checks.push(row=>values.includes(row[key]));return q;},is(key,value){checks.push(row=>row[key]===value);return q;},order(){return q;},range(a,b){start=a;end=b+1;return q;},limit(n){end=n;return q;},maybeSingle(){single=true;return q;},then(resolve,reject){if(broken&&table==='workers')return Promise.resolve({error:{code:'unavailable'}}).then(resolve,reject);const result=(rows[table]||[]).filter(row=>checks.every(check=>check(row))).slice(start,end);return Promise.resolve({data:single?result[0]||null:result}).then(resolve,reject);}};return q;}};
 const ctx=vm.createContext({createClient:()=>db,Response,Request,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'}},console:{error(){}}});vm.runInContext(source+'\nglobalThis.post=POST;',ctx);
 const wrapper=fs.readFileSync(new URL('../app/api/site-daily-assignments/preview/route.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export ','');
 const previewCtx=vm.createContext({assignmentPost:ctx.post,Request,Response});vm.runInContext(wrapper+'\nglobalThis.preview=POST;',previewCtx);
 const payload={siteId:site,days:[{workDate:'2026-10-22',leaderId:worker,memberIds:[]}]};
 const call=(body=payload,preview=true,token=true)=> (preview?previewCtx.preview:ctx.post)(new Request('https://app.test/api/site-daily-assignments'+(preview?'/preview':''),{method:'POST',headers:{...(token?{authorization:'Bearer test'}:{}),'content-type':'application/json'},body:JSON.stringify(body)}));
 return {call,payload,writes:()=>writes};
}
test('preview uses real auth, wage and conflict checks but never writes assignments',async()=>{
 const h=fixture();const response=await h.call();assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.preview,true);assert.equal(result.warnings.length,1);assert.equal(result.pendingWages.length,1);assert.equal(h.writes(),0);
 assert.equal(result.warnings[0].workerName,'김시공');assert.ok(!JSON.stringify(result.warnings).includes('other-site'));
 const actual=await h.call({...h.payload,confirmScheduleConflicts:true},false);assert.equal(actual.status,500);assert.equal(h.writes(),1);
});
test('preview reports missing leaders without committing intentional partial assignments',async()=>{
 const h=fixture();const response=await h.call({...h.payload,days:[{workDate:'2026-10-22',leaderId:'',memberIds:[]}]});assert.equal(response.status,200);assert.deepEqual((await response.json()).missingLeaders,['2026-10-22']);assert.equal(h.writes(),0);
});
test('preview cannot bypass login, owner role, company scope, changed dates or read failures',async()=>{
 for(const [options,status] of [[{role:'worker'},403],[{foreign:true},404],[{broken:true},500]]){const h=fixture(options);assert.equal((await h.call()).status,status);assert.equal(h.writes(),0);}
 const h=fixture();assert.equal((await h.call(h.payload,true,false)).status,401);
 assert.equal((await h.call({...h.payload,days:[{workDate:'2026-10-23',leaderId:worker,memberIds:[]}]})).status,400);assert.equal(h.writes(),0);
});
test('bulk apply only changes selected work dates, copies arrays, and never assigns a leader twice',()=>{
 const value={a:{leaderId:'lead',memberIds:['lead','member','member']},b:{leaderId:'old',memberIds:[]},c:{leaderId:'keep',memberIds:[]}};
 const result=applyTeamToDates(value,'a',['b','unknown']);assert.deepEqual(result.b,{leaderId:'lead',memberIds:['member']});assert.deepEqual(result.c,value.c);assert.equal(result.unknown,undefined);assert.equal(value.b.leaderId,'old');
 result.b.memberIds.push('new');assert.deepEqual(value.a.memberIds,['lead','member','member']);
 const changes=assignmentChanges(value,result);assert.match(changes.b,/팀장 변경/);assert.match(changes.b,/팀원 2명 추가/);assert.equal(changes.c,undefined);
});
