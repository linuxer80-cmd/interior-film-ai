import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const transform=async(path,jsx=false)=>(await swc.transform(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx},...(jsx?{transform:{react:{runtime:'automatic'}}}:{})},module:{type:'commonjs'}})).code;
const tick=()=>new Promise(r=>setTimeout(r,10));
test('private administrator connection refreshes on events and invalidates on account change',async()=>{
 const code=await transform('../app/admin/customer-chat/useAdminCustomerRealtime.js');let effect,authCallback,channel,removed=false,unsubscribed=false;const status=[],events=[];
 const session={access_token:'token',user:{id:'owner'}};
 const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:cb=>{authCallback=cb;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};}},realtime:{setAuth:async()=>{}},channel:(topic,options)=>{assert.equal(topic,'customer-chat-admin:company');assert.equal(options.config.private,true);return channel={on(_type,_filter,cb){this.event=cb;return this;},subscribe(cb){this.status=cb;return this;}};},removeChannel:()=>{removed=true;}};
 const hooks={useState:initial=>[initial,x=>status.push(x)],useRef:v=>({current:v}),useEffect:fn=>{effect=fn;}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,setTimeout,require:name=>name==='react'?hooks:name.includes('lib/supabase')?{supabase}:require(name)});
 module.exports.default({companyId:'company',userId:'owner'},kind=>events.push(kind));const cleanup=effect();await tick();
 channel.status('SUBSCRIBED');assert.equal(status.at(-1),true);assert.equal(events.at(-1),'changed');
 channel.event();assert.equal(events.filter(x=>x==='changed').length,2);
 channel.status('CHANNEL_ERROR');assert.equal(status.at(-1),false);
 authCallback('SIGNED_IN',{user:{id:'other'}});await tick();assert.equal(status.at(-1),false);assert.equal(removed,true);assert.equal(events.at(-1),'auth');
 cleanup();assert.equal(unsubscribed,true);
});
test('administrator uses longer safety check only when connected; guest retains 5-second checks',async()=>{
 const code=await transform('../app/components/CustomerChat.js',true);
 async function intervalFor(admin,connected){
  const effects=[],timers=[];let index=0;
  const hooks={useState:v=>[v,()=>{}],useRef:v=>({current:v}),useCallback:fn=>fn,useEffect:(fn,deps)=>effects.push({fn,deps})};
  const supabase={auth:{getSession:async()=>({data:{session:{access_token:'t'}}})}};
  const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}},window={addEventListener(){},removeEventListener(){}};
  const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,document,window,URL,AbortSignal,FormData,setInterval:(_fn,ms)=>{timers.push(ms);return ++index;},clearInterval(){},require:name=>name==='react'?hooks:name.includes('lib/supabase')?{supabase}:name.includes('useVisitorChatRealtime')?{__esModule:true,default:()=>false}:name.endsWith('.css')?{__esModule:true,default:{}}:name==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:require(name),fetch:async()=>({ok:true,json:async()=>({messages:[],thread:null,hasOlder:false})})});
  module.exports.ChatConversation({url:'/api/chat',admin,realtimeConnected:connected});
  const chatEffect=effects.find(x=>x.deps?.length===6&&x.deps[1]===admin&&x.deps[2]===connected);assert.ok(chatEffect);const cleanup=chatEffect.fn();await tick();cleanup();return timers[0];
 }
 assert.equal(await intervalFor(true,true),60000);
 assert.equal(await intervalFor(true,false),5000);
 assert.equal(await intervalFor(false,false),5000);
});
