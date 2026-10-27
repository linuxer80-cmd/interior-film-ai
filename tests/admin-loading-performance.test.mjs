import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return{promise,resolve};};
const all=(node,predicate)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(child=>all(child,predicate)):[...(predicate(node)?[node]:[]),...all(node.props?.children,predicate)];
const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
function component(file,imports={},globals={}) {
 let cursor=0;const slots=[],effects=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useCallback:fn=>fn,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next];},
  useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},
  useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>value!==old.deps[j])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}
 };
 const exports={},context={exports,React,URL,URLSearchParams,AbortController,AbortSignal,Promise,console:{log(){},error(){}},
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  document:{visibilityState:'visible',body:{style:{}},addEventListener(){},removeEventListener(){}},
  window:{location:{search:'',href:'https://app.test/admin'},history:{replaceState(){}},addEventListener(){},removeEventListener(){}},
  ...globals,require(path){if(path==='react')return React;if(path==='next/dynamic')return{default:()=> 'DynamicPanel',__esModule:true};if(path in imports)return imports[path];return{__esModule:true,default:path};}};
 const {code}=swc.transformSync(fs.readFileSync(new URL('../app/admin/'+file,import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
 vm.runInNewContext(code,context);
 return{render(props={}){cursor=0;return exports.default(props);},effects(){effects.splice(0).forEach(fn=>fn());},dispose(){slots.forEach(slot=>slot?.cleanup?.());}};
}
const moduleDefault=value=>({__esModule:true,default:value});
test('administrator home becomes usable while sample setup is pending; cases load on opening their tab',async()=>{
 const sample=deferred(),settings=deferred();let ready=false,jobs=0,companyId=null;const searches=[];
 const hooks={};const empty=()=>({});
 for(const name of ['useJobs','useJobRegister','useLeads','useUsage','useCompanySettings','useWorkers'])hooks['./hooks/'+name]=moduleDefault(empty);
 hooks['../hooks/useSites']=moduleDefault(()=>({sites:[],closeSite(){}}));
 hooks['./hooks/useJobs']=moduleDefault(()=>({jobTotal:0,jobPage:3,jobSearchApplied:'문',loadJobs:(...args)=>{jobs++;searches.push(args);}}));
 hooks['./hooks/useLeads']=moduleDefault(()=>({loadUnreadCount:async()=>{},syncNotificationPermission(){}}));
 hooks['./hooks/useCompanySettings']=moduleDefault(()=>({loadSettings:()=>settings.promise}));
 hooks['./hooks/useAdminCompany']=moduleDefault(()=>({adminReady:ready,companyId,
  initializeCompany:async()=>{companyId='co';return{companyId};},markAdminReady:()=>{ready=true;}}));
 const channel={on(){return this;},subscribe(){return this;}};
 hooks['../../lib/supabase']={supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},channel:()=>channel,removeChannel(){}}};
 const h=component('page.js',hooks,{fetch:()=>sample.promise});
 h.render();h.effects();await flush();
 assert.equal(ready,true);assert.equal(jobs,0);
 let tree=h.render();h.effects();
 const tabs=all(tree,node=>node.type==='./AdminTabs'&&!node.props.secondaryOnly)[0];assert.ok(tabs);
 tabs.props.changeTab('jobs');h.render();h.effects();await flush();assert.equal(jobs,0);
 sample.resolve({ok:true,json:async()=>({success:true})});await flush();
 tree=h.render();h.effects();await flush();assert.equal(jobs,1);assert.deepEqual(searches,[[3,'문','co']]);
 // The unrelated settings request is still pending and does not block either view.
 assert.equal(ready,true);settings.resolve();h.dispose();
});
test('today work is displayed without waiting for tomorrow material data',async()=>{
 const tomorrow=deferred();const today={today:'2026-10-27',tasks:[],todaySites:[{siteId:'s',name:'오늘 현장',workerCount:1,hasLeader:true}],counts:{review:0}};
 const h=component('AdminHomeSummary.js',{'../../lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}}}},
  {fetch:async url=>url.includes('tomorrow')?tomorrow.promise:{ok:true,json:async()=>today}});
 h.render({companyId:'co'});h.effects();await flush();
 const tree=h.render({companyId:'co'});assert.match(text(tree),/오늘 현장/);assert.equal(tree.props['aria-busy'],false);
 tomorrow.resolve({ok:true,json:async()=>({sites:[]})});await flush();h.dispose();
});
test('closed site extras do not mount data panels; expanded draft survives collapsing',()=>{
 const report={reportSaving:false,clearReportMessage(){}};
 const h=component('SiteDetailModal.js',{
  './hooks/useSiteWorkReport':moduleDefault(()=>report),
  '../../lib/siteDrafts.mjs':{createSiteDrafts:()=>({register(){},snapshot:()=>[]})},
  '../../lib/adminSiteHistory.mjs':{guardAdminSiteHistory:()=>({dispose(){}})},
 });
 const props={site:{id:'s',status:'scheduled'},companyId:'co',updateSiteSchedule(){}};
 let tree=h.render(props);h.effects();tree=h.render(props);
 const panels=tree=>all(tree,n=>n.type==='../components/TradeClients'||(n.type==='../components/SiteOperations'&&n.props.mode==='changes'));
 assert.equal(panels(tree).length,0);
 const toggle=(label,open)=>{const details=all(tree,n=>n.type==='details'&&n.props.children?.some(child=>child?.type==='summary'&&text(child)===label))[0];assert.ok(details,label);const target={open};details.props.onToggle({target,currentTarget:target});tree=h.render(props);};
 toggle('추가 기능',true);toggle('고객 구분·거래처 연결',true);
 assert.equal(panels(tree).length,1);
 toggle('현장 변경 내역',true);assert.equal(panels(tree).length,2);
 assert.equal(panels(tree).find(n=>n.props.mode==='changes').props.active,true);
 toggle('추가 기능',false);
 assert.equal(panels(tree).length,2);assert.equal(panels(tree).find(n=>n.props.mode==='changes').props.active,false);
 h.dispose();
});
