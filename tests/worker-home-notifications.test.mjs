import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scopeLaborNotifications } from '../lib/laborNotificationPolicy.mjs';
const source=readFileSync(new URL('../app/api/labor-market/route.js',import.meta.url),'utf8')
  .replace(/^import .*;$/gm,'').replace(/export /g,'');
function fixture(owner=false) {
  const notices=[
    {id:'other',user_id:'another',title:'구인 제안',link:'/jobs?view=worker'},
    {id:'applicant',user_id:'me',title:'새로운 시공자 지원',link:'/jobs?mine=1&job=j'},
    {id:'legacy',user_id:'me',title:'지원 변경',link:'/jobs?mine=1&job=j'},
    {id:'own',user_id:'me',title:'구인이 확정되었습니다',link:'/worker/site/s'},
    {id:'invite',user_id:'me',title:'구인 제안',link:'/jobs?view=worker&job=j'},
  ];
  for (const n of notices) n.job_id=['applicant','legacy'].includes(n.id)?'company-job':'external-job';
  const jobs=[{id:'company-job',company_id:'c'},{id:'external-job',company_id:'elsewhere'}];
  const signed=[];
  const db={from(table){
    let rows=table==='profiles'?[{id:'me',role:owner?'owner':'worker',company_id:'c',is_active:true}]
      :table==='companies'?[{id:'c',is_active:true}]
      :table==='labor_profiles'?[{user_id:'me',photo_path:'me/photo.jpg'},{user_id:'another',photo_path:'another/private.jpg'}]:notices;
    const q={update(){return q},select(fields){
        if(fields?.includes('labor_jobs!inner')) rows=rows.flatMap(r=>{
          const job=jobs.find(j=>j.id===r.job_id);
          return job?[{...r,labor_jobs:{company_id:job.company_id}}]:[];
        });
        return q;
      },eq(k,v){rows=rows.filter(r=>k.split('.').reduce((o,key)=>o?.[key],r)===v);return q},
      neq(k,v){rows=rows.filter(r=>r[k]!==v);return q},
      not(k,op,v){assert.equal(op,'like');rows=rows.filter(r=>!r[k].startsWith(v.slice(0,-1)));return q},
      order(){return q},limit(n){rows=rows.slice(0,n);return q},
      maybeSingle(){return Promise.resolve({data:rows[0]||null})},
      then(resolve){return Promise.resolve({data:rows}).then(resolve)}};
    return q;
  },storage:{from(bucket){assert.equal(bucket,'labor-avatars');return {async createSignedUrl(path,seconds){signed.push(path);assert.equal(seconds,300);return {data:{signedUrl:'https://photo.example/signed'}}}}}}};
  const {GET,POST}=new Function('privateAuth','fail','json','canReceiveRecruitment','scopeLaborNotifications','uuid',source+';return {GET,POST};')(
    async()=>({db,user:{id:'me',email_confirmed_at:'yes'}}), (m,status)=>Object.assign(new Error(m),{status}),(data,status=200)=>Response.json(data,{status}),
    async()=>true,scopeLaborNotifications,()=>true);
  return {GET,POST,signed,notices};
}
test('dual-role worker inbox excludes employer notices and other users before counting',async()=>{
  const {GET}=fixture(true);
  const result=await GET(new Request('https://app/api/labor-market?mode=notifications',{headers:{'x-labor-view':'worker'}}));
  assert.deepEqual((await result.json()).notifications.map(n=>n.id),['own','invite']);
});
test('manager retains incoming applicant notices',async()=>{
  const {GET}=fixture(true);
  const result=await GET(new Request('https://app/api/labor-market?mode=notifications'));
  const data=await result.json();
  assert.deepEqual(data.notifications.map(n=>n.id),['applicant','legacy']);
  assert.ok(data.notifications.every(n=>!('labor_jobs' in n)));
});
test('non-owner cannot request manager notices by changing header',async()=>{
  const {GET}=fixture(false);
  const result=await GET(new Request('https://app/api/labor-market?mode=notifications',{headers:{'x-labor-view':'manager'}}));
  assert.deepEqual((await result.json()).notifications.map(n=>n.id),['own','invite']);
});
test('avatar signs only the authenticated user photo and returns no personal fields',async()=>{
  const {GET,signed}=fixture(true);
  const response=await GET(new Request('https://app/api/labor-market?mode=avatar&user_id=another'));
  assert.deepEqual(await response.json(),{photo_url:'https://photo.example/signed'});
  assert.deepEqual(signed,['me/photo.jpg']);
});

test('company scope applies before limit, ignoring foreign and orphan notices',async()=>{
  const {GET,notices}=fixture(true);
  notices.unshift(...Array.from({length:60},(_,i)=>({id:'foreign-'+i,user_id:'me',job_id:'external-job',title:'새로운 시공자 지원',link:'/jobs?mine=1'})));
  notices.unshift({id:'orphan',user_id:'me',job_id:'deleted',title:'지원',link:'/jobs?mine=1'});
  const response=await GET(new Request('https://app/api/labor-market?mode=notifications&company_id=elsewhere'));
  assert.deepEqual((await response.json()).notifications.map(n=>n.id),['applicant','legacy']);
});

test('manager can mark only their own company notice as read',async()=>{
  const {POST}=fixture(true);
  for(const [id,status] of [['applicant',200],['own',403],['other',403]]){
    const response=await POST(new Request('https://app/api/labor-market',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'read_notification',id})
    }));
    assert.equal(response.status,status);
  }
});
