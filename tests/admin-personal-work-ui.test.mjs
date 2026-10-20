import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {combineAdminPersonalSites,isPersonalWorkDay,personalCalendarLabel} from '../lib/adminPersonalSites.mjs';
const require=createRequire(import.meta.url);
async function compile(file){const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 if(process.env.BABEL_TEST_ROOT){const b=require(process.env.BABEL_TEST_ROOT+'/core');return b.transformSync(source,{plugins:[require(process.env.BABEL_TEST_ROOT+'/plugin-transform-react-jsx'),require(process.env.BABEL_TEST_ROOT+'/plugin-transform-modules-commonjs')],babelrc:false,configFile:false}).code;}
 const swc=require('next/dist/build/swc');await swc.loadBindings();return (await swc.transform(source,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}})).code;
}
function nodes(n){return !n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];}
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):'';
function react(effects=[]){return {Fragment:'fragment',createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:v=>[typeof v==='function'?v():v,()=>{}],useMemo:f=>f(),useEffect:f=>effects.push(f),useRef:v=>({current:v})};}
test('foreign assigned card shows employer and never calls owner-only crew API',async()=>{
 const effects=[],React=react(effects),exports={};let authCalls=0;
 const source=await compile('../app/admin/SiteManagementTabBase.js');
 vm.runInNewContext(source+';exports.SiteCard=SiteCard;',{exports,React,AbortController,require:p=>p==='react'?React:p.includes('workerCalendar')?{koreanDay:v=>v}:p.includes('adminPersonalSites')?{combineAdminPersonalSites,isPersonalWorkDay,personalCalendarLabel}:p.includes('supabase')?{supabase:{auth:{getSession(){authCalls++;throw Error('owner crew API must not run')}}}}:{default:()=>{},__esModule:true}});
 const site={id:'external',company_id:'other',company_name:'제이원',site_name:'지원 현장',status:'scheduled',personal_only:true,personal_assignment:true,personal_work_dates:['2026-10-22'],personal_role:'member',work_dates:['2026-10-22'],site_workers:[]};
 const tree=exports.SiteCard({site,day:'2026-10-22',workers:[],onOpen:()=>{}});effects[0]();assert.equal(authCalls,0);assert(text(tree).includes('협력 업체 · 제이원'));assert(text(tree).includes('내 시공'));assert(!text(tree).includes('팀장 배정 필요'));
});
test('admin workspace embeds the real assigned-site detail with attendance and cutting tools',async()=>{
 const React=react(),exports={};const modules=[];
 vm.runInNewContext(await compile('../app/admin/AdminWorkerTools.js'),{exports,React,require:p=>p==='react'?React:p==='next/dynamic'?loader=>{const name=loader.toString();const C=()=>{};modules.push({name,C});return C;}:{}});
 const tree=exports.default({siteId:'foreign-site',initialDate:'2026-10-22',onClose:()=>{},companyName:'제이원'});
 const detail=nodes(tree).find(n=>n.props?.siteId==='foreign-site'&&n.props?.embedded===true);
 assert.ok(detail);assert.equal(detail.props.initialDate,'2026-10-22');assert.equal(typeof detail.props.onClose,'function');assert(text(tree).includes('출퇴근'));assert(text(tree).includes('재단'));assert(text(tree).includes('제이원'));
});
