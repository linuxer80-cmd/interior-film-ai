import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/components/SitePaymentQuick.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
async function fixture(){
 let cursor=0,mounted=false,draft;const slots=[],effects=[],writes=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],v=>slots[i]=v];},useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v});},useEffect(fn){if(!mounted)effects.push(fn);}};
 const exports={},site={status:'scheduled',confirmed:true,contract_amount:1500000,paid:500000,outstanding:1000000,revision:2,opening_date:'2026-10-01'};
 vm.runInNewContext(code,{exports,React,AbortSignal,URLSearchParams,crypto:{randomUUID:()=> 'request-1'},require(path){if(path==='react')return React;if(path.includes('useSiteDraft'))return{__esModule:true,default:(_cb,_id,state)=>{draft=state;}};if(path.includes('siteRevenue'))return{revenueSourceLabel:()=> '계약금액'};if(path.includes('workerCalendar'))return{koreanDay:()=> '2026-10-21'};return{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}}};},fetch:async(_url,opts)=>{if(opts.method==='POST')writes.push(JSON.parse(opts.body));return{ok:true,json:async()=>({site,entries:[]})};}});
 const render=()=>{cursor=0;return exports.default({siteId:'site-1'});};render();mounted=true;effects.forEach(fn=>fn());await new Promise(r=>setImmediate(r));
 return{render,writes,exports,site,draft:()=>draft,button:label=>all(render(),n=>n.type==='button'&&text(n).trim()===label)[0]};
}
test('full remaining amount requires review before write and preserves ongoing status',async()=>{const f=await fixture();f.button('남은 금액 전액 등록').props.onClick();assert.equal(f.writes.length,0);f.render();assert.equal(f.draft().dirty,true);assert.ok(text(f.render()).includes('등록 후 남은 금액'));await all(f.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,1);assert.equal(f.writes[0].action,'add');assert.equal(f.writes[0].amount,'1000000');assert.equal(f.writes[0].revision,2);assert.equal(f.writes[0].memo,'잔금 입금');assert.equal(f.site.status,'scheduled');});
test('partial payment requires a separate confirmation step',async()=>{const f=await fixture();f.button('입금 등록').props.onClick();all(f.render(),n=>n.type==='input'&&n.props.type==='number')[0].props.onChange({target:{value:'200000'}});await all(f.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});assert.equal(f.writes.length,0);assert.ok(f.button('확인하고 저장'));await all(f.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,1);assert.equal(f.writes[0].amount,'200000');});
