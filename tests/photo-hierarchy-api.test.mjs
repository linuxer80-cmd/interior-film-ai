import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as hierarchy from '../lib/photoHierarchy.mjs';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/api/super-admin/photo-data/route.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
const user='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003';
function fixture({admin=true,photo={},ai=false,revision=0}={}){
 const rpc=[],tables=[],fetches=[];
 const row={id,company_id:company,revision,review_status:'unclassified',photo_stage:'after',targets:[],storage_path:'history/photo.jpg',...photo};
 const db={auth:{getUser:async()=>({data:{user:{id:user}}})},from(table){tables.push(table);const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:table==='super_admins'?(admin?{user_id:user}:null):row})};return q;},storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'https://storage.test/image.jpg'}))})})},rpc:async(name,args)=>{rpc.push({name,args});return {data:{...args.p_body,photo_id:id,revision:revision+1}};}};
 const exports={};vm.runInNewContext(code,{exports,Response,URL,AbortSignal,console,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://app.supabase.co',OPENAI_API_KEY:'test'}},require(path){if(path.includes('supabase-js'))return{createClient:()=>db};if(path==='node:crypto')return{randomUUID:()=>company};if(path.includes('photoHierarchy'))return hierarchy;throw Error(path);},fetch:async(url,options)=>{fetches.push({url,body:JSON.parse(options.body)});assert.equal(ai,true);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({targets:[{...hierarchy.newTarget(user),price:500000,space:'주거공간',kind:'욕실문',shapes:['평판형'],components:['문·문틀 세트'],damage:'파손 없음(관리자 확인)'}]})}]}]});}});
 const post=b=>exports.POST(new Request('https://app.test/api/super-admin/photo-data',{method:'POST',headers:{authorization:'Bearer token'},body:JSON.stringify(b)}));
 return{...exports,post,rpc,tables,fetches};
}
test('photo classification APIs deny unauthenticated and ordinary accounts before accessing photos or AI',async()=>{
 const f=fixture({admin:false});assert.equal((await f.GET(new Request('https://app.test/api/super-admin/photo-data'))).status,401);
 assert.equal((await f.post({action:'analyze',photoId:id,revision:0})).status,403);assert.deepEqual(f.tables,['super_admins']);assert.equal(f.fetches.length,0);assert.equal(f.rpc.length,0);
});
test('save validates the target taxonomy, preserves null price, and passes verified actor and expected revision',async()=>{
 const f=fixture();const target={...hierarchy.newTarget(user),kind:'욕실문'};
 const result=await f.post({action:'save',photoId:id,revision:0,photoStage:'after',status:'reviewed',targets:[target],userId:company});assert.equal(result.status,200);
 assert.equal(f.rpc.length,1);assert.equal(f.rpc[0].args.p_user,user);assert.equal(f.rpc[0].args.p_revision,0);assert.equal(f.rpc[0].args.p_body.targets[0].price,null);
 const bad=await f.post({action:'save',photoId:id,revision:0,photoStage:'after',status:'reviewed',targets:[{...target,kind:'wrong'}]});assert.equal(bad.status,400);assert.equal(f.rpc.length,1);
});
test('AI stores only an unreviewed proposal without prices and never overwrites existing classifications',async()=>{
 const f=fixture({ai:true});const res=await f.post({action:'analyze',photoId:id,revision:0});assert.equal(res.status,200);assert.equal(f.fetches.length,1);
 const body=f.rpc[0].args.p_body;assert.equal(body.status,'draft');assert.equal(body.targets[0].price,null);assert.equal(body.targets[0].damage,'파손 미관찰');assert.equal(body.photoStage,'after');
 const existing=fixture({photo:{review_status:'reviewed'}});assert.equal((await existing.post({action:'analyze',photoId:id,revision:0})).status,409);assert.equal(existing.fetches.length,0);
 const stale=fixture({revision:1});assert.equal((await stale.post({action:'analyze',photoId:id,revision:0})).status,409);assert.equal(stale.rpc.length,0);
});
test('AI cannot be pointed at a user-supplied external image URL',async()=>{
 const f=fixture({photo:{storage_path:'https://evil.test/secret'}});const res=await f.post({action:'analyze',photoId:id,revision:0,imageUrl:'https://evil.test/other'});assert.equal(res.status,400);assert.equal(f.fetches.length,0);assert.equal(f.rpc.length,0);
});

test('quota proxy counts AI analysis only, not manual classification or price saves',async()=>{
 const {code:proxyCode}=swc.transformSync(fs.readFileSync(new URL('../proxy.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
 let calls=0;const exports={};vm.runInNewContext(proxyCode,{exports,Headers,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test'}},require(path){if(path.includes('aiQuota'))return{checkAiRequestQuota:async()=>calls++};if(path==='next/server')return{NextResponse:{next:()=>({next:true}),json:(body,opts)=>({body,...opts})}};if(path==='node:crypto')return require('node:crypto');throw Error(path);}});
 for(const action of ['save','analyze']){
  const req=new Request('https://app.test/api/super-admin/photo-data',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test'},body:JSON.stringify({action,photoId:id,revision:0})});req.nextUrl=new URL(req.url);assert.equal((await exports.proxy(req)).next,true);
  assert.equal(calls,action==='save'?0:1);
 }
});
