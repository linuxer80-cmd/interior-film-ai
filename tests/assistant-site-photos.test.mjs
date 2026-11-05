import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/api/assistant/site-photos/route.js',import.meta.url),'utf8')
  .replace(/^import .*;$/gm,'').replaceAll('export ','');
const company='11111111-1111-4111-8111-111111111111';
const site='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const user='44444444-4444-4444-8444-444444444444';
const imageId=i=>`55555555-5555-4555-8555-${String(i).padStart(12,'0')}`;
function setup({role='owner',profileCompany=company,active=true,assigned=true,siteExists=true,photos=null}={}) {
  const signed=[];let queriedPhotos=0;
  const rows=photos ?? [
    {id:imageId(1),company_id:company,site_id:site,photo_type:'request',storage_path:`sites/${company}/${site}/request/1.jpg`,created_at:'2026-11-01'},
    {id:imageId(2),company_id:company,site_id:site,photo_type:'before',storage_path:`sites/${other}/${site}/before/2.jpg`,created_at:'2026-11-02'},
    {id:imageId(3),company_id:other,site_id:site,photo_type:'after',storage_path:`sites/${other}/${site}/after/3.jpg`,created_at:'2026-11-03'},
  ];
  const db={
    auth:{getUser:async()=>({data:{user:{id:user}}})},
    storage:{from(name){
      assert.equal(name,'work-photos');
      return {async createSignedUrls(paths,seconds){
        signed.push(...paths);assert.equal(seconds,300);
        return {data:paths.map(path=>({path,signedUrl:'https://project.supabase.co/storage/v1/object/sign/work-photos/'+path+'?token=test'}))};
      }};
    }},
    from(table){
      let filters=[];const q={select(){return q},eq(k,v){filters.push(row=>row[k]===v);return q},in(k,values){filters.push(row=>values.includes(row[k]));return q},order(){return q},
        async maybeSingle(){if(table==='profiles')return {data:{company_id:profileCompany,role,is_active:active}};if(table==='companies')return {data:{id:company,is_active:active}};if(table==='sites')return {data:siteExists?{id:site}:null};throw Error('unexpected table')},
        async range(from,to){assert.equal(table,'site_photos');queriedPhotos++;return {data:rows.filter(row=>filters.every(f=>f(row))).slice(from,to+1)}}};return q;
    }};
  const resolve=async(_db,uid,siteId)=>{assert.equal(uid,user);assert.equal(siteId,site);if(!assigned)throw Object.assign(Error('denied'),{status:403});return {site:{id:site,company_id:company}}};
  const get=new Function('createClient','resolveWorkerSite','Response','process',source+';return GET;')(()=>db,resolve,Response,{env:{NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only'}});
  const request=(view='owner',selected=company,url=`https://example.test/?siteId=${site}&type=all&page=0`,token='Bearer valid')=>get(new Request(url,{headers:{Authorization:token,'X-Assistant-View':view,'X-Assistant-Company':selected}}));
  return {request,signed,get queriedPhotos(){return queriedPhotos}};
}
test('owner receives only the site company photos and never signs a mismatched storage path',async()=>{
  const t=setup(),r=await t.request(),body=await r.json();assert.equal(r.status,200);assert.equal(body.photos.length,2);
  assert.equal(t.signed.length,1);assert.equal(body.photos.find(p=>p.type==='before').url,null);
  assert.ok(!JSON.stringify(body).includes('storage_path'));assert.ok(!JSON.stringify(body).includes(other));
});
test('denies another company, inactive owner and missing site before reading photos',async()=>{
  for(const t of [setup({profileCompany:other}),setup({active:false}),setup({siteExists:false})]) {const r=await t.request();assert.equal(r.status,403);assert.equal(t.queriedPhotos,0);assert.equal(t.signed.length,0)}
});
test('assigned worker can view the assigned site; unassigned worker cannot',async()=>{
  const yes=setup({role:'worker'});assert.equal((await yes.request('worker')).status,200);
  const no=setup({role:'worker',assigned:false});assert.equal((await no.request('worker')).status,403);assert.equal(no.queriedPhotos,0);
  const wrong=setup({role:'worker'});assert.equal((await wrong.request('worker',other)).status,403);assert.equal(wrong.queriedPhotos,0);
});
test('does not sign traversal or encoded traversal paths',async()=>{
  const photos=['../other/a.jpg','%2e%2e/other/a.jpg','%2fother/a.jpg'].map((suffix,i)=>({id:imageId(i),company_id:company,site_id:site,photo_type:'before',storage_path:`sites/${company}/${site}/${suffix}`}));
  const t=setup({photos}),r=await t.request(),body=await r.json();assert.equal(r.status,200);assert.equal(t.signed.length,0);assert.ok(body.photos.every(p=>p.url===null));
});
test('pages and type filters are bounded and unauthenticated requests are rejected',async()=>{
  const photos=Array.from({length:14},(_,i)=>({id:imageId(i),company_id:company,site_id:site,photo_type:'after',storage_path:`sites/${company}/${site}/after/${i}.jpg`}));
  const t=setup({photos}),r=await t.request('owner',company,`https://example.test/?siteId=${site}&type=after&page=0`),body=await r.json();
  assert.equal(body.photos.length,12);assert.equal(body.hasMore,true);
  assert.equal((await t.request('owner',company,`https://example.test/?siteId=${site}&type=other&page=0`)).status,400);
  assert.equal((await t.request('owner',company,undefined,'')).status,401);
});
