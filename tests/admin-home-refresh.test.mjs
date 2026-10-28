import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url), swc = require('next/dist/build/swc');
await swc.loadBindings();
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];
function fixture(path, props) {
  let cursor=0, calls=0, intervalCalls=0;
  const state=[], effects=[], pending=[], windowEvents={}, documentEvents={};
  const document={hidden:false,addEventListener:(name,fn)=>documentEvents[name]=fn,removeEventListener:(name)=>delete documentEvents[name]};
  const window={addEventListener:(name,fn)=>windowEvents[name]=fn,removeEventListener:(name)=>delete windowEvents[name]};
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect(fn,deps){const i=cursor++;const previous=effects[i];if(!previous||deps.some((v,n)=>!Object.is(v,previous.deps[n])))pending.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
  const exports={};
  const {code}=swc.transformSync(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
  const supabase={auth:{getSession:async()=>({data:{session:{access_token:'token'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
  const reportRequest=async()=>{calls++;return{rows:[],counts:{all:0,review:0,payment:0,materials:0}}};
  const fetch=async()=>{calls++;return{ok:true,json:async()=>({notifications:[]})}};
  vm.runInNewContext(code,{exports,React,document,window,fetch,AbortController,URLSearchParams,Date,setTimeout,clearTimeout,setInterval:()=>{intervalCalls++;return 1;},clearInterval(){},require(p){if(p==='react')return React;if(p.includes('supabase'))return{supabase};if(p.includes('reportClient'))return{reportRequest};if(p.endsWith('.css'))return{__esModule:true,default:{}};throw Error(p);}});
  const render=()=>{cursor=0;return exports.default(props);};
  const flush=async()=>{const tree=render();while(pending.length)pending.shift()();await new Promise(resolve=>setImmediate(resolve));return tree;};
  return{render,flush,windowEvents,documentEvents,document,get calls(){return calls;},get intervalCalls(){return intervalCalls;}};
}
test('admin labor notifications refresh on opening and returning, without a timer',async()=>{
 const f=fixture('app/components/LaborNotifications.js',{poll:false});await f.flush();assert.equal(f.calls,1);assert.equal(f.intervalCalls,0);
 const tree=f.render();all(tree,n=>n.type==='button')[0].props.onClick();await f.flush();assert.equal(f.calls,2);
 f.document.hidden=true;f.windowEvents.focus();await new Promise(r=>setImmediate(r));assert.equal(f.calls,2);
 f.document.hidden=false;f.documentEvents.visibilitychange();await new Promise(r=>setImmediate(r));assert.equal(f.calls,3);
});
test('other screens keep their existing labor notification timer',async()=>{
 const f=fixture('app/components/LaborNotifications.js',{view:'worker'});await f.flush();assert.equal(f.intervalCalls,1);assert.equal(f.calls,1);
});
test('closing tasks refresh on expansion and on return, without a timer',async()=>{
 const f=fixture('app/admin/AdminClosingTasks.js',{companyId:'co'});await f.flush();assert.equal(f.calls,1);assert.equal(f.intervalCalls,0);
 f.render().props.onToggle({currentTarget:{open:true}});await f.flush();assert.equal(f.calls,2);
 f.windowEvents.focus();await f.flush();assert.equal(f.calls,3);
});
