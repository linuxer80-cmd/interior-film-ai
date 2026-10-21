import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {materialTrips} from '../lib/materialTripScope.mjs';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/components/FilmRollInventory.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
async function fixture(){
 let cursor=0;const slots=[],effects=[],writes=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v});},useCallback(fn){cursor++;return fn;},useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||deps?.some((v,j)=>v!==old[j]))effects.push(fn);slots[i]=deps;}};
 const exports={},data={canIssue:true,canReturnRoll:true,materials:[{id:'m',brand:'영림',code:'PW803'}],rolls:[],trips:[{id:'trip',site_id:'s',material_id:'m',roll_id:'r',brand:'영림',product_code:'PW803',issued:20,returned:null,revision:4,label:'R1'},{id:'other',site_id:'other',material_id:'m',roll_id:'foreign',issued:99,returned:null}]};
 vm.runInNewContext(code,{exports,React,console,confirm:()=>true,crypto:{randomUUID:()=> 'same-request'},window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},require(path){if(path==='react')return React;if(path.includes('materialTripScope'))return{materialTrips};if(path.includes('reportClient'))return{reportRequest:async(_url,body)=>{if(body){writes.push(body);data.trips[0].returned=Number(body.remaining);}return data;}};return{__esModule:true,default:()=>null,filmFireLabel:()=>''};}});
 const render=()=>{cursor=0;const tree=exports.default({siteId:'s',focusMaterialId:'m',completionMode:true});effects.splice(0).forEach(fn=>fn());return tree;};render();await new Promise(r=>setImmediate(r));render();return{render,writes,button:label=>all(render(),n=>n.type==='button'&&text(n).trim()===label)[0]};
}
test('completion opens only the selected site rolls; all-used prefills zero and saves once with revision',async()=>{const f=await fixture();assert.equal(all(f.render(),n=>n.type==='input'&&n.props.type==='number').length,1);f.button('전량 사용 · 남은 길이 0m').props.onClick();assert.equal(f.writes.length,0);const save=f.button('전량 사용 저장');save.props.onClick();save.props.onClick();await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,1);assert.equal(f.writes[0].remaining,'0');assert.equal(f.writes[0].revision,4);assert.equal(f.writes[0].rollId,'r');assert.equal(f.writes[0].action,'return');});
test('discarding an unsaved return never writes or changes the stored movement',async()=>{const f=await fixture();f.button('전량 사용 · 남은 길이 0m').props.onClick();f.button('입력 취소 · 저장된 기록 유지').props.onClick();assert.equal(all(f.render(),n=>n.type==='input'&&n.props.type==='number')[0].props.value,'');assert.equal(f.writes.length,0);});
