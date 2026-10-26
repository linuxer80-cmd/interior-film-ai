import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createSiteDrafts} from '../lib/siteDrafts.mjs';
const require=createRequire(import.meta.url), swc=require('next/dist/build/swc');
await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/admin/SiteDetailModal.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(node,predicate)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(child=>all(child,predicate)):[...(predicate(node)?[node]:[]),...all(node.props?.children,predicate)];
const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
function fixture(siteValues={}){
  let cursor=0;const slots=[];
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next];},useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},useCallback:fn=>fn,useEffect(){}};
  const exports={};
  vm.runInNewContext(code,{exports,React,URLSearchParams,requestAnimationFrame:fn=>fn(),require(path){
    if(path==='react')return React;
    if(path.includes('siteDrafts.mjs'))return {createSiteDrafts};
    if(path.includes('useSiteWorkReport'))return {__esModule:true,default:()=>({reportSaving:false})};
    return {__esModule:true,default:path};
  }});
  const render=()=>{cursor=0;return exports.default({site:{id:'s',status:'scheduled',work_dates:['2026-10-22'],...siteValues}});};
  const button=label=>all(render(),node=>node.type==='button'&&text(node)===label)[0];
  const component=name=>all(render(),node=>typeof node.type==='string'&&node.type.endsWith(name))[0];
  return {render,button,component};
}
test('preparation navigation separates dates, team and materials and guards unsaved schedule changes',()=>{
  const h=fixture();h.button('작업·사진').props.onClick();h.button('일정·시공자→').props.onClick();
  assert.equal(h.button('시공일').props['aria-pressed'],true);
  let dirty=true;
  h.component('SiteScheduleEditor').props.onDraftState('schedule',()=>({label:'시공 날짜',dirty,pending:false,discard:()=>{dirty=false;}}));
  h.button('다음 · 시공자 배정 →').props.onClick();
  assert.equal(h.button('시공일').props['aria-pressed'],true);
  const dialog=h.component('UnsavedChangesDialog');
  assert.deepEqual([...dialog.props.request.labels],['시공 날짜']);
  dialog.props.onContinue();
  dirty=false;h.button('다음 · 시공자 배정 →').props.onClick();
  assert.equal(h.button('시공자 배정').props['aria-pressed'],true);
  const dateContainer=all(h.render(),node=>node.props?.['aria-label']==='시공 일정')[0];
  assert.equal(dateContainer.props.hidden,true);
  h.button('다음 · 자재 준비 →').props.onClick();
  assert.equal(all(h.render(),n=>n.props?.id==='admin-site-panel-materials')[0].props.hidden,false);
  h.button('← 시공자 배정 확인').props.onClick();
  assert.equal(h.button('시공자 배정').props['aria-pressed'],true);
});

test('assignment shortcuts open crew directly when dates exist and retain date setup when missing',()=>{
 const h=fixture();h.component('SiteNextActions').props.onNavigate('schedule',{id:'assignment'});
 assert.equal(h.button('시공자 배정').props['aria-pressed'],true);
 const undated=fixture({work_dates:[]});undated.component('SiteNextActions').props.onNavigate('schedule',{id:'assignment'});
 assert.equal(undated.button('시공일').props['aria-pressed'],true);
 h.component('SiteNextActions').props.onNavigate('schedule',{id:'date'});
 assert.equal(h.button('시공일').props['aria-pressed'],true);
});

test('trade editing has one input location and settlement change navigation protects payment drafts',()=>{
 const h=fixture();assert.equal(all(h.render(),n=>n.type==='../components/TradeClients').length,1);
 h.button('정산').props.onClick();
 const status=h.component('SiteStatusControl');assert.equal(status.props.active,true);
 let dirty=true;
 status.props.onDraftState('payment',()=>({label:'입금 기록',dirty,pending:false,discard:()=>{dirty=false;}}));
 status.props.onTradeChange();
 assert.equal(all(h.render(),n=>n.props.id==='admin-site-panel-settlement')[0].props.hidden,false);
 const guard=h.component('UnsavedChangesDialog');assert.deepEqual([...guard.props.request.labels],['입금 기록']);
 guard.props.onDiscard();
 assert.equal(all(h.render(),n=>n.props.id==='admin-site-panel-info')[0].props.hidden,false);
});
