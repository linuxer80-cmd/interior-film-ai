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
  const signed=[];
  const db={from(table){
    let rows=table==='profiles'?[{id:'me',role:owner?'owner':'worker',company_id:'c',is_active:true}]
      :table==='companies'?[{id:'c',is_active:true}]
      :table==='labor_profiles'?[{user_id:'me',photo_path:'me/photo.jpg'},{user_id:'another',photo_path:'another/private.jpg'}]:notices;
    const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},
      neq(k,v){rows=rows.filter(r=>r[k]!==v);return q},
      not(k,op,v){assert.equal(op,'like');rows=rows.filter(r=>!r[k].startsWith(v.slice(0,-1)));return q},
      order(){return q},limit(n){rows=rows.slice(0,n);return q},
      maybeSingle(){return Promise.resolve({data:rows[0]||null})},
      then(resolve){return Promise.resolve({data:rows}).then(resolve)}};
    return q;
  },storage:{from(bucket){assert.equal(bucket,'labor-avatars');return {async createSignedUrl(path,seconds){signed.push(path);assert.equal(seconds,300);return {data:{signedUrl:'https://photo.example/signed'}}}}}}};
  const GET=new Function('privateAuth','fail','json','canReceiveRecruitment','scopeLaborNotifications',source+';return GET;')(
    async()=>({db,user:{id:'me',email_confirmed_at:'yes'}}), (m,status)=>Object.assign(new Error(m),{status}),Response.json,
    async()=>true,scopeLaborNotifications);
  return {GET,signed};
}
test('dual-role worker inbox excludes employer notices and other users before counting',async()=>{
  const {GET}=fixture(true);
  const result=await GET(new Request('https://app/api/labor-market?mode=notifications',{headers:{'x-labor-view':'worker'}}));
  assert.deepEqual((await result.json()).notifications.map(n=>n.id),['own','invite']);
});
test('manager retains incoming applicant notices',async()=>{
  const {GET}=fixture(true);
  const result=await GET(new Request('https://app/api/labor-market?mode=notifications'));
  assert.ok((await result.json()).notifications.some(n=>n.id==='applicant'));
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
