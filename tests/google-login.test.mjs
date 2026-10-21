import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), swc=require('next/dist/build/swc');
await swc.loadBindings();
const compiled={};
for(const [name,path] of Object.entries({owner:'app/login/OwnerLogin.js',callback:'app/auth/google/page.js',button:'app/components/GoogleLoginButton.js',account:'app/account/google/page.js'})) {
 compiled[name]=(await swc.transform(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}})).code;
}
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):!n||typeof n!=='object'?[]:[n,...nodes(n.props?.children)];
const tick=()=>new Promise(r=>setTimeout(r,0));
function harness(name,{query='',hash='',user={id:'existing',identities:[{provider:'google'}]},company={company_id:'company',role:'owner',is_active:true},complete=true,pending=null}={}) {
 const effects=[],slots=[],redirects=[],calls=[],storage=new Map(pending?[['film-google-link',JSON.stringify(pending)]]:[]);let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v})},useEffect:f=>effects.push(f)};
 const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test'}}}),getUser:async()=>({data:{user}}),signInWithOAuth:async v=>{calls.push(['login',v]);return {data:{url:'https://provider.test'}}},linkIdentity:async v=>{calls.push(['link',v]);return {data:{url:'https://provider.test'}}},signInWithPassword:async()=>({data:{user,session:{access_token:'test'}}}),signOut:async()=>({})},rpc:async name=>{calls.push(['rpc',name]);return {data:company}}};
 const exports={};vm.runInNewContext(compiled[name],{exports,React,URL,URLSearchParams,Date,window:{location:{origin:'https://interior-film-ai.vercel.app',search:query,hash,replace:v=>redirects.push(v)},history:{replaceState:()=>{}}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},require:p=>p==='react'?React:p==='next/navigation'?{useRouter:()=>({replace:v=>redirects.push(v),refresh:()=>{}})}:p.includes('supabase')?{supabase}:p.includes('workerProfileRequirements')?{workerProfileRequirements:async()=>({authenticated:true,complete})}:{__esModule:true,default:()=>{}}});
 return {render(props={}){cursor=0;return exports.default(props)},async start(){this.render();effects[0]?.();await tick();await tick();},redirects,calls,storage};
}
test('Google button uses current origin and fixed callback; repeated clicks start one request',async()=>{const h=harness('button');const button=nodes(h.render({role:'worker'})).find(n=>n.type==='button');await Promise.all([button.props.onClick(),button.props.onClick()]);assert.equal(h.calls.length,1);const args=h.calls[0][1];assert.equal(args.provider,'google');assert.equal(args.options.redirectTo,'https://interior-film-ai.vercel.app/auth/google?role=worker');assert.equal(args.options.queryParams.prompt,'select_account');assert.ok(!args.options.scopes);});
test('owner landing requires actual company membership and never trusts query role as authorization',async()=>{const h=harness('callback');await h.start();assert.deepEqual(h.redirects,['/admin']);for(const company of [null,{company_id:'c',role:'worker'},{company_id:'c',role:'owner',is_active:false}]){const h=harness('callback',{query:'?role=owner&next=https://evil.test',company});await h.start();assert.equal(h.redirects.length,0);}});
test('callback refuses a session without a Google identity',async()=>{const h=harness('callback',{user:{id:'existing',identities:[{provider:'email'}]}});await h.start();assert.equal(h.redirects.length,0);assert.equal(h.calls.length,0);});
test('worker completion and dealer route keep existing role-specific flows',async()=>{for(const [query,complete,expected] of [['?role=worker',true,'/worker'],['?role=dealer',true,'/dealer']]){const h=harness('callback',{query,complete});await h.start();assert.deepEqual(h.redirects,[expected]);}});
test('cancelled OAuth does not use a previous session to enter the app',async()=>{const h=harness('callback',{query:'?error=access_denied'});await h.start();assert.equal(h.redirects.length,0);assert.equal(h.calls.length,0);});
test('link callback requires same user and fresh pending marker',async()=>{for(const pending of [null,{userId:'other',createdAt:Date.now()},{userId:'existing',createdAt:Date.now()-16*60*1000}]){const h=harness('callback',{query:'?mode=link',pending});await h.start();assert.equal(h.redirects.length,0);assert.ok(nodes(h.render()).some(n=>n.props?.role==='alert'));}const h=harness('callback',{query:'?mode=link',pending:{userId:'existing',createdAt:Date.now()}});await h.start();assert.equal(h.redirects.length,0);assert.equal(h.storage.has('film-google-link'),false);assert.ok(nodes(h.render()).some(n=>n.props?.role==='status'&&JSON.stringify(n.props.children).includes('연결이 완료')));});
test('existing account linking uses linkIdentity without creating a company or signing into another user',async()=>{const h=harness('account',{user:{id:'existing',email:'owner@example.test',identities:[{provider:'email'}]}});await h.start();const b=nodes(h.render()).find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('다음부터 구글'));await b.props.onClick();assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'link');assert.equal(h.calls[0][1].provider,'google');assert.ok(h.calls[0][1].options.redirectTo.includes('mode=link'));assert.equal(JSON.parse(h.storage.get('film-google-link')).userId,'existing');});

test('incomplete Google worker stops before registration and can return to worker login',async()=>{
 const h=harness('callback',{query:'?role=worker',complete:false});await h.start();
 assert.deepEqual(h.redirects,[]);
 const tree=nodes(h.render());
 assert.ok(tree.some(n=>n.props?.href==='/worker/account?required=1'));
 assert.ok(tree.some(n=>n.props?.href==='/worker/forgot-password'));
 const existing=tree.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('기존 계정'));
 assert.ok(existing);await existing.props.onClick();assert.deepEqual(h.redirects,['/worker/login']);
});

test('owner login without membership never creates company from stale signup metadata',async()=>{
 const h=harness('owner',{company:[],user:{id:'existing',user_metadata:{company_name:'Existing business'}}});
 let tree=nodes(h.render());
 tree.find(n=>n.type==='input'&&n.props.type==='email').props.onChange({target:{value:'owner@example.test'}});
 tree.find(n=>n.type==='input'&&n.props.type==='password').props.onChange({target:{value:'password'}});
 await nodes(h.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(h.redirects,[]);
 assert.deepEqual(h.calls,[['rpc','get_my_company']]);
 tree=nodes(h.render());
 assert.ok(tree.some(n=>n.props?.href==='/signup?existing=1'));
 const back=tree.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('다시 로그인'));
 assert.ok(back);await back.props.onClick();
 assert.ok(nodes(h.render()).some(n=>n.type==='form'));
});
