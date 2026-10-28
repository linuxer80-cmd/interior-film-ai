import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomepageSignedUrls} from '../lib/homepageSignedUrls.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

function fixture(){
 let time=100000, count=0, fail=false;const entries=new Map();
 const cache=(fn,_keys,options)=>{assert.equal(options.revalidate,120);return async(...args)=>{const key=JSON.stringify(args);if(!entries.has(key))entries.set(key,await fn(...args));return entries.get(key);};};
 const sign=async(scope,paths)=>{count++;if(fail)throw Error('storage error');return paths.map(path=>({path,signedUrl:`${scope.companyId}:${path}:${count}`}));};
 return {load:createHomepageSignedUrls({cache,sign,now:()=>time}),setTime:value=>time=value,setFail:value=>fail=value,get count(){return count}};
}
test('reuse signatures only for the same company and currently eligible paths',async()=>{
 const f=fixture(),a={url:'https://one.example',companyId:'a'},b={url:'https://one.example',companyId:'b'};
 const first=await f.load(a,['photo-b','photo-a','photo-a']);assert.equal(f.count,1);assert.deepEqual(first.map(x=>x.path),['photo-a','photo-b']);
 assert.deepEqual(await f.load(a,['photo-a','photo-b']),first);assert.equal(f.count,1);
 await f.load(b,['photo-a','photo-b']);assert.equal(f.count,2);
 assert.deepEqual(await f.load(a,[]),[]);assert.equal(f.count,2);
 const changed=await f.load(a,['photo-b']);assert.equal(f.count,3);assert.deepEqual(changed.map(x=>x.path),['photo-b']);
});
test('old cached signatures are refreshed before their 30 minute expiry',async()=>{
 const f=fixture(),scope={url:'https://one.example',companyId:'a'};const a=await f.load(scope,['photo']);
 f.setTime(100000+20*60*1000);const b=await f.load(scope,['photo']);assert.equal(f.count,2);assert.notEqual(a[0].signedUrl,b[0].signedUrl);
});
test('signing failures are not stored as successful results',async()=>{
 const f=fixture(),scope={url:'https://one.example',companyId:'a'};f.setFail(true);
 await assert.rejects(f.load(scope,['photo']),/storage error/);f.setFail(false);
 const result=await f.load(scope,['photo']);assert.equal(result.length,1);
});

test('homepage checks publication afresh even when photo signatures are cached',async()=>{
 const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
 const source=fs.readFileSync(new URL('../lib/loadCustomerHomepage.js',import.meta.url),'utf8');
 const {code}=swc.transformSync(source,{jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
 const records={companies:{id:'company',slug:'gibun',is_active:true,company_name:'업체'},company_settings:{company_id:'company'},company_public_profiles:{company_id:'company',is_published:true,design_id:'style'},company_public_cases:[{id:'case',company_id:'company',is_published:true,title:'시공',before_paths:['before'],after_paths:['after']}]};
 let signed=0,profileQueries=0;const entries=new Map();
 const db={from(table){const filters=[];return{select(){if(table==='company_public_profiles')profileQueries++;return this;},eq(k,v){filters.push([k,v]);return this;},order(){return this;},maybeSingle:async()=>({data:filters.every(([k,v])=>records[table]?.[k]===v)?records[table]:null,error:null}),limit:async()=>({data:records[table].filter(row=>filters.every(([k,v])=>row[k]===v)),error:null})};},storage:{from:()=>({createSignedUrls:async paths=>{signed++;return{data:paths.map(path=>({path,signedUrl:`url-${path}`})),error:null}}})}};
 const exports={};vm.runInNewContext(code,{exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'}},Set,Map,Date,require(name){
  if(name==='server-only')return{};if(name==='@supabase/supabase-js')return{createClient:()=>db};
  if(name==='next/cache')return{unstable_cache:fn=>async(...args)=>{const key=JSON.stringify(args);if(!entries.has(key))entries.set(key,await fn(...args));return entries.get(key);}};
  if(name.includes('homepageSignedUrls'))return{createHomepageSignedUrls};
  if(name.includes('showcaseValidation'))return{SHOWCASE_BUCKET:'showcase',publishedCases:rows=>rows};throw Error(name);
 }});
 const load=exports.loadCustomerHomepage;
 let page=await load('gibun');assert.equal(page.cases.length,1);assert.equal(page.profile.design_id,'style');assert.equal(signed,1);assert.equal(profileQueries,1);
 page=await load('gibun');assert.equal(page.cases.length,1);assert.equal(signed,1);assert.equal(profileQueries,2);
 records.company_public_profiles.is_published=false;page=await load('gibun');assert.equal(page.profile,null);assert.equal(page.cases.length,0);assert.equal(signed,1);
 records.company_public_profiles.is_published=true;records.company_public_cases[0].is_published=false;page=await load('gibun');assert.equal(page.cases.length,0);assert.equal(signed,1);
});
