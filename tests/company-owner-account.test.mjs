import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCompanyOwnerAccount} from '../lib/companyOwnerAccount.mjs';

const account={bank_name:' 테스트은행 ',account_number:' 123-456-789 ',account_holder:' 대표자 '};
function fixture(overrides={}){
 const tables={
  profiles:[{id:'other-owner',company_id:'other',role:'owner',is_active:true},{id:'owner',company_id:'company',role:'owner',is_active:true},{id:'crew',company_id:'company',role:'worker',is_active:true}],
  labor_personal_details:[{user_id:'other-owner',...account,account_number:'999-999'},{user_id:'owner',...account},{user_id:'crew',...account,account_number:'111-111'}],
  workers:[{id:'other-worker',company_id:'other',user_id:'owner',is_active:true},{id:'own-worker',company_id:'company',user_id:'owner',is_active:true},{id:'crew-worker',company_id:'company',user_id:'crew',is_active:true}],
  worker_private_details:[{worker_id:'other-worker',company_id:'other',...account,account_number:'999-999'},{worker_id:'own-worker',company_id:'company',...account,account_number:'222-333'},{worker_id:'crew-worker',company_id:'company',...account,account_number:'111-111'}],
  ...overrides,
 },calls=[];
 const db={from(table){
  const call={table,columns:'',filters:[],limit:Infinity,single:false};calls.push(call);
  const q={select(columns){call.columns=columns;return q;},eq(key,value){call.filters.push([key,value]);return q;},limit(value){call.limit=value;return q;},maybeSingle(){call.single=true;return q;},then(resolve,reject){
   if(tables[table] instanceof Error)return Promise.resolve({data:null,error:tables[table]}).then(resolve,reject);
   let rows=(tables[table]||[]).filter(row=>call.filters.every(([key,value])=>row[key]===value)).slice(0,call.limit);
   rows=rows.map(row=>Object.fromEntries(call.columns.split(',').map(key=>[key,row[key]])));
   return Promise.resolve({data:call.single?rows[0]||null:rows,error:null}).then(resolve,reject);
  }};return q;
 }};
 return {db,tables,calls};
}

test('customer account belongs to this company owner, not the assigned worker or another company',async()=>{
 const {db,calls}=fixture();assert.equal(await loadCompanyOwnerAccount(db,'company'),'테스트은행 123-456-789 (대표자)');
 assert.deepEqual(calls.map(x=>x.table),['profiles','labor_personal_details']);
 assert.deepEqual(calls[1].columns.split(','),['bank_name','account_number','account_holder']);
});
test('owner profile updates are used on the next request without copied company defaults',async()=>{
 const {db,tables}=fixture();await loadCompanyOwnerAccount(db,'company');
 tables.labor_personal_details.find(row=>row.user_id==='owner').account_number='321-654-987';
 assert.equal(await loadCompanyOwnerAccount(db,'company'),'테스트은행 321-654-987 (대표자)');
});
test('legacy fallback requires the same owner, company and active worker',async()=>{
 const {db,calls}=fixture({labor_personal_details:[]});
 assert.equal(await loadCompanyOwnerAccount(db,'company'),'테스트은행 222-333 (대표자)');
 assert.deepEqual(calls.at(-1).filters,[['company_id','company'],['worker_id','own-worker']]);
 const noOwnWorker=fixture({labor_personal_details:[],workers:[{id:'other-worker',company_id:'other',user_id:'owner',is_active:true}]});
 assert.equal(await loadCompanyOwnerAccount(noOwnWorker.db,'company'),'');
});
test('cleared, incomplete and malformed personal accounts never restore a stale legacy account',async()=>{
 for(const fields of [{bank_name:'',account_number:'',account_holder:''},{...account,account_holder:''},{...account,bank_name:''},{...account,account_number:'invalid'},{...account,account_number:'---'}]){
  const {db,calls}=fixture({labor_personal_details:[{user_id:'owner',...fields}]});
  assert.equal(await loadCompanyOwnerAccount(db,'company'),'');assert.equal(calls.some(x=>x.table==='workers'),false);
 }
});
test('missing, inactive or ambiguous owner is never guessed',async()=>{
 for(const profiles of [[],[{id:'owner',company_id:'company',role:'owner',is_active:false}],[{id:'owner',company_id:'company',role:'worker',is_active:true}],[{id:'owner',company_id:'company',role:'owner',is_active:true},{id:'owner2',company_id:'company',role:'owner',is_active:true}]]){
  const {db,calls}=fixture({profiles});assert.equal(await loadCompanyOwnerAccount(db,'company'),'');assert.equal(calls.length,1);
 }
});
test('ambiguous legacy copies remain hidden and database errors are not treated as missing accounts',async()=>{
 const {db}=fixture({labor_personal_details:[],workers:[{id:'one',company_id:'company',user_id:'owner',is_active:true},{id:'two',company_id:'company',user_id:'owner',is_active:true}]});
 assert.equal(await loadCompanyOwnerAccount(db,'company'),'');
 const failure=new Error('lookup unavailable');
 await assert.rejects(loadCompanyOwnerAccount(fixture({labor_personal_details:failure}).db,'company'),failure);
});
