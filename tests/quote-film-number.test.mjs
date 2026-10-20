import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), swc=require('next/dist/build/swc');
await swc.loadBindings();
const {code}=await swc.transform(fs.readFileSync(new URL('../app/components/QuoteFilmNumber.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
function fixture(){let manual=null;const exports={};const React={useState:()=>[manual,v=>manual=v],createElement:(type,props,...children)=>({type,props:{...props,children}})};vm.runInNewContext(code,{exports,React,require:p=>p==='react'?React:{supabase:{}}});return exports;}
function nodes(n){return !n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];}
const choices=[{value:'영림 PX450',code:'PX450',label:'영림 PX450'}];
test('site choices are distinct by brand and code and omit missing codes',()=>{const f=fixture();assert.equal(f.quoteFilmChoices([{brand:'영림',product_code:'PX450'},{brand:'영림',product_code:'PX450'},{brand:'현대',product_code:'PX450'},{brand:'영림'}]).length,2);});
test('registered film choices show a selector without changing the draft automatically',()=>{const f=fixture(),changes=[];const tree=f.default({value:'PX450',choices,onChange:v=>changes.push(v)});assert.equal(nodes(tree).find(n=>n.type==='select').props.value,'영림 PX450');assert.equal(changes.length,0);});
test('no site films and previously entered unmatched films retain direct input',()=>{for(const c of [[],choices]){const f=fixture();const input=nodes(f.default({value:'별도 필름',choices:c,onChange:()=>{}})).find(n=>n.type==='input');assert.equal(input.props.value,'별도 필름');}});
test('switching to site choices preserves manual text until a film is chosen',()=>{const f=fixture(),changes=[];const props={value:'직접 작성한 필름',choices,onChange:v=>changes.push(v)};const button=nodes(f.default(props)).find(n=>n.type==='button');button.props.onClick();const selector=nodes(f.default(props)).find(n=>n.type==='select');assert.ok(selector);assert.equal(changes.length,0);selector.props.onChange({target:{value:'영림 PX450'}});assert.deepEqual(changes,['영림 PX450']);});
