import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let code;
const source=fs.readFileSync(new URL('../app/admin/AdminAssignedWork.js',import.meta.url),'utf8');
if(process.env.BABEL_TEST_ROOT){const b=require(process.env.BABEL_TEST_ROOT+'/core');code=b.transformSync(source,{plugins:[require(process.env.BABEL_TEST_ROOT+'/plugin-transform-react-jsx'),require(process.env.BABEL_TEST_ROOT+'/plugin-transform-modules-commonjs')],babelrc:false,configFile:false}).code;}
else {const swc=require('next/dist/build/swc');await swc.loadBindings();({code}=await swc.transform(source,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}}));}
function nodes(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children)];}
async function harness(sites){let cursor=0;const slots=[],effects=[],calls=[];const events=new Map();const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],x=>slots[i]=typeof x==='function'?x(slots[i]):x]},useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v})},useCallback:f=>f,useEffect:f=>effects.push(f)};const exports={};const report=()=>{};const directions=()=>{};const context={exports,React,window:{addEventListener:(k,f)=>events.set(k,f),removeEventListener:()=>{}},document:{visibilityState:'visible',addEventListener:()=>{},removeEventListener:()=>{}},require(path){if(path==='react')return React;if(path==='next/dynamic')return ()=>()=>{};if(path.includes('workerSites'))return {loadMyWorkerSites:async args=>{calls.push(args);return args?{site:sites.find(s=>s.site_id===args.siteId)}:{sites}}};if(path.includes('SiteDirections'))return {default:directions,__esModule:true};if(path.includes('WorkReportForm'))return {default:report,__esModule:true};return {default:{},__esModule:true}}};vm.runInNewContext(code,context);const render=section=>{cursor=0;return exports.default({siteId:'own-site',companyId:'company',section,onNavigate:()=>{}})};render('info');effects[0]();await new Promise(r=>setTimeout(r,0));return {render,calls,report,events,directions};}
test('only a personal assignment in the current company exposes field actions',async()=>{for(const sites of [[],[{site_id:'own-site',company_id:'other-company',my_role:'leader'}]]){const h=await harness(sites);const tree=h.render('info');assert.equal(h.calls.length,1);assert.equal(nodes(tree).some(n=>n.type==='button'),false);}const h=await harness([{site_id:'own-site',company_id:'company',my_role:'member'}]);assert.equal(h.calls.length,2);assert.ok(nodes(h.render('info')).some(n=>n.type==='button'&&n.props.children.includes('내 출퇴근')));});
test('report stays mounted and inactive when navigating to expenses',async()=>{const h=await harness([{site_id:'own-site',company_id:'company',my_role:'leader'}]);const button=nodes(h.render('report')).find(n=>n.type==='button'&&n.props.children.includes('내 완료보고 작성'));button.props.onClick();const open=nodes(h.render('report')).find(n=>n.type===h.report);assert.equal(open.props.active,true);const hidden=nodes(h.render('expenses')).find(n=>n.type===h.report);assert.equal(hidden.props.active,false);assert.equal(nodes(h.render('work')).find(n=>n.type===h.report).props.active,false);assert.ok(h.events.has('site-assignment-changed'));});

test('assigned owner gets shared directions and date-scoped team tools inside admin',async()=>{
 const dates=[{work_date:'2026-10-21',role:'leader'}];
 const h=await harness([{site_id:'own-site',company_id:'company',my_role:'leader',address:'도로명 123',assigned_dates:dates}]);
 const tree=h.render('info');const directions=nodes(tree).find(n=>n.type===h.directions);
 assert.equal(directions.props.site.site_id,'own-site');assert.equal(directions.props.compact,true);
 const button=nodes(tree).find(n=>n.type==='button'&&n.props.children.includes('팀원·팀 채팅'));
 button.props.onClick();const team=nodes(h.render('info')).find(n=>n.props?.dates===dates);
 assert.equal(team.props.siteId,'own-site');assert.equal(team.props.active,true);
 assert.equal(nodes(h.render('materials')).some(n=>n.props?.dates===dates),false);
});


test('assigned owner has an embedded work section instead of navigating to worker pages',async()=>{
 const h=await harness([{site_id:'own-site',company_id:'company',my_role:'leader'}]);
 const entry=nodes(h.render('info')).find(n=>n.type==='button'&&n.props.children.includes('내 시공 도구 모두 보기'));
 assert.ok(entry);
 const workspace=nodes(h.render('work')).find(n=>n.props?.siteId==='own-site'&&typeof n.props?.onClose==='function');
 assert.equal(workspace.props.siteId,'own-site');
 assert.equal(typeof workspace.props.onClose,'function');
});

