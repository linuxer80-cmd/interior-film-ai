import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { completionSeed, normalizeHeader, completionTotals, editCompletionItem, normalizePendingCompletionItems, restoreCompletionItems, withManualCompletionItems } from '../lib/completionEstimate.mjs';
import { jpegPagesPdf } from '../lib/completionEstimatePdf.mjs';

test('report costs seed editable material quantities, unique crew and person days without mutating sources', () => {
 const breakdown = {material:[{brand:'현대',product:'S115',quantity:12.5,unit:'m',amount:125000}],labor:[{workerId:'a',name:'A',days:2,amount:400000},{workerId:'a',name:'A',hours:2,amount:40000},{workerId:'b',name:'B',days:1,amount:200000}],expense:[{category:'식대',description:'점심',amount:30000}]};
 const before = JSON.stringify(breakdown);
 const doc = completionSeed({site_name:'현장',address:'주소',address_detail:'101호'}, {company_name:'업체'},breakdown);
 assert.equal(doc.header.crew_count,'2'); assert.equal(doc.header.person_days,'3');
 assert.equal(doc.items[0].quantity,12.5); assert.equal(doc.items[1].unit,'공수'); assert.equal(doc.items[2].unit,'시간'); assert.equal(doc.items.at(-1).category,'meal'); assert.equal(JSON.stringify(breakdown),before);
});
test('quantity/price recalculate; direct amounts and clearing unit price retain intended totals',()=>{
 const row={quantity:2,amount:101}; assert.equal(editCompletionItem(row,'quantity',3).amount,101);
 const priced=editCompletionItem(row,'unit_price',30000); assert.equal(priced.amount,60000);
 assert.equal(editCompletionItem(priced,'quantity',2.5).amount,75000);
 assert.equal(editCompletionItem(priced,'unit_price',null).amount,60000);
 assert.equal(editCompletionItem(priced,'amount',50000).unit_price,null);
});
test('tax modes reconcile amounts and invalid headcounts are rejected',()=>{
 assert.deepEqual(completionTotals([{name:'시공비',quantity:1,amount:110000}],'included'),{subtotal:110000,supply:100000,tax:10000,total:110000});
 assert.equal(completionTotals([{name:'시공비',quantity:1,amount:100000}],'separate').total,110000);
 assert.equal(completionTotals([{name:'시공비',quantity:1,amount:100000}]).total,100000);
 assert.throws(()=>normalizeHeader({crew_count:'1.5'})); assert.throws(()=>normalizeHeader({person_days:'NaN'}));
});
test('PDF byte offsets point to every object and xref including binary image bytes',async()=>{
 const pdf=jpegPagesPdf([new Uint8Array([255,216,0,200,255,217]),new Uint8Array([255,216,255,217])]);
 const bytes=new Uint8Array(await pdf.arrayBuffer()); const latin=new TextDecoder('latin1').decode(bytes);
 assert.equal(pdf.type,'application/pdf'); assert.match(latin,/\/Count 2/);
 const start=Number(latin.match(/startxref\n(\d+)/)[1]); assert.equal(new TextDecoder().decode(bytes.slice(start,start+4)),'xref');
 const entries=latin.slice(latin.indexOf('0000000000 65535 f')).split('\n').slice(1,9);
 entries.forEach((line,i)=>{ const offset=Number(line.slice(0,10)); assert.ok(new TextDecoder().decode(bytes.slice(offset,offset+12)).startsWith(`${i+1} 0 obj`)); });
});

