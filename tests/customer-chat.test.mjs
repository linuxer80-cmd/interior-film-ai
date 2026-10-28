import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
const source=readFileSync(new URL('../lib/customerChatServer.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
function fixture({cookie='',thread=null,company='company-a',ownerCompany='company-a',previous=null}={}){
 const queries=[];const db={from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle(){return q},order(){return q},limit(){return q},lt(){return q},insert(value){queries.push({table,insert:value});return Promise.resolve({error:null})},then(resolve){queries.push({table,filters});let data=table==='companies'?{id:company,company_name:'업체'}:table==='customer_chat_threads'?thread:previous;return Promise.resolve({data,error:null}).then(resolve)}};return q;}};
 const funcs=new Function('createHash','randomBytes','createClient','NextResponse','priceOwner',source+';return {visitorChat,ownerChat,chatMessage,chatOrigin,saveChat};')(createHash,randomBytes,()=>db,{json:()=>({cookies:{set(){}}})},async()=>({db,companyId:ownerCompany}));
 const request=new Request('https://test/api/customer-chat?slug=film',{headers:{cookie,origin:'https://test'}});
 return {funcs,request,queries,db};
}
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test';
const id='00000000-0000-4000-8000-000000000001';
test('guest lookup scopes by active company and hashed browser secret',async()=>{
 const token='a'.repeat(64),key='film_chat_'+createHash('sha256').update('film').digest('hex').slice(0,16);
 const f=fixture({cookie:key+'='+token});const a=await f.funcs.visitorChat(f.request);
 assert.equal(a.hasCookie,true);assert.notEqual(a.hash,token);
 assert.deepEqual(f.queries.find(q=>q.table==='customer_chat_threads').filters,[['company_id','company-a'],['visitor_hash',createHash('sha256').update(token).digest('hex')]]);
 assert.ok(f.queries[0].filters.some(([k,v])=>k==='is_active'&&v===true));
});
test('authorized visitor receives a separate topic without adding it to thread data',async()=>{
 const token='a'.repeat(64),key='film_chat_'+createHash('sha256').update('film').digest('hex').slice(0,16);
 const topic='customer-chat-visitor:'+'b'.repeat(64);
 const f=fixture({cookie:key+'='+token,thread:{id,customer_name:'고객',last_owner_at:null,visitor_realtime_topic:topic}});
 const a=await f.funcs.visitorChat(f.request);assert.equal(a.realtimeTopic,topic);
 assert.equal(a.thread.visitor_realtime_topic,undefined);assert.equal(a.thread.id,id);
 assert.deepEqual(f.queries.find(q=>q.table==='customer_chat_threads').filters,[['company_id','company-a'],['visitor_hash',createHash('sha256').update(token).digest('hex')]]);
});
test('missing or invalid cookie creates fresh secret, never accepts thread ID as identity',async()=>{
 const f=fixture({cookie:'film_chat_bad=123'});const a=await f.funcs.visitorChat(f.request);assert.equal(a.hasCookie,false);assert.equal(a.hash.length,64);
});
test('administrator thread lookup is scoped to authenticated company',async()=>{
 const f=fixture({thread:{id}});await f.funcs.ownerChat(new Request('https://test/api/admin/customer-chat?thread='+id));
 assert.deepEqual(f.queries[0].filters,[['id',id],['company_id','company-a']]);
});
test('missing or foreign thread denies access',async()=>{
 const f=fixture();await assert.rejects(f.funcs.ownerChat(new Request('https://test/api/admin/customer-chat?thread='+id)),e=>e.status===404);
});
test('cross-origin and missing-origin writes rejected',()=>{
 const f=fixture();for(const origin of ['https://evil.example','null',''])assert.throws(()=>f.funcs.chatOrigin(new Request('https://test/api/customer-chat',{headers:{origin}})),e=>e.status===403);
 f.funcs.chatOrigin(f.request);
});
test('message validation rejects blank, oversized and malformed identifier',()=>{
 const f=fixture();for(const body of [{text:' ',messageId:id},{text:'x'.repeat(2001),messageId:id},{text:'Hi',messageId:'bad'}])assert.throws(()=>f.funcs.chatMessage(body));
 assert.equal(f.funcs.chatMessage({text:' 안녕하세요 ',messageId:id}),'안녕하세요');
});
test('retry of same message does not insert duplicate',async()=>{
 const f=fixture({previous:{id,body:'안녕하세요',sender:'customer'}});await f.funcs.saveChat(f.db,{id:'thread'},'customer',{text:'안녕하세요',messageId:id});assert.ok(!f.queries.some(q=>q.insert));
});
test('message retry cannot impersonate the other sender',async()=>{
 const f=fixture({previous:{id,body:'안녕하세요',sender:'owner'}});await assert.rejects(f.funcs.saveChat(f.db,{id:'thread'},'customer',{text:'안녕하세요',messageId:id}),e=>e.status===409);
});
test('writes set sender on server and reference only authorized thread',async()=>{
 const f=fixture();await f.funcs.saveChat(f.db,{id:'authorized'},'customer',{text:'문의',messageId:id,sender:'owner',thread_id:'other'});
 assert.deepEqual(f.queries.find(q=>q.insert).insert,{id,thread_id:'authorized',sender:'customer',body:'문의'});
});
