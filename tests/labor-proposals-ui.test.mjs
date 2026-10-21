import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/jobs/page.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
const job={id:'j',site_id:'s',title:'송도 현장',headcount:1,status:'open',work_dates:['2099-10-25'],proposal_user_id:'w',proposal_wage:250000};
function fixture(manager=false){
 let cursor=0;const slots=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],n=>slots[i]=typeof n==='function'?n(slots[i]):n];},useEffect(){}};
 const exports={};vm.runInNewContext(code,{exports,React,Intl,Date,URLSearchParams,require(path){if(path==='react')return React;if(path.endsWith('.css'))return{};return{__esModule:true,default:path};}});
 const render=()=>{cursor=0;return exports.default();};render();
 slots[0]={manager,proposalsEnabled:true,jobs:[job],applicationJobs:[],applications:[{id:'a',job_id:'j',user_id:'w',status:'invited',profile:{name:'김시공',daily_wage:250000}}],candidates:[],profile:{seeking:true,available_dates:['2099-10-25','2099-10-26']}};slots[1]='applications';
 const button=label=>all(render(),n=>n.type==='button'&&text(n)===label)[0];
 return {slots,render,button};
}
test('worker must consent before applying to a proposal; confirmation carries the reviewed wage',()=>{
 const h=fixture();h.button('현장 제안 확인').props.onClick();
 let accept=h.button('이 현장에 지원');assert.equal(accept.props.disabled,true);
 all(h.render(),n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
 accept=h.button('이 현장에 지원');assert.equal(accept.props.disabled,false);accept.props.onClick();
 assert.equal(h.slots[24].action,'proposal_apply');assert.equal(h.slots[24].expectedWage,250000);assert.equal(h.slots[24].share_phone,true);
});
test('manager sees a collapsed site summary once for several proposals at the same site',()=>{
 const h=fixture(true);h.slots[0].jobs.push({...job,id:'j2'});h.slots[0].applications.push({...h.slots[0].applications[0],id:'a2',job_id:'j2'});
 const tree=h.render(),details=all(tree,n=>n.type==='details'&&n.props.className==='recruitment-status');assert.equal(details.length,1);assert.equal(details[0].props.open,undefined);
 assert.ok(text(tree).includes('지원 전 제안 2명'));assert.equal(all(tree,n=>n.type==='button'&&text(n)==='프로필 자세히 보기').length,0);
 assert.equal(all(tree,n=>n.type==='button'&&text(n)==='지원자 확정').length,0);
});
test('seeking page explains only accepted dates are removed; deployment capability disables proposals',()=>{
 const h=fixture();h.slots[1]='seeking';assert.ok(text(h.render()).includes('나머지는 유지'));
 h.slots[0].manager=true;h.slots[0].proposalsEnabled=false;h.slots[1]='candidates';h.slots[0].candidates=[{user_id:'w',name:'김시공',daily_wage:250000,seeking:true,available_dates:['2099-10-25']}];
 assert.equal(h.button('현장 제안하기').props.disabled,true);
});
