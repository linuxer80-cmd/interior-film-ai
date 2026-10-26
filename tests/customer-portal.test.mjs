import test from 'node:test';
import assert from 'node:assert/strict';
import {signPortal,verifyPortal,resolvePortal} from '../lib/customerPortal.mjs';
const id='a24ef22e-e389-425c-ab20-4e4e8e565dff',key='test-secret-not-a-live-key';
test('signed link rejects changed payload, signature, key and malformed input',()=>{
 const token=signPortal(id,key);assert.equal(verifyPortal(token,key),id);
 for(const value of [token+'x',token.replace(id,'b'+id.slice(1)),token+'.extra',null,'bad', 'x'.repeat(151)])assert.equal(verifyPortal(value,key),null);
 assert.equal(verifyPortal(token,'other'),null);
});
function dbFor(portal,site,company){return {from(table){let b={select(){return b},eq(){return b},async maybeSingle(){return {data:table==='customer_site_portals'?portal:table==='sites'?site:company,error:null}}};return b;}};}
test('expired, cancelled and inactive-company links cannot resolve',async()=>{
 process.env.SUPABASE_SERVICE_ROLE_KEY=key;const token=signPortal(id,key);
 const p={site_id:id,company_id:id,token_id:id,expires_at:new Date(Date.now()+86400000).toISOString(),used:0};
 assert.equal(await resolvePortal(token,dbFor({...p,expires_at:'2020-01-01'},null,null)),null);
 assert.equal(await resolvePortal(token,dbFor(p,{status:'cancelled'},{})),null);
 assert.equal(await resolvePortal(token,dbFor(p,{status:'scheduled'},null)),null);
 assert.equal((await resolvePortal(token,dbFor(p,{status:'scheduled'},{slug:'demo'}))).company.slug,'demo');
});
