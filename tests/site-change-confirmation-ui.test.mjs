import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Project tests use Next's bundled SWC; an external Babel path may be supplied for isolated verification.
function compile(source){
 if(process.env.BABEL_TEST_ROOT){const b=require(process.env.BABEL_TEST_ROOT+'/core');return b.transformSync(source,{plugins:[[require(process.env.BABEL_TEST_ROOT+'/plugin-transform-react-jsx'),{pragma:'h',pragmaFrag:'Fragment'}]],babelrc:false,configFile:false}).code;}
 const swc=require('next/dist/build/swc');return swc.transformSync(source,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic',pragma:'h',pragmaFrag:'Fragment'}}},module:{type:'commonjs'}}).code;
}
function harness(owner=false){
 const data={owner,materials:[],events:[{id:'event-1',at:'2026-10-21T00:00:00Z',message:'시공 일정이 변경되었습니다.',receipts:[{name:'시공자 A',confirmedAt:null},{name:'시공자 B',confirmedAt:'2026-10-21T01:00:00Z'}]}]};
 const source=fs.readFileSync(new URL('../app/components/SiteOperations.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export default function','function');
 let states=[data],index=0;const sent=[];
 const h=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)});
 const useState=value=>{const i=index++;if(!(i in states))states[i]=typeof value==='function'?value():value;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];};
 const snapshot={site:{site_name:'현장',address:'인천시',work_dates:['2026-10-22']},assignments:[],materials:[]};
 const call=async(url,options)=>{const body=JSON.parse(options.body);sent.push(body);return {ok:true,json:async()=>body.action==='latest'?{snapshot,version:'current-version'}:{...data,events:[]}};};
 const compiled=compile(source);const fn=new Function('h','Fragment','useState','useEffect','useCallback','useRef','supabase','fetch',compiled+';return SiteOperations;')(h,'fragment',useState,()=>{},f=>f,value=>({current:value}),{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}},call);
 return {render(){index=0;return fn({siteId:'site',mode:'changes',compact:true});},sent};
}
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...tree.children.flatMap(nodes)];}
const text=n=>typeof n==='string'?n:n&&typeof n==='object'?n.children.map(text).join(''):'';
test('worker sees pending change immediately and confirms the reviewed version',async()=>{const h=harness();let tree=h.render();const history=nodes(tree).find(n=>n.type==='details');assert.equal(history.props.open,true);const latest=nodes(tree).find(n=>n.type==='button'&&text(n).includes('최신 내용 보기'));await latest.props.onClick();tree=h.render();assert(text(tree).includes('주소: 인천시'));const confirm=nodes(tree).find(n=>n.type==='button'&&text(n).includes('확인했어요'));await confirm.props.onClick();assert.deepEqual(h.sent.map(x=>x.action),['latest','confirm']);assert.equal(h.sent[1].reviewVersion,'current-version');});
test('manager sees both unconfirmed and confirmed installer names',()=>{const tree=harness(true).render();assert(text(tree).includes('시공자 A'));assert(text(tree).includes('시공자 B'));assert(text(tree).includes('확인 현황 보기'));assert(!text(tree).includes('최신 내용 보기'));});
