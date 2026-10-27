import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createFilmStockReader} from '../lib/filmStockReader.mjs';
import {materialTrips} from '../lib/materialTripScope.mjs';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/components/FilmRollInventory.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
const tick=()=>new Promise(r=>setImmediate(r));
test('loading is not shown as zero returns, duplicate resume events dedupe, timeout releases refresh and retry shows saved rolls',async()=>{
  let cursor=0;const slots=[],effects=[],cleanups=[],events={},calls=[];
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(value){const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},
    useCallback(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!same(slots[i],deps)){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}};
  const target={addEventListener:(name,fn)=>{events[name]=fn;},removeEventListener:name=>{delete events[name];}};
  const exports={};vm.runInNewContext(code,{exports,React,AbortController,console,setTimeout,clearTimeout,
    window:target,document:{...target,visibilityState:'visible'},require:p=>p==='react'?React:p.includes('filmStockReader')?{createFilmStockReader:request=>createFilmStockReader(request,{timeoutMs:20})}:p.includes('materialTripScope')?{materialTrips}:p.includes('reportClient')?{reportRequest:(path,_body,options)=>{
      calls.push({path,options});if(calls.length===1)return new Promise(()=>{});
      return Promise.resolve({canIssue:true,canReturnRoll:true,materials:[{id:'m'}],rolls:[],trips:[{site_id:'s',material_id:'m',roll_id:'r',issued:40,returned:null}]});
    }}:{__esModule:true,default:()=>null,filmFireLabel:()=>''}});
  const render=()=>{cursor=0;const tree=exports.default({siteId:'s',focusMaterialId:'m'});effects.splice(0).forEach(f=>f());return tree;};
  try {
    let tree=render();assert.match(text(tree),/자재 반납 \(확인 중\)/);assert.doesNotMatch(text(tree),/자재 반납 \(0\)/);
    events.focus();events.visibilitychange();await tick();assert.equal(calls.length,1);assert.match(calls[0].path,/materialId=m$/);
    await new Promise(r=>setTimeout(r,35));tree=render();assert.match(text(tree),/재고 조회가 지연/);
    const refresh=all(tree,n=>n.type==='button'&&text(n)==='새로고침')[0];assert.equal(refresh.props.disabled,false);
    refresh.props.onClick();await tick();tree=render();assert.match(text(tree),/자재 반납 \(1\)/);assert.doesNotMatch(text(tree),/재고 조회가 지연/);
  } finally {cleanups.forEach(fn=>fn?.());}
});
