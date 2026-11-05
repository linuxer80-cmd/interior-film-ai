import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {assessDeletionRequest} from '../lib/accountDeletionPreflight.mjs';
const empty={dealer_transfer_required:false,open_orders:false,delivery_review_required:false,saved_addresses_review_required:false};
function fixture(data,error=null){return {rpc:async name=>name==='account_deletion_shared_auth_check'?{data:false}:name==='assess_account_deletion_orders'?{data,error}:{data:[]},from(name){assert.equal(name,'profiles');const q={select(){return q},eq(){return q},async maybeSingle(){return {data:null}}};return q;}};}
for(const [flag,code] of Object.entries({dealer_transfer_required:'dealer_transfer_required',open_orders:'open_orders_review_required',delivery_review_required:'delivery_privacy_review_required',saved_addresses_review_required:'delivery_privacy_review_required'}))test(`preflight reports ${flag} without mutation`,async()=>{assert.deepEqual(await assessDeletionRequest(fixture({...empty,[flag]:true}),'u'),{code,codes:[code],executable:false});});
test('missing or failed order assessment cannot enable deletion',async()=>{
 for(const db of [fixture(null),fixture({...empty,open_orders:0}),fixture(empty,Error('offline'))])await assert.rejects(assessDeletionRequest(db,'u'),/assessment unavailable/);
 assert.equal((await assessDeletionRequest(fixture(empty),'u')).executable,false);
});
test('database assessment isolates subject and detects saved addresses without returning private data',async()=>{
 const db=new PGlite();const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002';try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table material_pilot_dealers(user_id uuid);
 create table material_pilot_orders(buyer_id uuid,status text,shipping jsonb,shipments jsonb);
 create table material_shipping_addresses(created_by uuid);
 insert into material_pilot_dealers values('${o}');
 insert into material_pilot_orders values('${o}','shipped','{"phone":"private"}','[]');
 insert into material_shipping_addresses values('${u}');`);
 await db.exec(await readFile(new URL('../database/account_deletion_order_assessment.sql',import.meta.url),'utf8'));
 const assess=async()=>(await db.query('select assess_account_deletion_orders($1) flags',[u])).rows[0].flags;
 assert.deepEqual(await assess(),{...empty,saved_addresses_review_required:true});
 await db.query("insert into material_pilot_orders values($1,'received','{}','[{\"tracking\":\"private\"}]')",[u]);
 assert.deepEqual(await assess(),{...empty,saved_addresses_review_required:true,delivery_review_required:true});
 assert.equal((await db.query("select has_function_privilege('authenticated','assess_account_deletion_orders(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 await assert.rejects(db.query('select assess_account_deletion_orders(null)'),/User required/);
 }finally{await db.close();}
});

test('all concurrent blockers and an unavailable company scope are reported without duplicate delivery review',async()=>{
 const db=fixture(Object.fromEntries(Object.keys(empty).map(k=>[k,true])));const rpc=db.rpc;
 db.rpc=async name=>name==='account_deletion_shared_auth_check'?{data:true}:rpc(name);
 db.from=()=>{let counted=false;const q={select(cols,options){counted=!!options;return q},eq(){return q},neq(){return q},async maybeSingle(){return {data:{role:'owner',company_id:'company'}}},then(resolve){return Promise.resolve({count:0}).then(resolve)}};return q;};
 const result=await assessDeletionRequest(db,'u');
 assert.deepEqual(result.codes,['shared_account_review_required','company_deletion_required','dealer_transfer_required','open_orders_review_required','delivery_privacy_review_required','company_scope_unavailable']);
 assert.equal(result.code,result.codes[0]);assert.equal(result.executable,false);
});
