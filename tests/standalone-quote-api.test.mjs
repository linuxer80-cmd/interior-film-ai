import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {completionSeed,normalizeHeader,normalizePendingCompletionItems} from '../lib/completionEstimate.mjs';
const source=fs.readFileSync(new URL('../app/api/admin/standalone-quotes/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ','');
const id='11111111-1111-4111-8111-111111111111';
function setup({role='owner',user='u',company='a',quoteCompany='a',revision=0,linked=null}={}){
 const data={id,company_id:quoteCompany,area_revision:revision,cost_revision:revision,area_document:null,cost_document:null,linked_site_id:linked};
 const writes=[];
 const db={auth:{getUser:async()=>({data:{user:user?{id:user}:null}})},from(table){let filters=[],patch=null,kind='';const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},insert(v){kind='insert';patch=v;return q},update(v){kind='update';patch=v;return q},upsert(v){kind='upsert';patch=v;return Promise.resolve({error:null})},async single(){writes.push(table);return {data:{id},error:null}},async maybeSingle(){let row=table==='profiles'?{id:user,company_id:company,role,is_active:true}:table==='companies'?{id:company,company_name:'업체',is_active:true}:table==='standalone_quotes'?data:null;if(!row||filters.some(([k,v])=>row[k]!==v))return {data:null,error:null};if(kind==='update'){writes.push(table);Object.assign(row,patch)}return {data:row,error:null}},then(resolve){return Promise.resolve({data:[data],error:null}).then(resolve)}};return q},async rpc(){return {data:id,error:null}}};
 const validateQuote=x=>{if(!x||!Array.isArray(x.items))throw Error('bad');return x};
 const ctx=vm.createContext({createClient:()=>db,validateQuote,completionSeed,normalizeHeader,normalizePendingCompletionItems,process:{env:{}},Response,Request,URL,Error,Number,Set,Date,JSON,Object,Array,String});vm.runInContext(source+'\nglobalThis.GET=GET;globalThis.POST=POST;',ctx);
 async function req(method,body,token='Bearer test',type='area',qid=id){let url='https://test/api'+(qid?'?id='+qid+'&type='+type:'');const r=await ctx[method](new Request(url,{method,headers:{authorization:token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,body:await r.json()};}
 return {req,writes,data};
}
test('권한 없는 계정 및 다른 업체 견적 접근을 막는다',async()=>{assert.equal((await setup().req('GET',null,'')).status,401);assert.equal((await setup({role:'worker'}).req('GET')).status,403);assert.equal((await setup({quoteCompany:'other'}).req('GET')).status,404)});
test('부위별 저장은 저장 버전을 검사하고 저장 내용만 변경한다',async()=>{let x=setup();const doc={items:[],vat:'separate'};let result=await x.req('POST',{document:doc,revision:0});assert.equal(result.status,200);assert.equal(result.body.revision,1);assert.deepEqual(x.writes,['standalone_quotes']);assert.equal((await x.req('POST',{document:doc,revision:0})).status,409)});
test('인건비 견적은 잘못된 수량·금액과 이전 버전을 거부한다',async()=>{let x=setup();let body={version:0,header:{},vat:'separate',note:'',items:[{category:'labor',name:'인건비',unit:'공수',quantity:2,unit_price:100000,amount:200000}],pending_items:[]};assert.equal((await x.req('POST',body,'Bearer test','cost')).status,200);assert.equal((await x.req('POST',body,'Bearer test','cost')).status,409);x=setup();body.items[0].amount=2;assert.equal((await x.req('POST',body,'Bearer test','cost')).status,400)});
test('현장에 이미 연결된 견적서는 독립 견적에서 수정되지 않는다',async()=>{const x=setup({linked:id});assert.equal((await x.req('POST',{document:{items:[]},revision:0})).status,409);assert.deepEqual(x.writes,[])});
