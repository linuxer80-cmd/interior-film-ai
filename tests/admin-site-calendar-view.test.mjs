import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import * as calendar from '../app/utils/workerCalendar.js';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const input=fs.readFileSync(new URL('../app/admin/SiteManagementTabBase.js',import.meta.url),'utf8')+'\nexport {SiteCalendar};';
const source=(await swc.transform(input,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}})).code;
const nodes=v=>Array.isArray(v)?v.flatMap(nodes):!v||typeof v!=='object'?[]:[v,...nodes(v.props?.children)];
function harness(){
 let slots=[],cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(initial){let i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useMemo:fn=>fn(),useEffect:()=>{},useRef:v=>({current:v})};
 const exports={};vm.runInNewContext(source,{exports,React,Date,URL,Set,Map,Intl,console,require:p=>p==='react'?React:p.includes('workerCalendar')?{...calendar,koreanDay:()=> '2026-10-30'}:{}});
 return {render(){cursor=0;return nodes(exports.SiteCalendar({sites:[],cancelledSites:[],workers:[],loading:false,searching:false,openSite(){}}))}};
}
const text=n=>JSON.stringify(n.props?.children||[]);
const button=(nodes,label)=>nodes.find(n=>n.type==='button'&&(n.props['aria-label']===label||text(n).includes(label)));
const dayButtons=nodes=>nodes.filter(n=>n.type==='button'&&/^\d{4}-\d{2}-\d{2}/.test(n.props['aria-label']||''));
test('month is the default, switching to week and navigating across months retains correct dates',()=>{
 const h=harness();let tree=h.render();
 assert.equal(dayButtons(tree).length,31);assert.ok(button(tree,'주간 보기'));assert.ok(button(tree,'이전 달'));
 button(tree,'주간 보기').props.onClick();tree=h.render();assert.equal(dayButtons(tree).length,7);assert.ok(button(tree,'월간 보기'));
 assert.ok(button(tree,'이전 주'));assert.ok(button(tree,'다음 주'));
 button(tree,'다음 주').props.onClick();tree=h.render();assert.ok(dayButtons(tree).some(n=>n.props['aria-label'].startsWith('2026-11-06')&&n.props['aria-pressed']));
 button(tree,'이전 주').props.onClick();tree=h.render();assert.ok(dayButtons(tree).some(n=>n.props['aria-label'].startsWith('2026-10-30')&&n.props['aria-pressed']));
 button(tree,'월간 보기').props.onClick();tree=h.render();assert.equal(dayButtons(tree).length,31);assert.ok(button(tree,'다음 달'));
});
test('weekly movement crosses year and leap-day boundaries',()=>{
 assert.equal(calendar.shiftWeek('2026-12-30',1),'2027-01-06');
 assert.equal(calendar.shiftWeek('2024-03-03',-1),'2024-02-25');
});
