import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app/api/labor-market/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const rows=[
 {user_id:'one',name:'황인원',published:true,seeking:false,available_dates:[]},
 {user_id:'two',name:'정성필',published:true,seeking:true,available_dates:['2026-10-20']},
 {user_id:'three',name:'비공개',published:false,seeking:true,available_dates:['2026-10-20']},
 {user_id:'four',name:'과거일정',published:true,seeking:true,available_dates:['2020-01-01']}
];
function fixture(manager=true){
 const db={rpc:async()=>({data:null}),from(table){let data=table==='labor_profiles'?rows:[];const q={
 select(){return q;},eq(k,v){data=data.filter(r=>r[k]===v);return q;},neq(){return q;},gte(){return q;},order(){return q;},range(){return q;},limit(){return q;},
 ilike(k,v){data=data.filter(r=>r[k]?.includes(v.slice(1,-1)));return q;},contains(k,v){data=data.filter(r=>v.every(x=>r[k]?.includes(x)));return q;},
 maybeSingle:async()=>({data:data[0]||null}),then(resolve,reject){return Promise.resolve({data}).then(resolve,reject);}};return q;}};
 const ctx=vm.createContext({URL,Response,console,db,publicProfileFields:'public fields',dayInKorea:()=> '2026-10-16',dispatchLaborNotifications:async()=>{},directoryBadges:async(_,r)=>r,companyJobBadges:async(_,r)=>r,attachAssignmentState:async()=>{},json:(b,s=200)=>Response.json(b,{status:s}),fail:(m,s=400)=>Object.assign(Error(m),{status:s})});
 vm.runInContext(source+`\nauth=async()=>({db,user:{id:'owner'},companyId:${manager?"'company'":"null"},ownerCompanyId:null});globalThis.get=GET;`,ctx);
 return async query=>{const response=await ctx.get(new Request('https://test/api/labor-market'+query));assert.equal(response.status,200);return (await response.json()).candidates;};
}
test('includes public non-seeking and expired-date profiles, excludes private profiles',async()=>{
 assert.deepEqual((await fixture()('')).map(p=>p.user_id),['one','two','four']);
});
test('name search finds a non-seeking public worker',async()=>{
 assert.deepEqual((await fixture()('?name='+encodeURIComponent('황인원'))).map(p=>p.user_id),['one']);
});
test('explicit work date still limits results to matching availability',async()=>{
 assert.deepEqual((await fixture()('?date=2026-10-20')).map(p=>p.user_id),['two']);
});
test('worker view does not fetch the directory until requested',async()=>{
 assert.deepEqual(await fixture(false)(''),[]);
});

test('worker directory shows only public profiles including non-seeking workers',async()=>{
 assert.deepEqual((await fixture(false)('?directory=1')).map(p=>p.user_id),['one','two','four']);
});
test('worker directory supports name and date filters',async()=>{
 assert.deepEqual((await fixture(false)('?directory=1&name='+encodeURIComponent('황인원'))).map(p=>p.user_id),['one']);
 assert.deepEqual((await fixture(false)('?directory=1&date=2026-10-20')).map(p=>p.user_id),['two']);
});
