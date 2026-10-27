import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as supplement from '../lib/consultationSupplement.mjs';
import * as inputs from '../lib/registrationInputs.mjs';
import * as registration from '../lib/siteRegistration.mjs';
import {quoteSeed} from '../lib/consultationQuote.js';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');
await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/admin/SiteRegisterModal.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>!n?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);

test('phone-only follow-up carries extracted amounts, previews missing fields and allows retry after photo failure',async()=>{
 const slots=[];let cursor=0,effects=[],tree;
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},
  useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},useMemo(fn){return fn();},
  useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old[n]))){slots[i]=deps;effects.push(fn);}},};
 const site={id:'existing',company_id:'co',site_name:'부평일신동',address:'인천 부평구',customer_phone:'01012345678',contract_amount:null,status:'scheduled'};
 const db={from(){const q={select(){return q},eq(){return q},order(){return q},range:async()=>({data:[site]})};return q;}};
 const exports={};vm.runInNewContext(code,{exports,React,crypto,URL,URLSearchParams,requestAnimationFrame:()=>0,cancelAnimationFrame(){},Event,window:{dispatchEvent(){},confirm:()=>true},require(path){
  if(path==='react')return React;
  if(path.includes('consultationSupplement'))return supplement;
  if(path.includes('registrationInputs'))return inputs;
  if(path.includes('siteRegistration'))return registration;
  if(path.includes('consultationQuote'))return {quoteSeed};
  if(path.includes('supabase'))return {supabase:db};
  if(path.includes('workerCalendar'))return {koreanDay:d=>d};
  if(path.includes('useAdminOverlayBack'))return {__esModule:true,default:(_open,close)=>close};
  return {__esModule:true,default:path.includes('CallContentAiInput')?'CallInput':path};
 }});
 const calls=[];
 const props={open:true,companyId:'co',onClose(){},createSite:async data=>{calls.push(data);return calls.length===1?{success:false,site,merged:true,error:'사진 재시도'}:{success:true,site,merged:true};}};
 const render=()=>{cursor=0;effects=[];tree=exports.default(props);const pending=effects;effects=[];pending.forEach(fn=>fn());return tree;};
 render();render();
 nodes(tree).find(n=>n.type==='CallInput').props.onApply({customer_phone:'01012345678',contract_amount:'1500000',deposit_amount:'200000',work_description:'신발장 측면 추가'});
 render();
 const submit=async()=>{await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();};
 await submit();await submit();
 const candidate=nodes(tree).find(n=>n.type==='button'&&text(n).includes('부평일신동'));assert.ok(candidate);candidate.props.onClick();render();
 assert.match(text(tree),/1,500,000원 \+ 부가세 150,000원 \/ 합계 1,650,000원/);
 await submit();assert.equal(calls.length,1);assert.equal(calls[0].contract_amount,'1500000');assert.equal(calls[0].deposit_amount,'200000');assert.equal(calls[0].existing_site_id,'existing');
 assert.equal(nodes(tree).find(n=>n.type==='fieldset').props.disabled,false);assert.match(text(tree),/사진 재시도/);
 await submit();assert.equal(calls.length,2);assert.equal(calls[0].registration_request_id,calls[1].registration_request_id);assert.match(text(tree),/저장 완료/);
});
