import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cleanFollowUp,validDate} from '../lib/consultationFollowUp.mjs';
const id='00000000-0000-0000-0000-000000000001';
const valid={id,companyId:'A',title:'상담',stage:'draft',action:'estimate',date:'2026-11-10',revision:0};
function fixture(){
 const rows=[];const sites=[{id,company_id:"A"}];let denied=false;
 const db={from(table){const records=table==='sites'?sites:rows;let filters=[],mode='',value,single=false;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},lte(k,v){filters.push(r=>r[k]!=null&&r[k]<=v);return q},order(){return q},range(){return q},insert(v){mode='insert';value=v;return q},update(v){mode='update';value=v;return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve){let error=null,data;if(mode==='insert'){if(records.some(r=>r.id===value.id))error={code:'23505'};else{data={...value,revision:1};records.push(data)}}else if(mode==='update'){data=records.find(r=>filters.every(f=>f(r)))||null;if(data)Object.assign(data,value)}else data=records.filter(r=>filters.every(f=>f(r)));if(single&&Array.isArray(data))data=data[0]||null;return Promise.resolve({data,error}).then(resolve)}};return q}};
 const context=vm.createContext({URL,Response,Date,Number,JSON,Error,cleanFollowUp,validDate,uuid:v=>v===id,privateJson:(v,s=200)=>Response.json(v,{status:s}),privateAuth:async()=>denied?{error:'denied',status:403}:{db,companyId:'A'}});
 const src=readFileSync(new URL('../app/api/admin/consultation-follow-ups/route.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');vm.runInContext(src,context);
 const post=b=>context.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify(b)}));
 return {rows,sites,post,get:(company,suffix='')=>context.GET(new Request('https://example.test?companyId='+company+suffix)),deny:()=>{denied=true}};
}
test('invalid dates, stages and revisions are rejected',()=>{for(const date of ['2026-02-30','2026-13-01','1999-01-01'])assert.equal(validDate(date),false);for(const body of [{...valid,stage:'__proto__'},{...valid,revision:-1},{...valid,title:''},{...valid,date:'tomorrow'}])assert.throws(()=>cleanFollowUp(body));assert.equal(cleanFollowUp({...valid,date:''}).due_date,null);});
test('create retry cannot duplicate or overwrite saved state',async()=>{const f=fixture();assert.equal((await f.post(valid)).status,200);assert.equal((await f.post({...valid,title:'overwrite'})).status,409);assert.equal(f.rows.length,1);assert.equal(f.rows[0].title,'상담');});
test('stale device update conflicts and retains latest changes',async()=>{const f=fixture();await f.post(valid);assert.equal((await f.post({...valid,revision:1,stage:'sent'})).status,200);assert.equal((await f.post({...valid,revision:1,stage:'closed'})).status,409);assert.equal(f.rows[0].stage,'sent');});
test('company mismatch and nonowners cannot read or write',async()=>{const f=fixture();await f.post(valid);assert.equal((await f.post({...valid,companyId:'B',revision:1})).status,403);assert.equal((await f.get('B')).status,403);f.deny();assert.equal((await f.get('A')).status,403);assert.equal((await f.post(valid)).status,403);});

test('site links are validated and omission preserves the existing link',async()=>{const f=fixture();assert.equal((await f.post({...valid,siteId:id})).status,200);assert.equal(f.rows[0].site_id,id);await f.post({...valid,revision:1,stage:'sent'});assert.equal(f.rows[0].site_id,id);assert.equal((await f.post({...valid,revision:2,siteId:'invalid'})).status,400);});

test('foreign site cannot be attached to a company consultation',async()=>{const f=fixture();f.sites[0].company_id='B';assert.equal((await f.post({...valid,siteId:id})).status,403);assert.equal(f.rows.length,0);});
test('contact due filter excludes closed, undated and future consultations',async()=>{const f=fixture();f.rows.push({id:'1',company_id:'A',stage:'draft',due_date:'2026-11-06'},{id:'2',company_id:'A',stage:'closed',due_date:'2026-11-06'},{id:'3',company_id:'A',stage:'draft',due_date:null},{id:'4',company_id:'A',stage:'draft',due_date:'2026-11-08'});const response=await f.get('A','&due=2026-11-07');assert.equal(response.status,200);assert.deepEqual((await response.json()).items.map(r=>r.id),['1']);});