function api({role='owner',company='a',siteCompany='a',status='completed',revision=1}={}) {
 let saved={document:{items:[],note:''},revision,updated_at:'2026-10-15'}; const writes=[];
 const tables={profiles:[{company_id:company,role,is_active:true}],companies:[{id:company,is_active:true,company_name:'업체'}],sites:[{id:'10000000-0000-0000-0000-000000000001',company_id:siteCompany,status,site_name:'현장'}],work_reports:[]};
 const client={auth:{getUser:async()=>({data:{user:{id:'u'}}})},from(table){
 let filters=[],patch;
 const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(){return q},limit(){return q},insert(v){patch=v;return q},update(v){patch=v;return q},
 async maybeSingle(){
  if(table==='site_completion_estimates') {if(patch){if(filters.some(([k,v])=>k==='revision'&&v!==saved.revision))return {data:null}; writes.push(table);saved={...saved,...patch};}return {data:saved};}
  return {data:(tables[table]||[]).find(r=>filters.every(([k,v])=>r[k]===v||k==='id'&&table==='profiles'))||null};
 },async single(){return q.maybeSingle()},then(resolve,reject){return Promise.resolve({data:tables[table]||[]}).then(resolve,reject)}};return q;
 }};
 const ctx=vm.createContext({completionSeed,normalizeHeader,normalizePendingCompletionItems,createClient:()=>client,process:{env:{}},console:{error(){}},Response,Request,URL,getProfit:async()=>Response.json({sites:[{id:tables.sites[0].id}],breakdown:{material:[],labor:[],expense:[]}})});
 const src=fs.readFileSync(new URL('../app/api/admin/completion-estimate/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ','');
 vm.runInContext(src+'\nglobalThis.post=POST;globalThis.get=GET;',ctx);
 const siteId=tables.sites[0].id;
 const body={siteId,version:1,note:'비고',header:{site_name:'수정 현장'},vat:'separate',items:[{category:'meal',name:'식비',quantity:2,unit:'명',unit_price:10000,amount:20000}]};
 return {writes,body,post:async(value=body,token='Bearer test')=>{let r=await ctx.post(new Request('https://test/api',{method:'POST',headers:{authorization:token,'content-type':'application/json'},body:JSON.stringify(value)}));return {status:r.status,body:await r.json()}}};
}
test('save stores document only with editable fields and tax; originals remain untouched',async()=>{
 const h=api();const r=await h.post();assert.equal(r.status,200);assert.equal(r.body.saved.header.site_name,'수정 현장');assert.equal(r.body.saved.version,2);assert.equal(r.body.saved.items[0].unit_price,10000);assert.deepEqual(h.writes,['site_completion_estimates']);
});
test('save blocks unauthenticated, non-owner, other-tenant, stale and invalid amount requests',async()=>{
 const h=api();assert.equal((await h.post(h.body,'')).status,401);
 assert.equal((await api({role:'worker'}).post()).status,403);
 assert.equal((await api({siteCompany:'b'}).post()).status,404);
 assert.equal((await api({revision:2}).post()).status,409);
 assert.equal((await h.post({...h.body,items:[{...h.body.items[0],amount:2}]})).status,400);
 assert.equal((await h.post({...h.body,vat:'bad'})).status,400);
});

test('both quote timing modes save for consulting and scheduled sites without a report',async()=>{
 for(const status of ['consulting','scheduled','in_progress','completed']){
  const h=api({status});assert.equal((await h.post()).status,200);
 }
});
test('unfinished billing rows round trip without becoming zero-cost invoice lines',async()=>{
 const h=api();const pending={category:'film',name:'영림 PS156',quantity:'12',unit:'m',unit_price:null,amount:'',_position:0};
 const r=await h.post({...h.body,pending_items:[pending]});assert.equal(r.status,200);
 assert.equal(r.body.saved.items.length,1);assert.equal(r.body.saved.pending_items[0].amount,'');
 const restored=restoreCompletionItems(r.body.saved);assert.equal(restored[0].name,'영림 PS156');assert.equal(restored[1].category,'meal');assert.deepEqual(h.writes,['site_completion_estimates']);
});
test('invalid pending fields and duplicate complete lines are rejected before write',async()=>{
 for(const patch of [{quantity:'-1'},{amount:'wrong'},{_position:-1},{unit:'x'.repeat(21)},{amount:'12000'}]){
  const h=api();const pending={category:'film',name:'필름',quantity:'1',unit:'m',unit_price:null,amount:'',_position:0,...patch};
  assert.equal((await h.post({...h.body,pending_items:[pending]})).status,400);assert.equal(h.writes.length,0);
 }
});
test('unused placeholders stay optional; editing one marks it as a real unfinished row',()=>{
 const rows=withManualCompletionItems([]);assert.ok(rows.every(r=>r._placeholder));
 const edited=editCompletionItem(rows.find(r=>r.category==='film'),'name','PS156');assert.equal(edited._placeholder,false);
 const normalized=normalizePendingCompletionItems([{...edited,_position:0}]);assert.equal(normalized[0].quantity,'');
});

test('manual amounts and new priced rows count while unfinished rows stay excluded from invoice totals',()=>{
 const rows=[{name:'기존 문',quantity:2,unit_price:100000,amount:200000}];
 rows.push(editCompletionItem({name:'추가 팬트리장',quantity:1,amount:0},'unit_price',150000));
 rows.push({name:'미확정 자재',quantity:'',amount:90000});
 assert.deepEqual(completionTotals(rows,'separate'),{subtotal:350000,supply:350000,tax:35000,total:385000});
 rows[1]=editCompletionItem(rows[1],'amount',170000);
 assert.equal(completionTotals(rows).total,370000);
});
