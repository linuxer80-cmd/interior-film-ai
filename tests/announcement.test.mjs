import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app/api/announcement/route.js',import.meta.url),'utf8').replace(/^import .*;\n/, '').replaceAll('export async function','async function');
function route(superUser=true) {
  const saved=[];
  const db={from(table){return table==='super_admins'?{select(){return this},eq(){return this},async maybeSingle(){return {data:superUser?{user_id:'test'}:null}}}:{async upsert(value){saved.push(value);return {error:null}}}}};
  const api=new Function('pilotIdentity','pilotJson',source+'\nreturn {POST,GET};')(async()=>({db,user:{id:'test'}}),(body,status=200)=>Response.json(body,{status}));
  return {...api,saved};
}
function req(body,origin='https://example.com'){return new Request('https://example.com/api/announcement',{method:'POST',headers:{origin},body:JSON.stringify(body)})}
test('only active super admin can save announcements',async()=>{const a=route(false);assert.equal((await a.POST(req({message:'공지',enabled:true}))).status,403);assert.equal(a.saved.length,0)});
test('cross-origin and blank published announcements are rejected',async()=>{const a=route();assert.equal((await a.POST(req({message:'공지',enabled:true},'https://other.test'))).status,403);assert.equal((await a.POST(req({message:' ',enabled:true}))).status,400);assert.equal(a.saved.length,0)});
test('save normalizes a single line and allows hiding',async()=>{const a=route();assert.equal((await a.POST(req({message:'공지\n내용',enabled:true}))).status,200);assert.equal(a.saved[0].message,'공지 내용');assert.equal((await a.POST(req({message:'',enabled:false}))).status,200)});
