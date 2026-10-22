import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as hierarchy from '../lib/photoHierarchy.mjs';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/super-admin/photo-data/page.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
function fixture(target){
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}})};const exports={};let current=target;
 vm.runInNewContext(code+'\nexports.editor=TargetEditor;', {exports,React,require(path){if(path==='react')return React;if(path==='next/link')return{__esModule:true,default:()=>null};if(path.includes('photoHierarchy'))return hierarchy;if(path.endsWith('page.module.css'))return{};if(path.includes('supabase'))return{};throw Error(path);}});
 return {render:()=>exports.editor({target:current,index:0,legacyPrice:280000,onChange:v=>current=v,onRemove:()=>{}}),value:()=>current};
}
test('editor keeps six levels in order and changes parent without retaining incompatible child labels',()=>{
 const f=fixture(hierarchy.newTarget('00000000-0000-4000-8000-000000000001'));const labels=all(f.render(),n=>n.type==='label').map(text);
 assert.deepEqual(labels.slice(0,6).map(x=>x.slice(0,3)),['1단계','2단계','3단계','4단계','5단계','6단계']);
 const part=all(f.render(),n=>n.type==='label'&&text(n).startsWith('2단계'))[0];all(part,n=>n.type==='select')[0].props.onChange({target:{value:'화장대'}});
 assert.equal(f.value().part,'화장대');assert.equal(f.value().kind,'확인 필요');assert.equal(f.value().components.length,0);
 assert.match(text(f.render()),/수납장 결합 화장대/);
});
test('a legacy amount is copied to a target only through its explicit apply button',()=>{
 const f=fixture(hierarchy.newTarget('00000000-0000-4000-8000-000000000001'));assert.equal(f.value().price,null);
 all(f.render(),n=>n.type==='button'&&text(n).includes('이 대상에 적용'))[0].props.onClick();assert.equal(f.value().price,280000);assert.match(f.value().priceNote,/이 대상에 적용 확인/);
});
test('door component toggles keep a single set from being priced with duplicate door/frame components',()=>{
 const f=fixture({...hierarchy.newTarget('00000000-0000-4000-8000-000000000001'),components:['문짝']});
 all(f.render(),n=>n.type==='button'&&text(n)==='문·문틀 세트')[0].props.onClick();assert.deepEqual(Array.from(f.value().components),['문·문틀 세트']);
 all(f.render(),n=>n.type==='button'&&text(n)==='문틀')[0].props.onClick();assert.deepEqual(Array.from(f.value().components),['문틀']);
});
