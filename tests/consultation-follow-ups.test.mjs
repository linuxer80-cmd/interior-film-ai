import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cleanFollowUp,validDate} from '../lib/consultationFollowUp.mjs';
const id='00000000-0000-0000-0000-000000000001';
const valid={id,companyId:'A',title:'상담',stage:'draft',action:'estimate',date:'2026-11-10',revision:0};
function fixture(){
 const rows=[];let denied=false;
 const db={from(){let filters=[],mode='',value,single=false;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},range(){return q},insert(v){mode='insert';value=v;return q},update(v){mode='update';value=v;return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve){let error=null,data;if(mode==='insert'){if(rows.some(r=>r.id===value.id))error={code:'23505'};else{data={...value,revision:1};rows.push(data)}}else if(mode==='update'){data=rows.find(r=>filters.every(f=>f(r)))||null;if(data)Object.assign(data,value)}else data=rows.filter(r=>filters.every(f=>f(r)));return Promise.resolve({data,error}).then(resolve)}};return q}};
 const context=vm.createContext({URL,Response,Date,Number,JSON,Error,cleanFollowUp,uuid:v=>v===id,privateJson:(v,s=200)=>Response.json(v,{status:s}),privateAuth:async()=>denied?{error:'denied',status:403}:{db,companyId:'A'}});
 const src=readFileSync(new URL('../app/api/admin/consultation-follow-ups/route.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');vm.runInContext(src,context);
 const post=b=>context.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify(b)}));
 return {rows,post,get:company=>context.GET(new Request('https://example.test?companyId='+company)),deny:()=>{denied=true}};
}
test('invalid dates, stages and revisions are rejected',()=>{for(const date of ['2026-02-30','2026-13-01','1999-01-01'])assert.equal(validDate(date),false);for(const body of [{...valid,stage:'__proto__'},{...valid,revision:-1},{...valid,title:''},{...valid,date:'tomorrow'}])assert.throws(()=>cleanFollowUp(body));assert.equal(cleanFollowUp({...valid,date:''}).due_date,null);});
test('create retry cannot duplicate or overwrite saved state',async()=>{const f=fixture();assert.equal((await f.post(valid)).status,200);assert.equal((await f.post({...valid,title:'overwrite'})).status,409);assert.equal(f.rows.length,1);assert.equal(f.rows[0].title,'상담');});
test('stale device update conflicts and retains latest changes',async()=>{const f=fixture();await f.post(valid);assert.equal((await f.post({...valid,revision:1,stage:'sent'})).status,200);assert.equal((await f.post({...valid,revision:1,stage:'closed'})).status,409);assert.equal(f.rows[0].stage,'sent');});
test('company mismatch and nonowners cannot read or write',async()=>{const f=fixture();await f.post(valid);assert.equal((await f.post({...valid,companyId:'B',revision:1})).status,403);assert.equal((await f.get('B')).status,403);f.deny();assert.equal((await f.get('A')).status,403);assert.equal((await f.post(valid)).status,403);});
