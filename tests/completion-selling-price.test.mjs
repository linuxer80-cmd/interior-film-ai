import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sellingMaterialPrices} from '../lib/dealerPriceImport.mjs';
import { completionSeed, normalizeHeader } from '../lib/completionEstimate.mjs';
function api({role='owner',company='a',siteCompany='a',status='completed',revision=1,rpcFails=false,customerType=null,prices=[{product_id:'p',price_type:'non_fire',interior_price:9000,consumer_price:12000}],priceFails=false}={}) {
 let saved={document:{items:[],note:''},revision,updated_at:'2026-10-15'}; const writes=[];
 const tables={profiles:[{company_id:company,role,is_active:true}],companies:[{id:company,is_active:true,company_name:'업체'}],sites:[{id:'10000000-0000-0000-0000-000000000001',company_id:siteCompany,status,customer_type:customerType,site_name:'현장'}],site_materials:[{id:'m',film_product_id:'p',price_type:'non_fire'}],film_products:[{id:'p',brand:'영림',product_code:'PS160'}],company_film_selling_prices:prices,work_reports:[]};
 const client={rpc:async(name,args)=>{assert.equal(name,'site_operations');assert.equal(args.p_user,'u');assert.equal(args.p_action,'get');return rpcFails?{error:{message:'failed'}}:{data:{materials:[{id:'m',brand:'영림',code:'PS160',used:8,unit:'m',unitPrice:5000}]}}},auth:{getUser:async()=>({data:{user:{id:'u'}}})},from(table){
 let filters=[],patch;
 const q={order(){return q},select(){return q},eq(k,v){filters.push([k,v]);return q},in(){return q},limit(){return q},insert(v){patch=v;return q},update(v){patch=v;return q},
 async maybeSingle(){
  if(table==='site_completion_estimates') {if(patch){if(filters.some(([k,v])=>k==='revision'&&v!==saved.revision))return {data:null}; writes.push(table);saved={...saved,...patch};}return {data:saved};}
  return {data:(tables[table]||[]).find(r=>filters.every(([k,v])=>r[k]===v||k==='id'&&table==='profiles'))||null};
 },async single(){return q.maybeSingle()},then(resolve,reject){return Promise.resolve({data:tables[table]||[]}).then(resolve,reject)}};return q;
 }};
 const ctx=vm.createContext({sellingMaterialPrices,allPriceRows:async factory=>{if(priceFails)throw Error('failed');return (await factory()).data;},completionSeed,normalizeHeader,createClient:()=>client,process:{env:{}},console:{error(){}},Response,Request,URL,getProfit:async()=>Response.json({sites:[{id:tables.sites[0].id}],breakdown:{material:[],labor:[],expense:[]}})});
 const src=fs.readFileSync(new URL('../app/api/admin/completion-estimate/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ','');
 vm.runInContext(src+'\nglobalThis.post=POST;globalThis.get=GET;',ctx);
 const siteId=tables.sites[0].id;
 const body={siteId,version:1,note:'비고',header:{site_name:'수정 현장'},vat:'separate',items:[{category:'meal',name:'식비',quantity:2,unit:'명',unit_price:10000,amount:20000}]};
 return {writes,body,get:async()=>{const r=await ctx.get(new Request('https://test/api?siteId='+siteId,{headers:{authorization:'Bearer test'}}));return {status:r.status,body:await r.json()}},post:async(value=body,token='Bearer test')=>{let r=await ctx.post(new Request('https://test/api',{method:'POST',headers:{authorization:token,'content-type':'application/json'},body:JSON.stringify(value)}));return {status:r.status,body:await r.json()}}};
}


for(const customerType of [null,'business','personal']) test(`interior selling price applies for ${customerType} customer type`,async()=>{
 const r=await api({customerType}).get();assert.equal(r.status,200);
 const film=r.body.automatic.items.find(x=>x.category==='film');
 assert.equal(film.unit_price,9000);assert.equal(film.amount,72000);
 assert.equal(r.body.saved.version,1);
});
for(const options of [{prices:[]},{priceFails:true}]) test(`missing selling prices never use purchase cost ${JSON.stringify(options)}`,async()=>{
 const r=await api(options).get();assert.equal(r.status,200);
 const film=r.body.automatic.items.find(x=>x.category==='film');
 assert.equal(film.unit_price,null);assert.equal(film.pricePending,true);assert.equal(film.amount,0);
});
