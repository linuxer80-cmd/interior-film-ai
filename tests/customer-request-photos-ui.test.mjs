import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=swc.transformSync(fs.readFileSync(new URL('../app/customer/site/[token]/RequestPhotos.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
function fixture(fetcher){
 const slots=[],revoked=[];let cursor=0,effects=[],tree;
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))slots[i]={fn,deps};return slots[i].fn;},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old[j])){slots[i]=deps;effects.push(fn);}}};
 const exports={};vm.runInNewContext(code,{exports,React,crypto,FormData,File,AbortSignal,fetch:fetcher,URL:{createObjectURL:()=>`blob:${crypto.randomUUID()}`,revokeObjectURL:u=>revoked.push(u)},require(path){if(path==='react')return React;if(path.includes('prepareCustomerPhoto'))return {prepareCustomerPhoto:async f=>f};return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};}});
 const render=()=>{cursor=0;effects=[];tree=exports.default({token:'signed-customer-token'});const pending=effects;effects=[];pending.forEach(fn=>fn());return tree;};
 return {render,revoked,get tree(){return tree;},get button(){return nodes(tree).find(n=>n.type==='button'&&/장 보내기|전송 확인/.test(text(n)));},async choose(count=2){const input=nodes(tree).find(n=>n.type==='input'&&n.props.multiple);await input.props.onChange({target:{files:Array.from({length:count},(_,i)=>new File(['image'],'photo'+i+'.jpg',{type:'image/jpeg'})),value:''}});render();}};
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('customer portal renders the photo sender for consulting and scheduled sites only',()=>{
 const source=fs.readFileSync(new URL('../app/customer/site/[token]/portal.js',import.meta.url),'utf8');
 const transformed=swc.transformSync(source,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
 const RequestPhotos=()=>null,React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:()=>['',()=>{}]},exports={};
 vm.runInNewContext(transformed.code,{exports,React,require(path){
  if(path==='react')return React;
  if(path.includes('customerStages'))return {CUSTOMER_STAGES:{before:{},completion:{},care:{}}};
  if(path==='./RequestPhotos')return {__esModule:true,default:RequestPhotos};
  return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
 }});
 for(const status of ['consulting','scheduled','in_progress','completed','cancelled','canceled',null,undefined,'unknown']){
  const tree=exports.default({token:'customer-token',site:{status,site_name:'테스트',work_dates:[]},company:{company_name:'테스트 업체'},profile:{},cases:[],remaining:3,stageData:{stage:'before'}});
  const senders=nodes(tree).filter(n=>n.type===RequestPhotos);
  assert.equal(senders.length,['consulting','scheduled'].includes(status)?1:0,String(status));
  if(senders.length)assert.equal(senders[0].props.token,'customer-token');
 }
});
test('real customer form keeps same files/id after lost response, prevents duplicate edits, then clears on confirmed save',async()=>{
 const posts=[];let historyReads=0;
 const f=fixture(async(url,options)=>{assert.equal(url,'/api/customer-portal/photos');assert.equal(options.headers.Authorization,'Bearer signed-customer-token');
  if(options.method!=='POST'){historyReads++;return json({batches:[]});}posts.push(options.body);if(posts.length===1)throw Error('lost response');return json({success:true,count:2,duplicate:true});});
 f.render();assert.equal(nodes(f.tree).filter(n=>n.type==='input'&&n.props.className==='hiddenPhotoInput').length,2);
 await f.choose();nodes(f.tree).find(n=>n.type==='textarea').props.onChange({target:{value:'측면도 부탁해요'}});f.render();
 await f.button.props.onClick();f.render();assert.match(text(f.tree),/중복 없이 확인/);assert.equal(nodes(f.tree).find(n=>n.type==='textarea').props.disabled,true);
 await f.button.props.onClick();f.render();assert.equal(posts[0].get('requestId'),posts[1].get('requestId'));assert.equal(posts[1].get('note'),'측면도 부탁해요');assert.equal(posts[1].getAll('photos').length,2);
 assert.match(text(f.tree),/사진 2장을 보냈어요/);assert.equal(nodes(f.tree).filter(n=>n.type==='textarea').length,0);assert.equal(f.revoked.length,2);assert.ok(historyReads>=2);
});
test('photo removal changes submitted count, validation failures preserve editable draft and input limits reject 11 photos',async()=>{
 const posts=[];const f=fixture(async(_url,o)=>{if(o.method!=='POST')return json({batches:[]});posts.push(o.body);return json({error:'상담 중인 현장에서 보내주세요.'},403);});
 f.render();await f.choose(11);assert.equal(f.button,undefined);assert.match(text(f.tree),/10장까지/);
 await f.choose(2);nodes(f.tree).find(n=>n.props?.['aria-label']==='사진 1 삭제').props.onClick();f.render();assert.match(text(f.button),/1장/);
 await f.button.props.onClick();f.render();assert.equal(posts[0].getAll('photos').length,1);assert.equal(nodes(f.tree).find(n=>n.type==='textarea').props.disabled,false);assert.match(text(f.tree),/상담 중인 현장에서/);
});
test('photo notification opens the requested site, selects report tab, and focuses request photo section',()=>{
 const modal=fs.readFileSync(new URL('../app/admin/SiteDetailModal.js',import.meta.url),'utf8');
 const mapping=modal.match(/const SECTION_MENU = (\{[\s\S]*?\n\});/)[1];assert.equal(new Function('return '+mapping)().photos,'report');
 assert.match(modal,/id="admin-site-panel-photos"[\s\S]{0,150}taskSections\.current\.photos = element/);
 assert.match(modal,/taskSections\.current\[section\]/);assert.match(modal,/scrollIntoView\(\{ block: "start" \}\)/);
 const admin=fs.readFileSync(new URL('../app/admin/page.js',import.meta.url),'utf8');assert.match(admin,/pendingSiteIdRef\.current = params\.get\("site"\)/);assert.match(admin,/openSite\(site\)/);
 const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');assert.match(sw,/notificationclick/);assert.match(sw,/event\.notification\?\.data\?\.url/);
});
