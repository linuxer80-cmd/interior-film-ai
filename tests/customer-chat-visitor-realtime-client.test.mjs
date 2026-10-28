import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=await swc.transform(fs.readFileSync(new URL('../app/components/useVisitorChatRealtime.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
const tick=()=>new Promise(r=>setTimeout(r,5));
test('visitor uses an isolated private client and refreshes after event and reconnect',async()=>{
 let effect,channel,removed=false,refreshes=0;const statuses=[];
 const client={realtime:{setAuth:async()=>{}},channel:(topic,options)=>{assert.equal(topic,'secret-topic');assert.equal(options.config.private,true);return channel={on(_type,_filter,cb){this.event=cb;return this;},subscribe(cb){this.status=cb;return this;}};},removeChannel:()=>{removed=true;}};
 const hooks={useState:v=>[v,x=>statuses.push(x)],useRef:v=>({current:v}),useEffect:fn=>{effect=fn;}};
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.com',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public'}},require:name=>name==='react'?hooks:name==='@supabase/supabase-js'?{createClient:(_url,_key,options)=>{assert.equal(options.auth.persistSession,false);assert.equal(options.auth.detectSessionInUrl,false);return client;}}:require(name)});
 module.exports.default('secret-topic',()=>refreshes++);const cleanup=effect();await tick();
 channel.status('SUBSCRIBED');assert.equal(statuses.at(-1),true);assert.equal(refreshes,1);
 channel.event();assert.equal(refreshes,2);channel.status('CHANNEL_ERROR');assert.equal(statuses.at(-1),false);
 channel.status('SUBSCRIBED');assert.equal(refreshes,3);cleanup();assert.equal(removed,true);
});
