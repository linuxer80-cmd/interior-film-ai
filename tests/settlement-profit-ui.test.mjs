import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {profitState} from '../lib/settlementFlow.mjs';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/components/SiteSettlementProfit.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
async function fixture({pending=false,failed=false}={}){
 let cursor=0,mounted=false;const slots=[],effects=[],calls=[],navigations=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return[slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next];},useEffect(fn){if(!mounted)effects.push(fn);}};
 const exports={};
 vm.runInNewContext(code,{exports,React,setTimeout,clearTimeout,AbortController,window:{addEventListener(){},removeEventListener(){}},require(path){
   if(path==='react')return React;
   if(path.includes('settlementFlow'))return{profitState};
   if(path.includes('siteRevenue'))return{revenueSourceLabel:()=> '계약금액'};
   return{reportRequest:async url=>{calls.push(url);if(failed)throw Error('조회 실패');return{sites:[{id:'site-1',revenue:2000000,labor:800000,material:400000,expense:100000,profit:700000,materialPending:pending}],breakdown:{}};}};
 }});
 const render=()=>{cursor=0;return exports.default({siteId:'site-1',onNavigate:(...args)=>navigations.push(args)});};
 render();mounted=true;effects.forEach(fn=>fn());await new Promise(r=>setImmediate(r));
 return{render,calls,navigations};
}
test('scoped cost view hides profit while costs are missing and links to their existing editor',async()=>{
 const h=await fixture({pending:true});assert.deepEqual(h.calls,['/api/admin/profit?siteId=site-1']);
 const result=all(h.render(),n=>n.props.className==='result')[0];assert.equal(text(result),'수익 확인 필요확인 필요');
 const link=all(h.render(),n=>n.type==='button'&&text(n)==='자재 단가·사용량 확인 →')[0];link.props.onClick();
 assert.equal(h.navigations[0][0],'materials');assert.equal(h.navigations[0][1].id,'price');
});
test('confirmed cost shows calculated profit while a failed fetch shows an error, never zero profit',async()=>{
 const h=await fixture();assert.match(text(all(h.render(),n=>n.props.className==='result')[0]),/700,000원/);
 const bad=await fixture({failed:true});assert.match(text(bad.render()),/조회 실패/);assert.equal(all(bad.render(),n=>n.props.className==='result').length,0);
});
