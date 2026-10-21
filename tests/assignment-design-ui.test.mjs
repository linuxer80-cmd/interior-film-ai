import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as drafts from '../lib/siteDrafts.mjs';
import * as review from '../lib/assignmentReview.mjs';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/admin/SiteWorkerAssignment.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(node,predicate)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(child=>all(child,predicate)):[...(predicate(node)?[node]:[]),...all(node.props?.children,predicate)];
const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
async function fixture({warnings=[],newConflict=false}={}) {
 let cursor=0,mounted=false,saved=0,draft;
 const slots=[],effects=[],calls=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next];},useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},useEffect(fn){if(!mounted)effects.push(fn);}};
 const exports={};
 vm.runInNewContext(code,{exports,React,AbortSignal,console:{error(){}},require(path){
  if(path==='react')return React;
  if(path.includes('siteDrafts.mjs'))return drafts;
  if(path.includes('assignmentReview.mjs'))return review;
  if(path.includes('useSiteDraft'))return {__esModule:true,default:(_cb,_id,state)=>{draft=state;}};
  return {supabase:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}}};
 },fetch:async(url,options)=>{
  if(options.method==='GET')return {ok:true,json:async()=>({success:true,hasDailySchedule:true,assignments:[]})};
  const body=JSON.parse(options.body);calls.push({preview:url.endsWith('/preview'),body});
  if(url.endsWith('/preview'))return {ok:true,json:async()=>({success:true,preview:true,warnings,pendingWages:[],missingLeaders:body.days.filter(day=>!day.leaderId).map(day=>day.workDate)})};
  if(newConflict&&!body.confirmScheduleConflicts)return {ok:false,json:async()=>({error:'다른 업체 일정과 중복됩니다.',conflictConfirmationRequired:true,warnings:[{workDate:'2026-10-22',workerName:'팀장',reason:'다른 업체 일정'}]})};
  return {ok:true,json:async()=>({success:true})};
 }});
 const render=()=>{cursor=0;return exports.default({site:{id:'s',status:'scheduled',work_dates:['2026-10-22','2026-10-23']},workers:[{id:'leader',name:'팀장',is_active:true},{id:'member',name:'팀원',is_active:true}],loadWorkers:async()=>{},onSaved:async()=>{saved++;}});};
 render();mounted=true;effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));
 const button=label=>all(render(),node=>node.type==='button'&&text(node).trim()===label)[0];
 const chooseLeader=()=>{all(render(),node=>node.type==='select')[0].props.onChange({target:{value:'leader'}});render();};
 const checkbox=label=>all(all(render(),node=>node.type==='label'&&text(node).includes(label)&&all(node,item=>item.type==='input'&&item.props.type==='checkbox').length)[0],node=>node.type==='input'&&node.props.type==='checkbox')[0];
 return {render,calls,button,chooseLeader,checkbox,draft:()=>draft,saved:()=>saved};
}
test('bulk selected-date application previews first, preserves the draft and saves once',async()=>{
 const h=await fixture();h.chooseLeader();h.checkbox('팀원').props.onChange({target:{checked:true}});h.render();
 h.button('선택한 날짜에 이 팀 적용').props.onClick();h.render();assert.equal(h.draft().dirty,true);
 const check=h.button('배정 확인하고 저장 →');await Promise.all([check.props.onClick(),check.props.onClick()]);h.render();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].preview,true);assert.equal(h.saved(),0);
 for(const day of h.calls[0].body.days){assert.equal(day.leaderId,'leader');assert.deepEqual(day.memberIds,['member']);}
 const save=h.button('배정 저장');await Promise.all([save.props.onClick(),save.props.onClick()]);h.render();
 assert.equal(h.calls.filter(call=>!call.preview).length,1);assert.equal(h.saved(),1);assert.equal(h.draft().dirty,false);
});
test('intentional partial assignments need acknowledgement and are not silently blocked or committed',async()=>{
 const h=await fixture();h.chooseLeader();await h.button('배정 확인하고 저장 →').props.onClick();h.render();
 await h.button('배정 저장').props.onClick();assert.equal(h.calls.filter(call=>!call.preview).length,0);
 h.checkbox('미배정 날짜를 남기고 저장합니다').props.onChange({target:{checked:true}});h.render();
 await h.button('배정 저장').props.onClick();assert.equal(h.saved(),1);
});
test('a newly discovered server conflict never triggers an automatic second write',async()=>{
 const h=await fixture({newConflict:true});h.chooseLeader();h.button('선택한 날짜에 이 팀 적용').props.onClick();h.render();await h.button('배정 확인하고 저장 →').props.onClick();h.render();
 await h.button('배정 저장').props.onClick();h.render();assert.equal(h.saved(),0);assert.equal(h.calls.filter(call=>!call.preview).length,1);
 h.checkbox('시공자와 중복 일정을 확인했습니다').props.onChange({target:{checked:true}});h.render();await h.button('배정 저장').props.onClick();
 assert.equal(h.saved(),1);assert.equal(h.calls.at(-1).body.confirmScheduleConflicts,true);
});
