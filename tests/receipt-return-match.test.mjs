import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestReceiptReturn,matchesReceiptReturn,allocateReceiptReturn} from '../lib/receiptReturnMatch.mjs';
const row={action:'supplier_return',brand:'현대L&C',code:'GS156',priceType:'non_fire',totalM:17.3,rollIds:[]};
const roll={id:'r',brand:'현대보닥',product_code:'S156',status:'available',remaining:17.3};
const purchase={roll_id:'r',dealer_id:'dealer',price_type:'non_fire'};
test('GS156 receipt links the exact S156 non-fire stock roll while preserving original code',()=>{
 assert.equal(matchesReceiptReturn(row,roll,purchase,'dealer'),true);
 const linked=suggestReceiptReturn(row,[roll],[purchase],'dealer');assert.deepEqual(linked.rollIds,['r']);assert.equal(linked.code,'GS156');assert.equal(linked.rollCount,'1');
});
test('never confuses same digits across brand, fire type, supplier, status or length',()=>{
 for(const [r,p] of [[{...roll,brand:'영림',product_code:'PS156'},purchase],[roll,{...purchase,price_type:'fire'}],[roll,{...purchase,dealer_id:'other'}],[{...roll,status:'on_site'},purchase],[{...roll,remaining:17},purchase],[roll,null]]){
  assert.equal(suggestReceiptReturn(row,[r],p?[p]:[],'dealer'),row);
 }
});
test('ambiguous rolls, manual deselection and unconfirmed quantity never auto-select',()=>{
 const r2={...roll,id:'other'};
 assert.equal(suggestReceiptReturn(row,[roll,r2],[purchase,{...purchase,roll_id:'other'}],'dealer'),row);
 const manual={...row,returnSelectionTouched:true};assert.equal(suggestReceiptReturn(manual,[roll],[purchase],'dealer'),manual);
 const missing={...row,totalM:''};assert.equal(suggestReceiptReturn(missing,[roll],[purchase],'dealer'),missing);
});

test('15m supplier return from 17.3m leaves 2.3m and never returns the whole roll',()=>{
 const partial={...row,totalM:15};const selected=suggestReceiptReturn(partial,[roll],[purchase],'dealer');
 assert.deepEqual(selected.rollIds,['r']);const [job]=allocateReceiptReturn(partial,[roll]);assert.equal(job.returnLength,15);assert.equal(Number((roll.remaining-job.returnLength).toFixed(3)),2.3);
 assert.throws(()=>allocateReceiptReturn({...row,totalM:18},[roll]),/이하/);
 assert.throws(()=>allocateReceiptReturn(partial,[roll,{...roll,id:'b'}]),/한 롤/);
});
