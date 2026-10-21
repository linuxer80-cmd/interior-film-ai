import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const compile=async file=>(await swc.transform(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}},target:'es2022'},module:{type:'commonjs'}})).code;
const wrapper=await compile('../app/admin/ConsultationQuote.js'),actions=await compile('../app/components/QuoteFileActions.js');
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):'';
function hooks(initial={}){const state=[],refs=[],deps=[],effects=[];let cursor=0;const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(v){const i=cursor++;if(!(i in state))state[i]=i in initial?initial[i]:v;return [state[i],next=>state[i]=typeof next==='function'?next(state[i]):next];},useRef(v){const i=cursor++;return refs[i]||(refs[i]={current:v});},useCallback:f=>f,useMemo:f=>f(),useEffect(f,d){const i=cursor++;if(!deps[i]||d.some((v,j)=>v!==deps[i][j])){deps[i]=d;effects.push(f);}}};return {React,state,render(component,props,flush=true){cursor=0;const tree=component(props);if(flush)while(effects.length)effects.shift()();else effects.length=0;return tree;}};}
test('both editors stay mounted when switching, and either unfinished editor protects closing',()=>{
 const h=hooks(),exports={},reports=[];
 vm.runInNewContext(wrapper,{exports,React:h.React,URLSearchParams,window:{location:{search:''}},require:path=>path==='react'?h.React:{default:()=>{},__esModule:true}});
 const props={siteId:'site',onDirtyChange:value=>reports.push(value)};
 const render=()=>h.render(exports.default,props);render();let tree=render();
 const click=label=>{const button=nodes(tree).find(n=>n.type==='button'&&text(n).includes(label));assert.ok(button,label);button.props.onClick();tree=render();};
 click('부위별 견적서');const area=nodes(tree).find(n=>n.type?.name==='AreaConsultationQuote');assert.ok(area);area.props.onDirtyChange(true);tree=render();
 click('견적서 선택');click('인건비·자재비 견적서');assert.ok(nodes(tree).some(n=>n.type===area.type));assert.ok(nodes(tree).some(n=>n.type==='div'&&n.props.hidden===true&&nodes(n).some(c=>c.type===area.type)));assert.equal(reports.at(-1),true);
 click('견적서 선택');assert.ok(text(tree).includes('인건비·자재비 견적서'));assert.ok(!text(tree).includes('선견적'));
});
test('delivery shares JPEG files, suppresses duplicate taps and treats cancellation as cancellation',async()=>{
 const draft={},file=new File(['jpg'],'quote_1.jpg',{type:'image/jpeg'}),h=hooks({0:{draft,images:[file],urls:['blob:example'],pdf:new File(['pdf'],'quote.pdf',{type:'application/pdf'})}}),exports={};
 let calls=0,rejectShare;
 const navigator={canShare:({files})=>files.every(f=>f.type==='image/jpeg'),share:({files})=>{calls++;assert.equal(files[0],file);return new Promise((resolve,reject)=>{rejectShare=reject;});}};
 vm.runInNewContext(actions,{exports,React:h.React,navigator,File,URL,require:path=>path==='react'?h.React:{}});
 const tree=h.render(exports.default,{draft,filename:'견적서',preview:true},false);const share=nodes(tree).find(n=>n.type==='button'&&text(n)==='견적서 이미지 공유');
 const pending=share.props.onClick();await share.props.onClick();assert.equal(calls,1);rejectShare(Object.assign(Error('cancel'),{name:'AbortError'}));await pending;assert.equal(h.state[1],'');assert.equal(h.state[2],false);
});

test('adding and editing an area immediately updates subtotal, VAT and the exported quote rows',async()=>{
 const {quoteTotals,validateQuote}=await import('../lib/consultationQuote.js');
 const {completionTotals}=await import('../lib/completionEstimate.mjs');
 const draft={vat:'separate',items:[{name:'기존 문',detail:'',quantity:'2',unit_price:'100000',unit:'세트',film_no:'',note:''}]};
 const h=hooks({0:draft,1:1,2:false}),exports={};
 vm.runInNewContext(wrapper+'\nexports.testArea=AreaConsultationQuote;',{exports,React:h.React,URLSearchParams,window:{location:{search:''}},require(path){
  if(path==='react')return h.React;
  if(path.includes('completionEstimate.mjs'))return {completionTotals};
  if(path.includes('consultationQuote'))return {quoteTotals,validateQuote};
  if(path.includes('QuoteFilmNumber'))return {useSiteQuoteFilms:()=>({}),default:'FilmNumber',__esModule:true};
  return {default:path,__esModule:true};
 }});
 const render=()=>h.render(exports.testArea,{siteId:'site'},false);
 let tree=render();
 nodes(tree).find(n=>n.type==='button'&&text(n)==='+ 시공 항목 추가').props.onClick();tree=render();
 const edit=(key,value)=>{
  const rows=nodes(tree).filter(n=>n.type==='div'&&n.props.className==='quote-row');
  const label=nodes(rows.at(-1)).find(n=>n.type==='label'&&text(n).startsWith(key));
  nodes(label).find(n=>n.type==='input').props.onChange({target:{value}});tree=render();
 };
 edit('시공 항목','추가 팬트리장');edit('단가 (원)','150000');
 assert.ok(text(tree).includes('견적 합계 385,000원'));
 h.state[4]=true;tree=render();
 const file=nodes(tree).find(n=>n.props?.draft?.items?.length===2&&n.props?.filename);
 h.state[4]=false;tree=render();
 assert.ok(file);assert.equal(file.props.draft.items[1].amount,150000);
 assert.equal(completionTotals(file.props.draft.items,'separate').total,385000);
 edit('수량','2');assert.ok(text(tree).includes('견적 합계 550,000원'));
 const saved=validateQuote(JSON.parse(JSON.stringify(h.state[0])));
 assert.equal(quoteTotals(saved.items).amount,500000);
 edit('단가 (원)','');assert.ok(text(tree).includes('미완성'));
});
