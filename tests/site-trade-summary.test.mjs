import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/admin/site-detail/SiteTradeSummary.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
async function fixture({missing=false,personal=false,active=true}={}){
 let cursor=0,mounted=false,reads=0,changes=0;
 const slots=[],effects=[],events=new Map();
 let data={sites:missing?[]:[{id:'s',client_id:personal?null:'c',contact_id:personal?null:'p'}],clients:[{id:'c',name:'거래처A'}],contacts:[{id:'p',name:'김실장'}]};
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],n=>slots[i]=typeof n==='function'?n(slots[i]):n];},useEffect(fn){if(!mounted)effects.push(fn);}};
 const exports={};vm.runInNewContext(code,{exports,React,window:{addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},require(path){return path==='react'?React:{tradeApi:async()=>{reads++;return data;}};}});
 const render=()=>{cursor=0;return exports.default({siteId:'s',active,onChange:()=>changes++});};
 render();mounted=true;effects.forEach(fn=>fn());await new Promise(r=>setImmediate(r));
 return{render,events,reads:()=>reads,changes:()=>changes,setData:value=>data=value};
}
test('settlement shows only saved connection data and a change shortcut, with no editable inputs',async()=>{
 const h=await fixture();assert.match(text(h.render()),/업체 고객/);assert.match(text(h.render()),/거래처A/);assert.match(text(h.render()),/김실장/);
 assert.equal(all(h.render(),n=>['input','select','textarea','form'].includes(n.type)).length,0);
 all(h.render(),n=>n.type==='button'&&text(n)==='거래처 변경 →')[0].props.onClick();assert.equal(h.changes(),1);
 h.setData({sites:[{id:'s',client_id:'c',contact_id:'p2'}],clients:[{id:'c',name:'거래처A'}],contacts:[{id:'p2',name:'이대리'}]});
 await h.events.get('trade-clients-changed')();assert.match(text(h.render()),/이대리/);assert.doesNotMatch(text(h.render()),/김실장/);
});
test('personal connections are explicit; missing reads never masquerade as personal customers',async()=>{
 const h=await fixture({personal:true});assert.match(text(h.render()),/개인 고객/);
 const missing=await fixture({missing:true});assert.match(text(missing.render()),/확인하지 못했습니다/);assert.doesNotMatch(text(missing.render()),/개인 고객/);
 const inactive=await fixture({active:false});assert.equal(inactive.reads(),0);assert.equal(inactive.render(),null);
});
