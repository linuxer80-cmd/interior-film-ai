import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');
await swc.loadBindings();
const {code}=await swc.transform(fs.readFileSync('app/api/test/door-estimate/route.js','utf8'),{jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
function route(){let calls=0;const db={from(table){const q={select(){return q},eq(){return q},order(){return Promise.resolve({data:[]})},maybeSingle(){return Promise.resolve({data:table==='companies'?{id:'company',slug:'test'}:null})}};return q}};
const ctx={exports:{},Response,URL,Buffer,console,process:{env:{}},require(name){if(name==='@supabase/supabase-js')return {createClient:()=>db};if(name==='sharp')return ()=>{throw Error('unexpected image processing')};if(name.includes('doorVision'))return {describeDoor:()=>{calls++;throw Error('unexpected AI')}};return {};}};vm.createContext(ctx);vm.runInContext(code,ctx);return {...ctx.exports,calls:()=>calls};}
test('anonymous setup cannot read private source photos',async()=>{const r=route();const res=await r.GET(new Request('https://example.test/api/test/door-estimate'));assert.equal(res.status,401);assert.equal(r.calls(),0)});
test('anonymous cannot analyze samples even with company slug',async()=>{const r=route(),f=new FormData();f.set('company_slug','test');f.set('action','sample');const res=await r.POST(new Request('https://example.test',{method:'POST',body:f}));assert.equal(res.status,401);assert.equal(r.calls(),0)});
test('empty dataset blocks customer AI request',async()=>{const r=route(),f=new FormData();f.set('company_slug','test');f.set('action','match');const res=await r.POST(new Request('https://example.test',{method:'POST',body:f}));assert.equal(res.status,409);assert.equal(r.calls(),0)});
