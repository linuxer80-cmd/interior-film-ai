import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const {code} = swc.transformSync(fs.readFileSync(new URL('../app/admin/site-detail/SiteBasicInfo.js', import.meta.url), 'utf8'), {
  jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}}, module:{type:'commonjs'},
});
function fixture(save = async () => ({success:true})) {
  const slots = []; let cursor = 0, changed = false, effects = [], tree, draft;
  const React = {
    createElement:(type, props, ...children) => ({type, props:{...props, children}}),
    useState(value) { const i=cursor++; if (!(i in slots)) slots[i]=value; return [slots[i], next => { const value=typeof next==='function'?next(slots[i]):next; if(!Object.is(value,slots[i])) {slots[i]=value;changed=true;} }]; },
    useRef(value) {const i=cursor++; return slots[i] ?? (slots[i]={current:value});},
    useEffect(fn,deps) {const i=cursor++, old=slots[i]; if(!old || deps.some((value,n)=>!Object.is(value,old[n]))) {slots[i]=deps;effects.push(fn);} },
  };
  const exports = {};
  vm.runInNewContext(code, {exports, React, console:{error(){}}, window:{confirm:()=>true}, require(path) {
    if(path==='react') return React;
    if(path.includes('useSiteDraft')) return {__esModule:true,default:(_cb,_id,value)=>{draft=value;}};
    if(path.includes('siteDetailUtils')) return {getLeader:()=>null,getMembers:()=>[],formatWon:String};
    return {__esModule:true,default:()=>null};
  }});
  let props = {site:{id:'s',site_name:'원래 현장',customer_name:'고객'}, updateSiteBasicInfo:save};
  const render = patch => {
    props = {...props,...patch};
    for(let n=0;n<20;n++) {cursor=0;changed=false;effects=[];tree=exports.default(props); for(const fn of effects)fn(); if(!changed)return tree;}
    throw Error('render loop');
  };
  render();
  return {render, draft:()=>draft, tree:()=>tree, props:()=>props};
}
function find(node,predicate) {
  if(!node)return null;
  if(Array.isArray(node)) {for(const child of node){const result=find(child,predicate);if(result)return result;}return null;}
  if(typeof node!=='object')return null;
  if(predicate(node))return node;
  return find(node.props?.children,predicate);
}
const text = node => !node ? '' : Array.isArray(node)?node.map(text).join('') : typeof node==='object'?text(node.props?.children):String(node);
const field = (h,label) => find(find(h.tree(), n=>n.props?.label===label), n=>n.type==='input');
function edit(h) {find(h.tree(),n=>n.type==='button' && text(n)==='현장정보 수정').props.onClick();h.render();}

test('editing survives refreshed site props, returning to the original value clears dirty state', () => {
  const h=fixture(); edit(h);
  assert.equal(h.draft().dirty,false);
  field(h,'현장명').props.onChange({target:{value:'수정한 현장'}});h.render();
  assert.equal(h.draft().dirty,true);
  h.render({site:{...h.props().site,site_name:'서버에서 새로고침'}});
  assert.equal(field(h,'현장명').props.value,'수정한 현장');
  field(h,'현장명').props.onChange({target:{value:'원래 현장'}});h.render();
  assert.equal(h.draft().dirty,false);
});
test('failed save retains the draft; successful save clears dirty and pending with distinct feedback', async () => {
  let resolve;
  const h=fixture(()=>new Promise(r=>{resolve=r;})); edit(h);
  field(h,'현장명').props.onChange({target:{value:'수정본'}});h.render();
  let request=find(h.tree(),n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();
  assert.equal(h.draft().pending,true);
  resolve({success:false,error:'실패'});await request;h.render();
  assert.equal(h.draft().dirty,true);assert.equal(h.draft().pending,false);
  assert.equal(field(h,'현장명').props.value,'수정본');
  request=find(h.tree(),n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();
  resolve({success:true});await request;h.render();
  assert.equal(h.draft().dirty,false);assert.equal(h.draft().pending,false);
  assert.match(find(h.tree(),n=>typeof n.props?.message==='string').props.message,/기본정보가 저장되었습니다/);
});
test('explicit discard restores current server values without saving', () => {
  let saves=0;const h=fixture(async()=>{saves++;return {success:true};});edit(h);
  field(h,'현장명').props.onChange({target:{value:'취소할 내용'}});h.render();
  h.render({site:{...h.props().site,site_name:'최신 저장본'}});
  h.draft().discard();h.render();
  assert.equal(h.draft().dirty,false);assert.equal(saves,0);
  edit(h);assert.equal(field(h,'현장명').props.value,'최신 저장본');
});

test('status selection participates in draft and saves with original status',async()=>{
 let payload;const h=fixture(async value=>{payload=value;return {success:true};});
 h.render({site:{...h.props().site,status:'scheduled'}});edit(h);
 const select=()=>find(h.tree(),n=>n.type==='select'&&n.props?.['aria-label']==='현장 상태');
 assert.equal(select().props.value,'scheduled');
 select().props.onChange({target:{value:'in_progress'}});h.render();assert.equal(h.draft().dirty,true);
 await find(h.tree(),n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();
 assert.equal(payload.status,'in_progress');assert.equal(payload.expectedStatus,'scheduled');assert.equal(payload.site_name,'원래 현장');assert.equal(h.draft().dirty,false);
});
