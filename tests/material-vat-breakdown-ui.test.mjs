import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as vat from '../lib/materialVatEstimate.mjs';
import * as groups from '../lib/costBrandGroups.mjs';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const source=fs.readFileSync(new URL('../app/admin/ProfitTab.js',import.meta.url),'utf8')+'\nexport { Breakdown };';
const code=(await swc.transform(source,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}})).code;
const React={useState:value=>[value,()=>{}],createElement:(type,props,...children)=>({type,props:{...props,children}})};
const exports={};vm.runInNewContext(code,{exports,React,require:p=>p==='react'?React:p.includes('materialVatEstimate')?vat:p.includes('costBrandGroups')?groups:{},console});
const row=(brand,amount)=>({siteId:'site',brand,dealer:brand,amount});
const data={totals:{material:5477890,labor:100},breakdown:{material:[row('영림',2663800),row('현대보닥',2046690),row('Lx',767400)],labor:[]}};
test('brand and supplier cards display recorded costs and VAT-exclusive estimates',()=>{
 for(const itemKey of ['brand','dealer']){
  const result=exports.Breakdown({data,type:'material',title:'자재비',itemKey,vatSummary:{base:5477890,tax:547789,total:6025679}});
  const text=JSON.stringify(result);
  for(const expected of ['5,477,890원','예상 부가세','547,789원','6,025,679원','부가세 별도','266,380원','2,930,180원'])assert.ok(text.includes(expected),expected);
 }
});
test('non-material cost cards do not display VAT',()=>{
 const result=exports.Breakdown({data,type:'labor',title:'인건비',itemKey:'name'});
 assert.ok(!JSON.stringify(result).includes('부가세'));
});
