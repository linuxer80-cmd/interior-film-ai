import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stockHistoryRange,stockHistoryRows} from '../lib/stockHistory.mjs';
const empty={events:[],issues:[],returns:[],trips:[],rolls:[],materials:[],sites:[],profiles:[],workers:[]};
test('Korean date range includes full local end day and rejects invalid or oversized ranges',()=>{
 assert.deepEqual(stockHistoryRange('2026-10-19','2026-10-19'),{from:'2026-10-18T15:00:00.000Z',until:'2026-10-19T15:00:00.000Z'});
 for(const pair of [['2026-02-30','2026-03-01'],['2026-10-20','2026-10-19'],['2026-09-01','2026-10-19'],['bad','2026-10-19']])assert.throws(()=>stockHistoryRange(...pair));
});
test('events show the recorded actor, quantities, roll and site without exposing prices',()=>{
 const rows=stockHistoryRows({...empty,events:[{id:'event',action:'issue',actor:'user',roll_id:'roll',site_id:'site',after_qty:20,before_qty:20,created_at:'2026-10-19T02:00:00Z'}],rolls:[{id:'roll',label:'R01',brand:'현대',product_code:'W192',unit_price:9000}],sites:[{id:'site',site_name:'현장'}],workers:[{user_id:'user',name:'홍길동'}]});
 assert.equal(rows[0].actor,'홍길동 (시공자)');assert.equal(rows[0].quantity,20);assert.equal(rows[0].roll,'R01');assert.equal(rows[0].site,'현장');assert.equal('unit_price' in rows[0],false);
});
test('legacy issue and last return are included but roll-synchronized rows are not duplicated',()=>{
 const rows=stockHistoryRows({...empty,issues:[{id:'i',material_id:'m',created_at:'2026-10-18T00:00:00Z',quantity:20},{id:'roll-copy',material_id:'linked',created_at:'2026-10-18T00:00:00Z',quantity:10}],returns:[{material_id:'m',updated_at:'2026-10-19T00:00:00Z',quantity:.6,updated_by:'owner'}],trips:[{material_id:'linked'}],profiles:[{id:'owner',role:'owner',name:'정근호'}],materials:[{id:'m',brand:'현대',product_name:'로즈골드',unit:'m'}]});
 assert.equal(rows.length,2);assert.equal(rows[0].source,'manual-return');assert.equal(rows[0].quantity,.6);assert.equal(rows[0].actor,'정근호 (관리자)');assert.equal(rows[1].name,'로즈골드');
});
test('zero returns, voided issues and absent identities remain explicit',()=>{
 const rows=stockHistoryRows({...empty,issues:[{id:'i',quantity:5,voided_at:'2026-10-19',created_at:'2026-10-19T00:00:00Z'}],returns:[{material_id:'m',quantity:0,updated_at:'2026-10-19T01:00:00Z'}]});
 assert.equal(rows[0].quantity,0);assert.equal(rows[0].actor,'담당자 정보 없음');assert.equal(rows[1].voided,true);
});
const source=fs.readFileSync(new URL('../app/api/admin/stock-history/route.js',import.meta.url),'utf8');
function api(role='owner',active=true){
 const reads=[];
 const tables={profiles:[{id:'user',company_id:'co',role,is_active:active,name:'관리자'}],companies:[{id:'co',is_active:true}],film_stock_events:[{id:'e',company_id:'co',actor:'user',action:'receive',roll_id:'r',after_qty:50,created_at:'2026-10-19T01:00:00Z'},{id:'foreign',company_id:'other',actor:'other',action:'receive',after_qty:99,created_at:'2026-10-19T01:00:00Z'}],film_stock_rolls:[{id:'r',company_id:'co',label:'R1'}]};
 const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){const filters=[];reads.push({table,filters});return {select(){return this;},eq(k,v){filters.push(r=>r[k]===v);return this;},in(k,v){filters.push(r=>v.includes(r[k]));return this;},gte(k,v){filters.push(r=>r[k]>=v);return this;},lt(k,v){filters.push(r=>r[k]<v);return this;},order(){return this;},range(){return this;},limit(){return this;},then(resolve){resolve({data:(tables[table]||[]).filter(r=>filters.every(f=>f(r)))});}};}};
 const GET=new Function('createClient','stockHistoryRange','stockHistoryRows',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return GET;')(()=>db,stockHistoryRange,stockHistoryRows);
 return {GET,reads};
}
const request=token=>new Request('https://example.test/api/admin/stock-history?start=2026-10-19&end=2026-10-19',{headers:token?{authorization:'Bearer test'}:{}});
test('API refuses missing auth, workers and disabled owners before reading stock',async()=>{
 for(const [role,active,token,status] of [['owner',true,false,401],['worker',true,true,403],['owner',false,true,403]]){const {GET,reads}=api(role,active);assert.equal((await GET(request(token))).status,status);assert.equal(reads.some(r=>r.table==='film_stock_events'),false);}
});
test('API reads only owner company and returns named history without foreign rows',async()=>{
 const {GET}=api();const response=await GET(request(true));assert.equal(response.status,200);const body=await response.json();assert.equal(body.rows.length,1);assert.equal(body.rows[0].actor,'관리자 (관리자)');assert.equal(body.rows[0].roll,'R1');
});
