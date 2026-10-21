import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const all=(node,predicate)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(child=>all(child,predicate)):[...(predicate(node)?[node]:[]),...all(node.props?.children,predicate)];
const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
function fixture(name,data){
 let cursor=0,mounted=false;const slots=[],effects=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return[slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next];},useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},useEffect(fn){if(!mounted)effects.push(fn);}};
 const exports={};
 const {code}=swc.transformSync(fs.readFileSync(new URL('../app/admin/'+name+'.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
 vm.runInNewContext(code,{exports,React,URLSearchParams,AbortController,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},document:{hidden:false,addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},fetch:async()=>({ok:true,json:async()=>data}),require(path){
  if(path==='react')return React;
  if(path.endsWith('.css'))return {__esModule:true,default:{root:'root',toggle:'toggle',contents:'contents'}};
  if(path.includes('reportClient'))return{reportRequest:async()=>data};
  if(path.includes('supabase'))return{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}}};
  return{__esModule:true,default:path};
 }});
 const render=()=>{cursor=0;return exports.default({companyId:'co'});};
 return{render,mount:async()=>{render();mounted=true;effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));}};
}
test('today title and counts open the large view; closing preserves the home and refreshes it',async()=>{
 const h=fixture('AdminHomeSummary',{today:'2026-10-21',todaySites:[{siteId:'s',name:'송도지식산업센터',workerCount:2,hasLeader:true}],tasks:[],counts:{review:0}});
 await h.mount();
 const title=all(h.render(),n=>n.type==='button'&&text(n)==='오늘 할 일')[0];assert.equal(title.props['aria-expanded'],false);
 title.props.onClick();
 let tree=h.render();const dialog=all(tree,n=>typeof n.type==='string'&&n.type.endsWith('AdminTodayDialog'))[0];assert.ok(dialog);
 assert.ok(text(tree).includes('송도지식산업센터'));
 dialog.props.onClose();tree=h.render();assert.equal(all(tree,n=>typeof n.type==='string'&&n.type.endsWith('AdminTodayDialog')).length,0);
 const counts=all(tree,n=>n.type==='button'&&n.props.className==='counts')[0];counts.props.onClick();
 assert.equal(all(h.render(),n=>typeof n.type==='string'&&n.type.endsWith('AdminTodayDialog')).length,1);
});
test('closing sites start collapsed and expanding exposes the complete filtered list and original links',async()=>{
 const rows=Array.from({length:7},(_,i)=>({siteId:'s'+i,name:'현장'+i,actions:[{id:'payment',menu:'settlement',section:'settlement',message:'미수금 있음',label:'입금 등록'}]}));
 const h=fixture('AdminClosingTasks',{rows,counts:{all:7,payment:7,review:0,materials:0}});await h.mount();
 const tree=h.render();assert.equal(tree.type,'details');assert.notEqual(tree.props.open,true);
 assert.match(text(all(tree,n=>n.type==='summary')[0]),/7건/);
 assert.equal(all(tree,n=>n.type==='article').length,7);
 assert.match(all(tree,n=>n.type==='a')[0].props.href,/site=s0&section=settlement/);
 all(tree,n=>n.type==='button'&&text(n)==='검수 0')[0].props.onClick();assert.equal(all(h.render(),n=>n.type==='article').length,0);
});

test('large today view locks background scroll, focuses its close control and supports Escape',()=>{
 const {code}=swc.transformSync(fs.readFileSync(new URL('../app/admin/AdminTodayDialog.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
 let closed=0,focused=0,restored=0;const effects=[],exports={};
 const first={focus:()=>focused++},last={focus:()=>focused++,getClientRects:()=>[1]};
 first.getClientRects=()=>[1];
 const document={body:{style:{overflow:'auto'}},activeElement:{isConnected:true,focus:()=>restored++}};
 const element={querySelector:()=>first,querySelectorAll:()=>[first,last]};
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useRef:()=>({current:element}),useEffect:fn=>effects.push(fn)};
 vm.runInNewContext(code,{exports,React,document,require(path){
  if(path==='react')return React;
  if(path==='react-dom')return{createPortal:tree=>tree};
  if(path.includes('useAdminOverlayBack'))return{__esModule:true,default:(_open,onClose)=>onClose};
  return{__esModule:true,default:()=>null};
 }});
 const tree=exports.default({companyId:'co',onClose:()=>closed++});const cleanup=effects[0]();
 assert.equal(document.body.style.overflow,'hidden');assert.equal(focused,1);
 const dialog=all(tree,n=>n.props.role==='dialog')[0];
 dialog.props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(closed,1);
 document.activeElement=last;let prevented=0;dialog.props.onKeyDown({key:'Tab',shiftKey:false,preventDefault(){prevented++;}});assert.equal(prevented,1);
 cleanup();assert.equal(document.body.style.overflow,'auto');assert.equal(restored,1);
});
