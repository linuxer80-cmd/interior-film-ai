import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {customerPhotoAccess,readCustomerPhotos,saveCustomerPhotos,listCustomerPhotos,CUSTOMER_PHOTO_BODY_MAX} from '../lib/customerRequestPhotos.mjs';
const id='40000000-0000-4000-8000-000000000001';
const portal={token_id:'token',site_id:'site',company_id:'company',site:{status:'consulting'}};
function form(files,extras={}){const f=new FormData();f.append('requestId',id);f.append('note',' 측면도 시공 ');files.forEach(file=>f.append('photos',file));for(const [k,v]of Object.entries(extras))f.set(k,v);return f;}
const request=body=>new Request('https://app.test/api/customer-portal/photos',{method:'POST',headers:{origin:'https://app.test',authorization:'Bearer signed-token'},body});
const image=async()=>new File([await sharp({create:{width:20,height:20,channels:3,background:'#ddd'}}).png().toBuffer()],'photo.png',{type:'image/png'});

test('upload body validates scope-independent fields and is bounded before multipart parsing',async()=>{
 const f=await image();const input=await readCustomerPhotos(request(form([f])));assert.equal(input.note,'측면도 시공');assert.equal(input.files.length,1);
 for(const data of [form([]),form(Array(11).fill(f)),form([f],{note:'x'.repeat(501)}),form([f],{requestId:'../other'})])await assert.rejects(readCustomerPhotos(request(data)),e=>e.status===400);
 await assert.rejects(readCustomerPhotos(new Request('https://app.test',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x'},body:'x'.repeat(CUSTOMER_PHOTO_BODY_MAX+1)})),e=>e.status===413);
});
test('mutations require same origin and bearer credentials stay out of URL',()=>{
 assert.equal(customerPhotoAccess(request(form([]))),'signed-token');
 assert.throws(()=>customerPhotoAccess(new Request('https://app.test',{method:'POST',headers:{origin:'https://other.test'}})),e=>e.status===403);
});
function fakeDb(){const stored=new Map(),calls=[],batches=new Map();let failUpload=false,loseResponse=false,notices=0;
 return {stored,calls,batches,get notices(){return notices;},set failUpload(v){failUpload=v;},set loseResponse(v){loseResponse=v;},
 async rpc(name,args){calls.push({name,args});if(name==='reserve_customer_photo_submission'){
   const old=batches.get(args.p_id);if(old&&old.fingerprint!==args.p_fingerprint)return {error:{code:'23505'}};
   const row=old||{fingerprint:args.p_fingerprint,status:'pending',photo_count:args.p_count,site_id:'site',company_id:'company'};batches.set(args.p_id,row);return {data:row};
 }const row=batches.get(args.p_id);if(row.status!=='completed'){row.status='completed';notices++;}
 if(loseResponse){loseResponse=false;return {error:{code:'NETWORK'}};}return {data:{photo_count:row.photo_count}};},
 storage:{from(){return {async upload(path,data,options){assert.equal(options.upsert,false);if(failUpload){failUpload=false;return {error:{statusCode:'503'}};}if(stored.has(path))return {error:{statusCode:'409'}};stored.set(path,data);return {};}};}}};
}
test('partial upload retries resume paths, normalize real images and emit one batch notice',async()=>{
 const db=fakeDb(),input={id,note:'측면',files:[await image(),await image()]};db.failUpload=true;
 await assert.rejects(saveCustomerPhotos(db,portal,input),e=>e.status===503);assert.equal(db.notices,0);
 assert.equal((await saveCustomerPhotos(db,portal,input)).count,2);assert.equal(db.notices,1);assert.equal(db.stored.size,2);
 for(const [path,data]of db.stored){assert.ok(path.startsWith('sites/company/site/request/customer-'));assert.equal((await sharp(data).metadata()).format,'jpeg');}
 assert.equal((await saveCustomerPhotos(db,portal,input)).duplicate,true);assert.equal(db.notices,1);
});
test('lost database response retries as already completed without another storage write or notice',async()=>{
 const db=fakeDb(),input={id,note:'',files:[await image()]};db.loseResponse=true;await assert.rejects(saveCustomerPhotos(db,portal,input));
 assert.equal(db.notices,1);assert.equal((await saveCustomerPhotos(db,portal,input)).duplicate,true);assert.equal(db.stored.size,1);assert.equal(db.notices,1);
});
test('invalid image and changed site status do not create a saved batch or notification',async()=>{
 const db=fakeDb();await assert.rejects(saveCustomerPhotos(db,portal,{id,note:'',files:[new File(['<svg/>'],'photo.jpg',{type:'image/jpeg'})]}),e=>e.status===400);assert.equal(db.stored.size,0);assert.equal(db.notices,0);
 await assert.rejects(saveCustomerPhotos(db,{...portal,site:{status:'scheduled'}},{id,note:'',files:[]}),e=>e.status===403);
});
test('history signs only submission-owned request photos in one batch and never exposes internal paths',async()=>{
 const root=`sites/company/site/request/customer-${id}-`,signed=[];
 const db={from(table){const q={select(){return q},eq(){return q},order(){return q},limit:async()=>({data:[{id,note:'고객 메모',photo_ids:['a','b','c'],completed_at:'2026-10-28T01:00:00Z'}]}),in:async()=>({data:[{id:'a',storage_path:root+'0.jpg'},{id:'b',storage_path:'sites/other/site/request/private.jpg'},{id:'c',storage_path:root+'../secret.jpg'}]})};return q;},storage:{from(){return {async createSignedUrls(paths,ttl){signed.push(...paths);assert.equal(ttl,600);return {data:paths.map(path=>({path,signedUrl:'https://signed.test/photo'}))};}};}}};
 const result=await listCustomerPhotos(db,portal);assert.deepEqual(signed,[root+'0.jpg']);assert.deepEqual(result.batches[0].photos,[{id:'a',url:'https://signed.test/photo'}]);assert.ok(!JSON.stringify(result).includes('storage_path'));
});
