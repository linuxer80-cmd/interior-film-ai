import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {worksOn,personalTomorrow,teamForDay} from '../app/utils/tomorrowSchedule.js';

const source=fs.readFileSync(new URL('../app/api/tomorrow-tasks/route.js',import.meta.url),'utf8')
  .replace(/import[\s\S]*?from\s+"[^"]+";/g,'').replaceAll('export ','');
const date='2026-10-28';
function fixture({failed=false,denied=false}={}) {
  const site={id:'site',site_id:'site',company_id:'co',site_name:'현장',status:'scheduled',work_dates:[date],assigned_dates:[{work_date:date,role:'leader'}]};
  const tables={profiles:[{id:'user',company_id:'co',role:'owner'}],companies:[{id:'co',company_name:'업체',is_active:true}],
    sites:[site],workers:[],site_daily_assignments:[],site_workers:[],site_materials:[
      {id:'active',company_id:'co',site_id:'site',material_type:'planned',product_code:'S245'},
      {id:'removed',company_id:'co',site_id:'site',material_type:'planned',product_code:'S245',removed_at:'2026-10-27'},
      {id:'actual',company_id:'co',site_id:'site',material_type:'actual',product_code:'S245'},
      {id:'foreign',company_id:'other',site_id:'site',material_type:'planned',product_code:'PRIVATE'},
    ]};
  const reads=[];
  const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){reads.push(table);const filters=[];let start=0,end=Infinity,single=false;
    const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},
      is(k,v){filters.push(r=>v===null?r[k]==null:r[k]===v);return q},order(){return q},range(a,b){start=a;end=b;return q},maybeSingle(){single=true;return q},
      then(resolve){const rows=tables[table].filter(r=>filters.every(f=>f(r))).slice(start,end+1);return Promise.resolve(failed&&table==='site_materials'?{error:Error('database failed')}:{data:single?rows[0]:rows}).then(resolve)}};return q;}};
  const context=vm.createContext({createClient:()=>db,tomorrowDay:()=>date,worksOn,personalTomorrow,teamForDay,
    mySites:async()=>denied?Response.json({error:'권한 없음'},{status:403}):Response.json({sites:[site]}),
    Response,Request,URL,Date,console:{error(){}},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'test',SUPABASE_SERVICE_ROLE_KEY:'test'}}});
  vm.runInContext(source+'\nglobalThis.handler=GET',context);
  return {reads,get:(role='worker',authorized=true)=>context.handler(new Request('https://test/api/tomorrow-tasks?role='+role,{headers:authorized?{authorization:'Bearer test'}:{}}))};
}
test('owner and worker preparation lists exclude removed duplicates and foreign or actual materials',async()=>{
  for(const role of ['owner','worker']){
    const response=await fixture().get(role);assert.equal(response.status,200);const data=await response.json();
    assert.equal(data.sites.length,1);assert.deepEqual(data.sites[0].materials.map(m=>m.id),['active']);
  }
});
test('preparation lookup failures and denied users never appear as an empty successful list',async()=>{
  assert.equal((await fixture({failed:true}).get()).status,500);
  const denied=fixture({denied:true});assert.equal((await denied.get()).status,403);assert.equal(denied.reads.includes('site_materials'),false);
  const anonymous=fixture();assert.equal((await anonymous.get('worker',false)).status,401);assert.deepEqual(anonymous.reads,[]);
});
