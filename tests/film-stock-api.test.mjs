import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../app/api/film-stock/route.js',import.meta.url),'utf8')
  .replace(/^import .*;$/gm,'').replaceAll('export ','');
const site = '00000000-0000-4000-8000-000000000001';
const material = '00000000-0000-4000-8000-000000000002';
function fixture({owner = true, legacy = false} = {}) {
  const calls = []; let extraReads = 0;
  const db = { auth: { getUser: async () => ({data:{user:{id:'user'}}}) }, rpc: async (name,args) => {
    calls.push({name,args});
    return {data:{owner,stockSnapshotVersion:legacy?undefined:1,canIssue:true,canReturnRoll:true,locked:false,
      materials:[{id:material,price_type:'non_fire',unitPrice:5000}],
      rolls:[{id:'r',price_type:'non_fire',supplier:'private',matching_material_ids:[material]}],trips:[]}};
  }};
  const ctx = vm.createContext({Response,URL,process:{env:{}},console,createClient:()=>db,
    normalizeFilmBrand:x=>x,withFilmFireTypes:async(_db,_site,value)=>{extraReads++;return value;}});
  vm.runInContext(source+'\nglobalThis.handler=GET',ctx);
  return {calls,get: (query='',headers={authorization:'Bearer test'})=>ctx.handler(new Request(`https://app/api/film-stock?${query}`,{headers})),get extraReads(){return extraReads;}};
}
test('material selection reaches the authorized RPC and new snapshots need no extra DB requests',async()=>{
  const f=fixture();const r=await f.get(`siteId=${site}&materialId=${material}`);
  assert.equal(r.status,200);assert.equal(f.calls[0].args.p_body.materialId,material);
  assert.equal(f.calls[0].args.p_user,'user');assert.equal(f.extraReads,0);
  assert.equal((await r.json()).materials[0].price_type,'non_fire');
});
test('worker snapshots still hide purchase costs and supplier information',async()=>{
  const f=fixture({owner:false});const b=await (await f.get(`siteId=${site}&materialId=${material}`)).json();
  assert.equal('unitPrice' in b.materials[0],false);assert.equal('supplier' in b.rolls[0],false);
  assert.equal(b.materials[0].price_type,'non_fire');assert.deepEqual(b.rolls[0].matching_material_ids,[material]);
});
test('malformed scope and unauthenticated requests never reach the RPC',async()=>{
  const f=fixture();assert.equal((await f.get(`materialId=${material}`)).status,400);
  assert.equal((await f.get(`siteId=${site}&materialId=invalid`)).status,400);
  assert.equal((await f.get(`siteId=${site}`,{})).status,401);assert.equal(f.calls.length,0);
});
test('older databases remain compatible during deployment',async()=>{
  const f=fixture({legacy:true});assert.equal((await f.get(`siteId=${site}`)).status,200);assert.equal(f.extraReads,1);
});
