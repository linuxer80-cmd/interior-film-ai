import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const {code} = swc.transformSync(fs.readFileSync(new URL('../app/admin/FirstSiteGuide.js', import.meta.url), 'utf8'), {jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const all=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(c=>all(c,p)):[...(p(n)?[n]:[]),...all(n.props?.children,p)];

function fixture({rows=[], error=null, dismissed=false, preview=false}={}) {
  let cursor=0,mounted=false,started=0,requestedCompany=null;
  const slots=[],effects=[],storage=new Map(dismissed ? [['first-site-guide:co:user','dismissed']] : []);
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],next=>slots[i]=next];},useEffect(fn){if(!mounted)effects.push(fn);}};
  const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'user'}}}})},from(table){assert.equal(table,'sites');return {select(){return this},eq(key,value){assert.equal(key,'company_id');requestedCompany=value;return this},limit:async()=>({data:rows,error})};}};
  const exports={};
  const window={location:{search:preview?'?firstSiteGuide=preview':''},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};
  vm.runInNewContext(code,{exports,React,window,URLSearchParams,require(path){if(path==='react')return React;if(path.includes('supabase'))return {supabase};throw Error(path);}});
  const render=()=>{cursor=0;return exports.default({companyId:'co',onStart:()=>started++});};
  return {render,storage,get started(){return started},get requestedCompany(){return requestedCompany},mount:async()=>{render();mounted=true;effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));}};
}

test('an empty company can start first site registration and dismiss the guide',async()=>{
  const f=fixture();await f.mount();let tree=f.render();assert.ok(tree);assert.equal(f.requestedCompany,'co');
  const buttons=all(tree,n=>n.type==='button');buttons.find(n=>n.props.onClick&&n.props.children.includes('첫 현장 등록하기 →')).props.onClick();assert.equal(f.started,1);
  buttons.find(n=>n.props['aria-label']==='첫 현장 등록 안내 닫기').props.onClick();assert.equal(f.render(),null);assert.equal(f.storage.get('first-site-guide:co:user'),'dismissed');
});
test('existing sites, failed reads and dismissed guidance do not show a first-site card',async()=>{
  for(const options of [{rows:[{id:'site'}]},{rows:null,error:{message:'failure'}},{dismissed:true}]){const f=fixture(options);await f.mount();assert.equal(f.render(),null);}
});
test('preview shows the guide to an existing company without changing its dismissed state',async()=>{
  const f=fixture({rows:[{id:'existing'}],dismissed:true,preview:true});await f.mount();const tree=f.render();assert.ok(tree);
  all(tree,n=>n.type==='button').find(n=>n.props['aria-label']==='첫 현장 등록 안내 닫기').props.onClick();
  assert.equal(f.storage.get('first-site-guide:co:user'),'dismissed');assert.equal(f.render(),null);
});
