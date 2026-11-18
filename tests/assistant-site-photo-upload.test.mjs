import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const source=readFileSync(new URL('../app/api/assistant/site-photo-upload/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const company='11111111-1111-4111-8111-111111111111', site='22222222-2222-4222-8222-222222222222', user='33333333-3333-4333-8333-333333333333';
function setup({role='owner',profileCompany=company,active=true,siteExists=true,insertFails=false}={}) {
  const uploads=[],removed=[],records=[];
  const db={auth:{getUser:async()=>({data:{user:{id:user}}})},storage:{from:()=>({upload:async(path)=>{uploads.push(path);return {}},remove:async paths=>{removed.push(...paths);return {}}})},from(table){
    const q={select(){return q},eq(){return q},async maybeSingle(){return {data:table==='profiles'?{company_id:profileCompany,role,is_active:active}:table==='companies'?{id:company,is_active:true}:siteExists?{id:site}:null}},insert(row){records.push(row);return q},async single(){return insertFails?{error:Error('failed')}:{data:{id:'photo'}}}};return q;
  }};
  const post=new Function('createClient','randomUUID','Response','File','process',source+';return POST;')(()=>db,randomUUID,Response,File,{env:{NEXT_PUBLIC_SUPABASE_URL:'url',SUPABASE_SERVICE_ROLE_KEY:'private'}});
  async function request(type='before',selected=company,token='Bearer valid',description='') {const form=new FormData();form.set('siteId',site);form.set('photoType',type);form.set('description',description);form.set('photos',new File(['image'],'test.jpg',{type:'image/jpeg'}));return post(new Request('https://example.test',{method:'POST',headers:{Authorization:token,'X-Assistant-Company':selected},body:form}));}
  return {request,uploads,removed,records};
}
test('owner uploads to the selected site and records the category',async()=>{for(const type of ['request','before','after']) {const t=setup();assert.equal((await t.request(type)).status,200);assert.match(t.uploads[0],new RegExp(`^sites/${company}/${site}/${type}/`));assert.equal(t.records[0].photo_type,type);assert.equal(t.records[0].uploaded_by,user)}});
test('rejects wrong owner, inactive owner, missing site and missing token before uploading',async()=>{for(const t of [setup({role:'worker'}),setup({profileCompany:'44444444-4444-4444-8444-444444444444'}),setup({active:false}),setup({siteExists:false})]) {assert.equal((await t.request()).status,403);assert.equal(t.uploads.length,0)} const t=setup();assert.equal((await t.request('before',company,'')).status,401);assert.equal(t.uploads.length,0)});
test('removes uploaded object when database insert fails',async()=>{const t=setup({insertFails:true});assert.equal((await t.request()).status,500);assert.deepEqual(t.removed,t.uploads)});
test('saves photo notes and rejects notes over 200 characters',async()=>{const t=setup();assert.equal((await t.request('before',company,'Bearer valid','문 하단 파손')).status,200);assert.equal(t.records[0].description,'문 하단 파손');const bad=setup();assert.equal((await bad.request('before',company,'Bearer valid','x'.repeat(201))).status,400);assert.equal(bad.uploads.length,0)});
