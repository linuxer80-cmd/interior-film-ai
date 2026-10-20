import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as secrets from '../lib/calendarAutoCrypto.mjs';
import { CALENDAR_SCOPE } from '../lib/googleCalendar.mjs';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {code}=await swc.transform(fs.readFileSync(new URL('../app/api/calendar/auto/[action]/route.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
process.env.CALENDAR_TOKEN_ENCRYPTION_KEY='ab'.repeat(32);process.env.GOOGLE_CLIENT_ID='test';process.env.GOOGLE_CLIENT_SECRET='secret';
const origin=secrets.APP_ORIGIN;
function setup({user='u',pending=null}={}) {
  const calls=[],exchanged=[],stored=[],exports={};
  const db={from(table){const op={table,filters:[]};calls.push(op);const q={};
    for(const method of ['select','delete','update','upsert','eq','is','gt','lt','not'])q[method]=(...args)=>{if(['eq','is','gt','lt','not'].includes(method))op.filters.push([method,...args]);else {op[method]=args;if(method==='upsert')stored.push(args[0]);}return q;};
    q.maybeSingle=async()=>({data:table==='calendar_auto_pending'?pending:null,error:null});q.then=(resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject);return q;
  }};
  const crypto={...secrets,googleToken:async fields=>{exchanged.push(fields);return {access_token:'access',refresh_token:'refresh',scope:CALENDAR_SCOPE};}};
  vm.runInNewContext(code,{exports,Response,URL,Date,crypto:globalThis.crypto,process:{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://test',SUPABASE_SERVICE_ROLE_KEY:'service',CRON_SECRET:'cron-private'}},require:path=>path.includes('workerPrivate')?{privateAuth:async()=>({db,user:{id:user}}),privateJson:(body,status=200)=>Response.json(body,{status})}:path.includes('supabase')?{createClient:()=>db}:path.includes('calendarAutoCrypto')?crypto:path.includes('googleCalendar')?{CALENDAR_SCOPE}:path.includes('calendarAutoSync')?{checked:async q=>{const r=await q;if(r.error)throw r.error;return r.data;},runAutoSync:async()=>({queued:true})}:assert.fail(path)});
  return {exports,calls,exchanged,stored};
}
const req=(action,{method='POST',cookie='',requestOrigin=origin,query=''}={})=>new Request(origin+'/api/calendar/auto/'+action+query,{method,headers:{Origin:requestOrigin,Cookie:cookie}});
const ctx=action=>({params:Promise.resolve({action})});
test('start binds hashed state to app user and sends only authorization URL with secure browser cookie',async()=>{
  const s=setup(),r=await s.exports.POST(req('start'),ctx('start'));assert.equal(r.status,200);const result=await r.json(),state=new URL(result.url).searchParams.get('state');assert.equal(s.stored[0].user_id,'u');assert.equal(s.stored[0].state_hash,secrets.hashState(state));assert.ok(r.headers.get('set-cookie').includes('HttpOnly; Secure; SameSite=Lax'));assert.ok(!JSON.stringify(result).includes('refresh'));
});
test('mutation is rejected from foreign origin before database access',async()=>{
  const s=setup(),r=await s.exports.POST(req('disconnect',{requestOrigin:'https://evil.test'}),ctx('disconnect'));assert.equal(r.status,403);assert.equal(s.calls.length,0);
});
test('callback rejects mismatched browser state without exchanging code or reading database',async()=>{
  const s=setup(),r=await s.exports.GET(req('callback',{method:'GET',cookie:secrets.OAUTH_COOKIE+'='+secrets.randomSecret(),query:'?state='+secrets.randomSecret()+'&code=private'}),ctx('callback'));assert.equal(r.status,303);assert.equal(r.headers.get('location'),origin+'/account/calendar?auto=error');assert.equal(s.calls.length,0);assert.equal(s.exchanged.length,0);
});
test('finish requires same authenticated user and a one-time unexpired pending row',async()=>{
  const state=secrets.randomSecret(),s=setup({user:'other'}),r=await s.exports.POST(req('finish',{cookie:secrets.OAUTH_COOKIE+'='+state}),ctx('finish'));assert.equal(r.status,400);assert.equal(s.exchanged.length,0);const q=s.calls[0];assert.ok(q.delete);assert.ok(q.filters.some(a=>a[0]==='eq'&&a[1]==='user_id'&&a[2]==='other'));assert.ok(q.filters.some(a=>a[0]==='gt'&&a[1]==='expires_at'));
});
test('successful finish consumes pending code with PKCE and saves encrypted offline token only on server',async()=>{
  const state=secrets.randomSecret(),hash=secrets.hashState(state),s=setup({pending:{user_id:'u',code_cipher:secrets.seal('auth-code','code:u:'+hash),verifier_cipher:secrets.seal('pkce','verifier:u:'+hash)}});
  const r=await s.exports.POST(req('finish',{cookie:secrets.OAUTH_COOKIE+'='+state}),ctx('finish'));assert.equal(r.status,200);assert.deepEqual(await r.json(),{connected:true});assert.equal(s.exchanged[0].code,'auth-code');assert.equal(s.exchanged[0].code_verifier,'pkce');assert.equal(s.stored[0].enabled,true);assert.equal(secrets.unseal(s.stored[0].refresh_cipher,'refresh:u'),'refresh');assert.ok(r.headers.get('set-cookie').includes('Max-Age=0'));
});
test('cron rejects missing or incorrect secret',async()=>{
  const s=setup(),r=await s.exports.GET(req('cron',{method:'GET'}),ctx('cron'));assert.equal(r.status,401);assert.equal(s.calls.length,0);
});
