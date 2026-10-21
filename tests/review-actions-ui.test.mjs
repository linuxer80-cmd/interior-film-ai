import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as overview from '../lib/reviewOverview.mjs';
const require=createRequire(import.meta.url), swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/admin/SiteWorkReportReview.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(node,predicate)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(child=>all(child,predicate)):[...(predicate(node)?[node]:[]),...all(node.props?.children,predicate)];
const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
async function fixture() {
 let cursor=0,mounted=false,serverStatus='pending',dirty;
 const slots=[],effects=[],posts=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next];},useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},useEffect(fn){if(!mounted)effects.push(fn);}};
 const exports={};
 vm.runInNewContext(code,{exports,React,setTimeout,clearTimeout,AbortController,console:{error(){}},window:{confirm:()=>true},require(path){
  if(path==='react')return React;
  if(path.includes('reviewOverview.mjs'))return overview;
  if(path.includes('useSiteDraft'))return {__esModule:true,default:(_cb,_id,state)=>{dirty=state;}};
  if(path.includes('supabase'))return {supabase:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}}};
  return {__esModule:true,default:()=>null};
 },fetch:async(url,options)=>{
  if(options.method==='POST'){const body=JSON.parse(options.body);posts.push(body);serverStatus=body.action==='approve'?'approved':'rejected';return {ok:true,text:async()=>JSON.stringify({success:true,message:'처리 완료'})};}
  return {ok:true,text:async()=>JSON.stringify({success:true,hasReport:true,report:{id:'r',review_status:serverStatus,work_summary:'시공 완료'},review:{status:serverStatus,approvedAmount:serverStatus==='approved'?500000:null,memo:''},materials:[{quantity:5,unit_price:null}],expenses:[],beforePhotos:[],afterPhotos:[{id:'p'}]})};
 }});
 const render=()=>{cursor=0;return exports.default({siteId:'s'});};
 render();mounted=true;effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));
 return {render,posts,dirty:()=>dirty,buttons:()=>all(render(),n=>n.type==='button')};
}
test('reason chips produce a usable rejection without requiring duplicate typing',async()=>{
 const h=await fixture();
 const box=all(h.render(),node=>node.type==='input'&&node.props.type==='checkbox')[0];
 box.props.onChange({target:{checked:true}});h.render();assert.equal(h.dirty().dirty,true);
 const reject=h.buttons().find(node=>text(node).trim()==='보완 요청');
 await reject.props.onClick();h.render();
 assert.equal(h.posts.length,1);assert.equal(h.posts[0].action,'reject');assert.match(h.posts[0].reviewMemo,/사진 부족:/);assert.equal(h.dirty().dirty,false);
});
test('approval ignores purchase-price omissions and sends one request on a rapid double tap',async()=>{
 const h=await fixture();
 const amount=all(h.render(),node=>node.type==='input'&&node.props.id==='review-amount-s')[0];
 amount.props.onChange({target:{value:'500000'}});h.render();
 const approve=h.buttons().find(node=>text(node).trim()==='승인하기');
 await Promise.all([approve.props.onClick(),approve.props.onClick()]);h.render();
 assert.equal(h.posts.length,1);assert.equal(h.posts[0].approvedAmount,500000);assert.equal(h.posts[0].action,'approve');assert.equal(h.dirty().dirty,false);
});
test('empty rejection is blocked while entered review edits can be explicitly discarded',async()=>{
 const h=await fixture();
 const review=all(h.render(),node=>node.props['aria-label']==='완료보고 검수 처리')[0];
 assert.equal(review.props.hidden,false,'pending report is actionable on the summary screen');
 await h.buttons().find(node=>text(node).trim()==='보완 요청').props.onClick();
 assert.equal(h.posts.length,0);
 assert.equal(h.buttons().find(node=>text(node)==='검수 메모·보완 내용 입력').props['aria-expanded'],true);
 const memo=all(h.render(),node=>node.type==='textarea')[0];memo.props.onChange({target:{value:'보완해주세요'}});h.render();
 assert.equal(h.dirty().dirty,true);h.dirty().discard();h.render();assert.equal(h.dirty().dirty,false);
});
