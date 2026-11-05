import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/api/assistant/photo-search/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const company='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333';
const site=n=>`44444444-4444-4444-8444-${String(n).padStart(12,'0')}`;
function setup({assigned=[site(1)],profileCompany=company,active=true}={}){
 const rows={sites:[{id:site(1),company_id:company,site_name:'청라',work_description:'싱크대',status:'completed',schedule_start:'2026-10-15'},
 {id:site(2),company_id:company,site_name:'송도',work_description:'싱크대',status:'completed',schedule_start:'2026-10-20'},
 {id:site(3),company_id:other,site_name:'다른 업체',work_description:'싱크대',schedule_start:'2026-10-20'}],
 site_materials:[{company_id:company,site_id:site(1),product_code:'S115'},{company_id:company,site_id:site(2),product_code:'GS115'}],
 site_photos:[{company_id:company,site_id:site(1),photo_type:'after'},{company_id:company,site_id:site(2),photo_type:'before'}]};
 let photoQueries=0;
 const db={auth:{getUser:async()=>({data:{user:{id:user}}})},from(table){
   const filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},
     ilike(k,v){filters.push(r=>r[k].toLowerCase()===v.toLowerCase());return q},order(){return q},
     async maybeSingle(){if(table==='profiles')return {data:{company_id:profileCompany,role:'owner',is_active:active}};return {data:{id:company,is_active:active}}},
     async range(a,b){if(table==='site_photos')photoQueries++;return {data:rows[table].filter(r=>filters.every(f=>f(r))).slice(a,b+1)}}};return q;
 }};
 const resolve=async(_db,_uid,id)=>{if(!assigned.includes(id))throw Object.assign(Error('denied'),{status:403});return {site:{id,company_id:company}}};
 const get=new Function('createClient','resolveWorkerSite','Response','process',source+';return GET;')(()=>db,resolve,Response,{env:{NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only'}});
 return {request:(qs,view='owner',selected=company,token='Bearer yes')=>get(new Request('https://test/?'+qs,{headers:{Authorization:token,'X-Assistant-Company':selected,'X-Assistant-View':view}})),get photoQueries(){return photoQueries}};
}
test('combines site, part, exact product code and work dates',async()=>{
 const t=setup(),r=await t.request('part=싱크대&code=S115&from=2026-10-01&to=2026-10-31');
 assert.equal(r.status,200);const body=await r.json();assert.deepEqual(body.rows.map(x=>x.id),[site(1)]);assert.equal(body.rows[0].date,'2026-10-15');
});
test('only authorized worker sites are returned',async()=>{
 const t=setup();const r=await t.request('part=싱크대','worker');assert.equal(r.status,200);
 assert.deepEqual((await r.json()).rows.map(x=>x.id),[site(1)]);
});
test('owner from another company and inactive users cannot search',async()=>{
 for(const t of [setup({profileCompany:other}),setup({active:false})]) {assert.equal((await t.request('site=청라')).status,403);assert.equal(t.photoQueries,0)}
});
test('rejects blank, invalid dates and unauthenticated requests',async()=>{
 const t=setup();assert.equal((await t.request('')).status,400);assert.equal((await t.request('from=2026-02-30&to=2026-03-01')).status,400);
 assert.equal((await t.request('site=청라','owner',company,'')).status,401);
});
test('photo type is filtered before listing a site',async()=>{
 const t=setup();const before=await t.request('part=싱크대&type=before');
 assert.deepEqual((await before.json()).rows.map(x=>x.id),[site(2)]);
 const after=await t.request('part=싱크대&type=after');
 assert.deepEqual((await after.json()).rows.map(x=>x.id),[site(1)]);
 assert.equal((await t.request('part=싱크대&type=private')).status,400);
});
