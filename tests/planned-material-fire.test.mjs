import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeFilmBrand,sameFilmBrand} from '../lib/filmBrand.mjs';
import {matchingFilmProducts} from '../lib/matchingFilmProducts.mjs';
import {resolveFilmType,filmCodeInfo} from '../lib/hyundaiFilmCode.js';
const require=createRequire(import.meta.url);
let code;
const source=fs.readFileSync(new URL('../app/api/admin/site-planned-materials/route.js',import.meta.url),'utf8');
if(process.env.BABEL_TEST_ROOT){const b=require(process.env.BABEL_TEST_ROOT+'/core');code=b.transformSync(source,{plugins:[require(process.env.BABEL_TEST_ROOT+'/plugin-transform-modules-commonjs')],babelrc:false,configFile:false}).code;}
else {const swc=require('next/dist/build/swc');await swc.loadBindings();({code}=await swc.transform(source,{jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}}));}
const co='11111111-1111-4111-8111-111111111111',site='22222222-2222-4222-8222-222222222222',mid='33333333-3333-4333-8333-333333333333';
function fixture(owner=true){let saved=null;const selections=[],priceCalls=[];const row={id:mid,brand:'현대보닥',product_code:'S115',unit:'m',price_type:'non_fire',unit_price:5800,film_product_id:'catalog'};
 const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){let mutation=false;const q={select(fields){selections.push([table,fields]);return q},eq(){return q},ilike(){return q},order(){return q},range(){return q},limit(){return q},maybeSingle(){q.single=true;return q},insert(v){saved=v;mutation=true;return q},update(v){saved=v;mutation=true;return q},delete(){mutation=true;return q},then(resolve){let data=table==='profiles'?{role:owner?'owner':'worker',company_id:co,is_active:true}:table==='companies'?{id:co,is_active:true}:table==='sites'?{id:site,status:'in_progress'}:table==='film_products'?[{id:'catalog',brand:'현대보닥',product_code:'S115'}]:mutation?{id:mid,unit_price:saved.unit_price}:q.single?row:[row];return Promise.resolve({data}).then(resolve)}};return q}};
 const exports={};vm.runInNewContext(code,{exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'}},Response,URL,Date,console,require:p=>p.includes('filmBrand')?{normalizeFilmBrand,sameFilmBrand}:p.includes('matchingFilmProducts')?{matchingFilmProducts}:p.includes('hyundaiFilmCode')?{resolveFilmType,filmCodeInfo}:p.includes('plannedDealerPrice')?{plannedDealerPrice:async(db,company,material)=>{priceCalls.push(material.price_type);return material.price_type==='fire'?9000:5800}}:{createClient:()=>db}});
 const call=(method,body={})=>exports[method](new Request('https://app/api?siteId='+site,{method,headers:{authorization:'Bearer test','content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify({siteId:site,id:mid,brand:'현대보닥',product_code:'S115',unit:'m',unit_price:'',...body})})}));
 return {call,selections,priceCalls,get saved(){return saved}};
}
test('saved material fire type and product ID are returned for reopening the editor',async()=>{const f=fixture();const b=await (await f.call('GET')).json();assert.equal(b.materials[0].price_type,'non_fire');assert.equal(b.materials[0].film_product_id,'catalog');});
test('new planned material stores explicit variant and looks up matching purchase price',async()=>{const f=fixture();assert.equal((await f.call('POST',{price_type:'fire'})).status,200);assert.equal(f.saved.price_type,'fire');assert.equal(f.saved.unit_price,9000);assert.equal(f.saved.company_id,co);});
test('ambiguous and contradictory variant choices cannot mutate materials',async()=>{for(const body of [{},{price_type:'fire',product_code:'GS115'}]){const f=fixture();assert.equal((await f.call('POST',body)).status,400);assert.equal(f.saved,null);}});
test('changing fire type cannot accidentally reuse the previous variants cost',async()=>{const f=fixture();assert.equal((await f.call('PATCH',{price_type:'fire',unit_price:5800})).status,200);assert.equal(f.saved.unit_price,9000);assert.equal(f.saved.price_type,'fire');assert.ok(!('quantity' in f.saved));});
test('worker profile cannot save planned material variants',async()=>{const f=fixture(false);assert.equal((await f.call('POST',{price_type:'fire'})).status,403);assert.equal(f.saved,null);});


test('manual Hyundai aliases save canonically and retain the selected catalog ID',async()=>{const f=fixture();assert.equal((await f.call('POST',{brand:'현대 & C',price_type:'non_fire'})).status,200);assert.equal(f.saved.brand,'현대보닥');assert.equal(f.saved.film_product_id,'catalog');});
