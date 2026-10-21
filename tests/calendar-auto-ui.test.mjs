import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=await swc.transform(fs.readFileSync(new URL('../app/account/calendar/AutoCalendarConnection.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):!n||typeof n!=='object'?[]:[n,...nodes(n.props?.children)];
function harness(search='') {
  let cursor=0;const slots=[],effects=[],actions=[],redirects=[],exports={};
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v})},useEffect:f=>effects.push(f)};
  const supabase={auth:{
    getSession:async()=>({data:{session:{access_token:'app-token'}}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
  }};
  vm.runInNewContext(code,{exports,React,Date,Intl,URLSearchParams,
    window:{location:{search,assign:url=>redirects.push(url)},history:{replaceState(){}}},
    fetch:async(url,opts)=>{
      actions.push({url,opts});
      return {ok:true,json:async()=>url.endsWith('/start')?{url:'https://accounts.google.com/consent'}:url.endsWith('/finish')?{connected:true}:{configured:true,connection:null}};
    },
    require(path){
      if(path==='react')return React;
      if(path.includes('supabase'))return {supabase};
      if(path==='next/dynamic')return {__esModule:true,default:()=>()=>{}};
      return {__esModule:true,default:()=>{}};
    },
  });
  const render=()=>{cursor=0;return exports.default({embedded:true});};return {render,effects,actions,redirects};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
test('my sites exposes explicit ongoing consent; opening page never automatically opens Google consent',async()=>{
  const h=harness();h.render();h.effects[0]();await flush();assert.equal(h.actions.filter(a=>a.url.endsWith('/start')).length,0);
  const tree=h.render(),connect=nodes(tree).find(n=>n.type==='button'&&n.props.children.includes('동의하고 자동 연결하기'));assert.ok(connect);await connect.props.onClick();assert.deepEqual(h.redirects,['https://accounts.google.com/consent']);assert.equal(h.actions.find(a=>a.url.endsWith('/start')).opts.method,'POST');
});
test('Strict Mode effect replay consumes the same callback once',async()=>{
  const h=harness('?auto=finish');h.render();h.effects[0]();const cleanup=h.effects[1]();cleanup();h.effects[1]();await flush();assert.equal(h.actions.filter(a=>a.url.endsWith('/finish')).length,1);assert.ok(nodes(h.render()).some(n=>n.props?.role==='status'&&n.props.children.some(c=>String(c).includes('자동 연결을 완료'))));
});
