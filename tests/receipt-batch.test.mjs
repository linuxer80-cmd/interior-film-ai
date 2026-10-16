import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const source=readFileSync(new URL('../app/components/DealerReceiptImport.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('  function buildRowJobs(row)'),source.indexOf('\n  const purchaseMap = new Map',source.indexOf('  function buildRowJobs(row)')));
const row=(id,patch={})=>({id,action:'receive',code:'S115',product:{id:'p',brand:'현대'},lengthM:50,rollCount:1,totalM:50,...patch});
function fixture(rows){let error='',persisted=null,runs=0;const context={rows,gate:{current:false},batchRef:{current:null},dealerId:'dealer',receiptInfo:'receipt',setError:v=>error=v,setMessage(){},setActiveRowId(){},receiptMatchesProduct:()=>true,resolveFilmType:()=>({resolvedType:'non_fire'}),filmCodeInfo:()=>({priceType:'unknown'}),productCode:()=> 'S115',positive:v=>String(v).trim()!==''&&Number(v)>0,close:(a,b)=>Math.abs(a-b)<=0.001,data:{prices:[{dealer_id:'dealer',product_id:'p',price_type:'non_fire',revision:3}]},typeNames:{non_fire:'비방염'},crypto:{randomUUID},persist:v=>persisted=v,runBatch:()=>runs++};vm.createContext(context);vm.runInContext(functions+';globalThis.save=saveAllRows;',context);return {context,save:()=>context.save(),result:()=>({error,persisted,runs})};}
test('one confirmation creates all roll jobs with unique durable request IDs',()=>{const f=fixture([row('a'),row('b',{rollCount:2,totalM:100})]);f.save();const r=f.result();assert.equal(r.error,'');assert.equal(r.runs,1);assert.equal(r.persisted.jobs.length,3);assert.equal(new Set(r.persisted.jobs.map(j=>j.requestId)).size,3);assert.deepEqual(Array.from(r.persisted.rowIds),['a','b']);});
test('invalid later row prevents every inventory write and names the failing product',()=>{const f=fixture([row('a'),row('b',{code:'ZX103',lengthM:''})]);f.save();assert.equal(f.result().runs,0);assert.equal(f.result().persisted,null);assert.match(f.result().error,/ZX103/);});
test('saved rows are excluded and pending batch blocks another save',()=>{const f=fixture([row('a',{done:true}),row('b')]);f.save();assert.equal(f.result().persisted.jobs.length,1);f.context.batchRef.current=f.result().persisted;f.save();assert.equal(f.result().runs,1);});
test('missing dealer price is reported before saving any row',()=>{const f=fixture([row('a')]);f.context.data.prices=[];f.save();assert.match(f.result().error,/공급가/);assert.equal(f.result().runs,0);});
