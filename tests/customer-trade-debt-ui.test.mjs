import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const source=fs.readFileSync(new URL('../app/customer/site/[token]/portal.js',import.meta.url),'utf8');
const {code}=swc.transformSync(source,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
function render(values={}){
 const exports={},React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:()=>['',()=>{}]};
 vm.runInNewContext(code,{exports,React,require(path){if(path==='react')return React;if(path.includes('customerStages'))return {CUSTOMER_STAGES:{before:1,complete:1,care:1}};return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};}});
 return exports.default({token:'test',site:{site_name:'현재 현장'},company:{company_name:'업체'},cases:[],expiresAt:'2030-01-01',stageData:{stage:'complete',complete:true,settled:true,amount:500000,vatAmount:50000,totalAmount:550000,paid:550000,outstanding:0,bankAccount:'테스트 계좌',before:[],after:[],...values}});
}
const trade={clientName:'거래처',previousTotal:80000,count:1,unknownCount:1,totalOutstanding:80000,items:[{siteName:'과거 현장',supplyAmount:100000,vatAmount:10000,totalAmount:110000,paid:30000,outstanding:80000}]};
test('customer trade section keeps bank visible after this site is paid, with previous debt and VAT breakdown',()=>{
 const tree=render({tradeReceivables:trade});const content=text(tree);
 assert.match(content,/이번 현장 입금 완료/);assert.match(content,/이번 현장 남은 금액/);assert.match(content,/확인된 총 미수금/);assert.match(content,/80,000원/);
 assert.match(content,/테스트 계좌/);assert.match(content,/금액 확인 중인 기존 현장 1건/);
 const detail=nodes(tree).find(n=>n.type==='details');assert.match(text(detail),/과거 현장/);assert.match(text(detail),/공급가액100,000원/);assert.match(text(detail),/부가세 \(10%\)10,000원/);assert.match(text(detail),/110,000원/);
});
test('personal customers have no other-site section and trade with unknown current payment has no invented total',()=>{
 assert.equal(nodes(render()).some(n=>n.props?.['aria-label']==='거래처 기존 미수금'),false);
 const unknown=text(render({settled:false,outstanding:null,tradeReceivables:{...trade,totalOutstanding:null}}));assert.match(unknown,/확인된 총 미수금정산 확인 중/);
 const complete=text(render({tradeReceivables:{...trade,unknownCount:0}}));assert.match(complete,/총 입금할 금액80,000원/);
});
