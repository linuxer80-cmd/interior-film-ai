import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as settlementFlow from '../lib/settlementFlow.mjs';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/components/SitePaymentQuick.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
async function fixture({entries=[],siteValues={},failOnce=false}={}){
 let cursor=0,mounted=false,draft;const slots=[],effects=[],writes=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],v=>slots[i]=v];},useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v});},useEffect(fn){if(!mounted)effects.push(fn);}};
 const exports={},site={status:'scheduled',confirmed:true,contract_amount:1500000,paid:500000,outstanding:1000000,revision:2,opening_date:'2026-10-01',...siteValues};
 vm.runInNewContext(code,{exports,React,AbortSignal,URLSearchParams,crypto:{randomUUID:()=> 'request-1'},require(path){if(path==='react')return React;if(path.includes('settlementFlow'))return settlementFlow;if(path.includes('SiteSettlementProfit'))return{__esModule:true,default:()=>null};if(path.includes('useSiteDraft'))return{__esModule:true,default:(_cb,_id,state)=>{draft=state;}};if(path.includes('siteRevenue'))return{revenueSourceLabel:()=> '계약금액'};if(path.includes('workerCalendar'))return{koreanDay:()=> '2026-10-21'};return{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}}};},fetch:async(_url,opts)=>{if(opts.method==='POST'){writes.push(JSON.parse(opts.body));if(failOnce&&writes.length===1)return{ok:false,status:500,json:async()=>({error:'저장 확인 필요'})};}return{ok:true,json:async()=>({site,entries})};}});
 const render=()=>{cursor=0;return exports.default({siteId:'site-1'});};render();mounted=true;effects.forEach(fn=>fn());await new Promise(r=>setImmediate(r));
 return{render,writes,exports,site,draft:()=>draft,button:label=>all(render(),n=>n.type==='button'&&text(n).trim()===label)[0]};
}
test('full remaining amount requires review before write and preserves ongoing status',async()=>{const f=await fixture();f.button('남은 금액 전액 등록').props.onClick();assert.equal(f.writes.length,0);f.render();assert.equal(f.draft().dirty,true);assert.ok(text(f.render()).includes('등록 후 남은 금액'));await all(f.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,1);assert.equal(f.writes[0].action,'add');assert.equal(f.writes[0].amount,'1000000');assert.equal(f.writes[0].revision,2);assert.equal(f.writes[0].memo,'미수금 전액 입금');assert.equal(f.site.status,'scheduled');});
test('partial payment requires a separate confirmation step',async()=>{const f=await fixture();f.button('입금 등록').props.onClick();all(f.render(),n=>n.type==='input'&&n.props.type==='number')[0].props.onChange({target:{value:'200000'}});await all(f.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});assert.equal(f.writes.length,0);assert.ok(f.button('확인하고 저장'));await all(f.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,1);assert.equal(f.writes[0].amount,'200000');});

test('record cancellation requires an inline reason and never changes the construction status',async()=>{
 const f=await fixture({entries:[{id:'entry-1',paid_on:'2026-10-20',amount:100000,direction:'payment',memo:'중도금'}]});
 f.button('기록 취소').props.onClick();assert.equal(f.writes.length,0);f.render();assert.equal(f.draft().dirty,true);
 f.button('입금 기록 취소').props.onClick();assert.equal(f.writes.length,0);
 all(f.render(),n=>n.type==='input'&&n.props.type==='text')[0].props.onChange({target:{value:'금액 오입력'}});
 const confirm=f.button('입금 기록 취소');confirm.props.onClick();confirm.props.onClick();await new Promise(r=>setImmediate(r));
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].action,'void');assert.equal(f.writes[0].entryId,'entry-1');assert.equal(f.writes[0].reason,'금액 오입력');assert.equal(f.site.status,'scheduled');
});
test('an ambiguous save retries the exact same request without a new transaction ID',async()=>{
 const f=await fixture({failOnce:true});f.button('남은 금액 전액 등록').props.onClick();
 all(f.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 f.render();assert.equal(f.draft().pending,true);f.button('같은 요청 다시 확인').props.onClick();await new Promise(r=>setImmediate(r));
 f.render();assert.equal(f.writes.length,2);assert.deepEqual(f.writes[0],f.writes[1]);assert.equal(f.draft().pending,false);
});
test('payment review rejects excessive amounts and invalid dates before any write',async()=>{
 const f=await fixture();f.button('입금 등록').props.onClick();
 const amount=()=>all(f.render(),n=>n.type==='input'&&n.props.type==='number')[0];
 amount().props.onChange({target:{value:'1000001'}});all(f.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.match(text(f.render()),/남은 수금액보다/);assert.equal(f.writes.length,0);
 amount().props.onChange({target:{value:'100000'}});all(f.render(),n=>n.type==='input'&&n.props.type==='date')[0].props.onChange({target:{value:'2026-02-30'}});
 all(f.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});assert.match(text(f.render()),/실제 거래일/);assert.equal(f.writes.length,0);
});

for (const status of ['completed','scheduled']) {
 test(`full payment initializes the cumulative amount once without asking for an opening amount (${status})`,async()=>{
  const f=await fixture({siteValues:{status,confirmed:false,contract_amount:462000,paid:null,outstanding:null,opening_date:null}});
  const full=f.button('전액 입금 등록');assert.equal(full.props.disabled,false);full.props.onClick();
  assert.equal(f.writes.length,0);
  const tree=f.render();assert.match(text(tree),/전액 입금 확인/);assert.match(text(tree),/기존 입금액을 다시 입력할 필요가 없습니다/);
  const amount=all(tree,n=>n.type==='input'&&n.props.type==='number')[0];assert.equal(amount.props.value,'462000');assert.equal(amount.props.disabled,true);
  const submit=all(tree,n=>n.type==='form')[0].props.onSubmit;
  submit({preventDefault(){}});submit({preventDefault(){}});await new Promise(r=>setImmediate(r));
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].action,'initialize');assert.equal(f.writes[0].amount,'462000');assert.equal(f.writes[0].paidOn,'2026-10-21');assert.equal(f.writes[0].revision,2);
  assert.equal(f.site.status,status);
 });
}
test('closing a full payment review does not record an actual payment',async()=>{
 const f=await fixture({siteValues:{status:'completed',confirmed:false,paid:null,outstanding:null}});
 f.button('전액 입금 등록').props.onClick();f.button('닫기').props.onClick();assert.equal(f.writes.length,0);assert.equal(all(f.render(),n=>n.type==='form').length,0);
});
