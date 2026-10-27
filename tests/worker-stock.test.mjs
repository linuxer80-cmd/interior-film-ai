import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app/api/worker-stock/route.js',import.meta.url),'utf8').replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g,'').replaceAll('export ','');
function fixture({rpcError=null,enabled=true,missingIds=false}={}){
 const calls=[];
 const tables={companies:[{id:'company',company_name:'업체'}],company_inventory_preferences:[{enabled}],site_materials:[{id:'material',company_id:'company',site_id:'site',material_type:'planned',brand:'Lx',product_code:'Dw550'},{id:'removed',removed_at:'2026-10-27',company_id:'company',site_id:'site',material_type:'planned',brand:'Lx',product_code:'Dw550'},{id:'actual',company_id:'company',site_id:'site',material_type:'actual',brand:'LX',product_code:'DW550'}]};
 const db={from(table){let rows=tables[table],single=false;const q={select(){return q},in(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v||!(k in r));return q},is(k,v){rows=rows.filter(r=>v===null?r[k]==null:r[k]===v);return q},maybeSingle(){single=true;return q},then(resolve){return Promise.resolve({data:single?rows[0]:rows}).then(resolve)}};return q},async rpc(name,args){calls.push({name,args});return {error:rpcError,data:{rolls:[{status:'available',remaining:34,brand:'LX하우시스 베니프',product_code:'DW550',...(missingIds?{}:{matching_material_ids:['material']})},{status:'on_site',remaining:20,matching_material_ids:['material']},{status:'available',remaining:50,matching_material_ids:['different-material']}]}}}};
 const ctx=vm.createContext({privateAuth:async()=>({db,user:{id:'user'}}),json:(b,s=200)=>Response.json(b,{status:s}),mySites:async()=>Response.json({sites:[{site_id:'site',company_id:'company',status:'scheduled',assigned_dates:[{role:'leader',work_date:'2099-01-01'}]}]}),Response,Request,URL,Intl,Date,console:{error(){}}});
 vm.runInContext(source+'\nglobalThis.handler=GET',ctx);
 return {calls,get:(site='site')=>ctx.handler(new Request('https://test/api/worker-stock?siteId='+site))};
}
test('stock summary uses authoritative material matching for LX aliases and mixed-case codes; only planned and available stock counts',async()=>{const f=fixture();const r=await f.get();assert.equal(r.status,200);const b=await r.json();assert.equal(b.materials.length,1);assert.equal(b.materials[0].available_m,34);assert.equal(f.calls[0].name,'film_stock');assert.equal(f.calls[0].args.p_user,'user');assert.equal(f.calls[0].args.p_site,'site');assert.equal('rolls' in b,false)});
test('unassigned sites cannot query stock',async()=>{const f=fixture();assert.equal((await f.get('other')).status,403);assert.equal(f.calls.length,0)});
test('disabled inventory remains unavailable rather than zero stock',async()=>{const f=fixture({enabled:false});assert.equal((await (await f.get()).json()).state,'unavailable');assert.equal(f.calls.length,0)});
test('RPC denial, outage and outdated matching data never become zero stock',async()=>{for(const [options,status] of [[{rpcError:{code:'42501'}},403],[{rpcError:{code:'XX000'}},503],[{missingIds:true},503]]){assert.equal((await fixture(options).get()).status,status)}});
