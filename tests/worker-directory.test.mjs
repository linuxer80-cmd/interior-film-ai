import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicDirectoryProfile,pendingConnection} from '../lib/workerDirectory.mjs';

test('directory returns only approved public fields even if database adds private columns',()=>{
 const result=publicDirectoryProfile({user_id:'one',name:'시공자',phone:'private',account_number:'private',departure_address:'private',age:40,gender:'male',photo_path:'internal',company_id:'private'});
 assert.equal(result.name,'시공자');
 for(const field of ['phone','account_number','departure_address','age','gender','photo_path','company_id']) assert.equal(field in result,false);
});

test('API authenticates, binds actor and strips private data from search',async()=>{
 let auth={error:'로그인 필요',status:401},calls=[];
 const source=(await readFile(new URL('../app/api/worker-directory/route.js',import.meta.url),'utf8'))
  .replace(/import .*?from .*?;\n/g,'');
 const make=new Function('privateAuth','privateJson','uuid','publicDirectoryProfile','directoryBadges',source.replace('export async function GET','async function GET').replace('export async function POST','async function POST')+';return {GET,POST};');
 const api=make(async()=>auth,(data,status=200)=>Response.json(data,{status}),s=>typeof s==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s),publicDirectoryProfile,async(_db,profiles)=>profiles);
 const get=()=>new Request('https://example.test/api/worker-directory?mode=search');
 const post=body=>new Request('https://example.test/api/worker-directory',{method:'POST',body:JSON.stringify(body)});
 assert.equal((await api.GET(get())).status,401);
 auth={user:{id:'real-user',email_confirmed_at:null}};
 assert.equal((await api.GET(get())).status,403);
 auth={user:{id:'real-user',email_confirmed_at:'2026-01-01'},db:{from(table){assert.equal(table,'labor_profiles');return {select(fields){assert.equal(fields,'user_id,name');return {in(key,ids){assert.equal(key,'user_id');assert.equal(ids.length,30);assert.ok(!ids.includes('30'));return Promise.resolve({data:ids.map(id=>({user_id:id,name:'최정민'}))});}};}};},rpc:async(name,args)=>{calls.push(args);return {data:{profiles:Array.from({length:31},(_,i)=>({user_id:String(i),name:'최○민',phone:'secret',photo_path:'avatar'}))}};},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'signed-photo'}})})}}};
 const response=await api.GET(get());const result=await response.json();
 assert.equal(result.profiles[0].name,'최정민');assert.equal(result.profiles.length,30);assert.equal(result.hasMore,true);
 assert.equal(result.profiles[0].photo_url,'signed-photo');assert.equal('phone' in result.profiles[0],false);assert.equal('photo_path' in result.profiles[0],false);
 assert.equal(calls.at(-1).p_actor,'real-user');
 const count=calls.length;
 assert.equal((await api.POST(post({action:'accept',id:'a',revision:1,consent:true}))).status,400);
 assert.equal((await api.POST(post({action:'accept',id:'11111111-1111-1111-1111-111111111111',revision:1,consent:false}))).status,400);
 assert.equal(calls.length,count);
 await api.POST(post({action:'consent',visible:true,p_actor:'spoofed',company_id:'other-company'}));
 assert.equal(calls.at(-1).p_actor,'real-user');
 auth.db.rpc=async()=>({error:{code:'42501',message:'권한 없음'}});
 assert.equal((await api.GET(get())).status,403);
 auth.db.rpc=async()=>({error:{code:'PGRST202'}});
 assert.equal((await api.GET(get())).status,503);
});
test('only pending unexpired active-company requests are actionable',()=>{
 const now=Date.parse('2026-10-15T09:00:00Z');
 const row={status:'pending',expires_at:'2026-10-16T09:00:00Z',company_active:true};
 assert.equal(pendingConnection(row,now),true);
 for(const status of ['accepted','declined','cancelled']) assert.equal(pendingConnection({...row,status},now),false);
 assert.equal(pendingConnection({...row,expires_at:'2026-10-15T09:00:00Z'},now),false);
 assert.equal(pendingConnection({...row,company_active:false},now),false);
 assert.equal(pendingConnection({...row,expires_at:'invalid'},now),false);
});
