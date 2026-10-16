import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {prepareProfilePhoto,PROFILE_PHOTO_LIMIT} from '../lib/profilePhoto.mjs';

async function browser(run,{decode=true,sizes=[100000]}={}){
 const originals=new Map(['Image','document'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 const stats={revoked:0,qualities:[],width:0,height:0};
 const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob(callback,_type,quality){stats.qualities.push(quality);stats.width=this.width;stats.height=this.height;callback(new Blob([new Uint8Array(sizes.shift()??100000)],{type:'image/jpeg'}));}};
 globalThis.document={createElement:()=>canvas};
 globalThis.Image=class{naturalWidth=4000;naturalHeight=3000;set src(_v){queueMicrotask(()=>decode?this.onload?.():this.onerror?.());}};
 URL.createObjectURL=()=> 'blob:profile-test';URL.revokeObjectURL=()=>stats.revoked++;
 try{await run(stats);}finally{
  URL.createObjectURL=create;URL.revokeObjectURL=revoke;
  for(const [k,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k];}
 }
}
test('large phone photo is resized and normalized below the server limit',async()=>{
 await browser(async stats=>{
  const result=await prepareProfilePhoto(new File([new Uint8Array(6*1024*1024)],'camera.jpg',{type:'image/jpeg'}));
  assert.equal(result.type,'image/jpeg');assert.ok(result.size<=PROFILE_PHOTO_LIMIT);
  assert.equal(stats.width,1024);assert.equal(stats.height,768);assert.equal(stats.revoked,1);
 });
});
test('compression retries at lower quality when necessary',async()=>{
 await browser(async stats=>{
  const result=await prepareProfilePhoto(new File(['image'],'photo.png',{type:'image/png'}));
  assert.ok(result.size<=PROFILE_PHOTO_LIMIT);assert.deepEqual(stats.qualities,[0.9,0.75]);
 },{sizes:[PROFILE_PHOTO_LIMIT+1,100000]});
});
test('unsupported decoding gives actionable feedback and releases the preview URL',async()=>{
 await browser(async stats=>{
  await assert.rejects(prepareProfilePhoto(new File(['heic'],'photo.heic',{type:'image/heic'})),/JPG·PNG/);
  assert.equal(stats.revoked,1);
 },{decode:false});
});
test('empty and excessive source files are rejected before decoding',async()=>{
 await assert.rejects(prepareProfilePhoto({size:0}),/다시 선택/);
 await assert.rejects(prepareProfilePhoto({size:21*1024*1024}),/20MB/);
});

const route=readFileSync(new URL('../app/api/labor-market/route.js',import.meta.url),'utf8')
 .replace(/^import .*;$/gm,'').replaceAll('export ','');
function uploadFixture({cleanupFails=false,updateFails=false}={}){
 const calls=[];
 const storage={upload:async()=>{calls.push('upload');return {data:{},error:null};},
  remove:async()=>{calls.push('remove');if(cleanupFails)throw Error('cleanup unavailable');return {error:null};},
  createSignedUrl:async()=>{calls.push('sign');return {data:{signedUrl:'https://storage.test/new-photo.jpg'},error:null};}};
 const db={storage:{from:()=>storage},from:()=>{const q={select(){return q;},eq(){return q;},update(){return q;},maybeSingle:async()=>({data:{photo_path:'old.jpg'},error:null}),single:async()=>({data:updateFails?null:{user_id:'worker'},error:updateFails?{code:'42501'}:null})};return q;}};
 const ctx=vm.createContext({Response,crypto:{randomUUID},console:{error(){},warn(){}},fail:(message,status=400)=>Object.assign(Error(message),{status}),json:(body,status=200)=>Response.json(body,{status}),db});
 vm.runInContext(route+"\nauth=async()=>({db,user:{id:'worker'},companyId:null});globalThis.post=POST;",ctx);
 const request=()=>{const body=new FormData();body.append('photo',new File([new Uint8Array([255,216,255,0])],'profile.jpg',{type:'image/jpeg'}));return new Request('https://test/api/labor-market',{method:'POST',body});};
 return {calls,post:()=>ctx.post(request())};
}
test('saved upload returns its new image even if old-image cleanup fails',async()=>{
 const f=uploadFixture({cleanupFails:true});const response=await f.post();
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,photo_url:'https://storage.test/new-photo.jpg'});
 assert.deepEqual(f.calls,['upload','remove','sign']);
});
test('failed profile update is not reported as a successful photo change',async()=>{
 const f=uploadFixture({updateFails:true});const response=await f.post();
 assert.equal(response.status,503);assert.ok((await response.json()).error);
 assert.deepEqual(f.calls,['upload','remove']);
});
