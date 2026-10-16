import test from 'node:test';
import assert from 'node:assert/strict';
import {sellingMaterialPrices,mergeCatalogSellingPrices} from '../lib/dealerPriceImport.mjs';
const products=[{id:'p',brand:'영림 인테리어필름',product_code:'PX449'}];
const catalog=[{product_id:'p',price_type:'non_fire',interior_price:10000,vat_included:false},{product_id:'p',price_type:'fire',interior_price:14000,vat_included:false}];
test('Younglim PX449 uses 10000 contractor price; explicit fire uses 14000',()=>{
 for(const [type,expected] of [[undefined,10000],['fire',14000]]){
  const rows=sellingMaterialPrices([{id:'m',brand:'영림',code:'px449',unit:'m'}],[{id:'m',film_product_id:'p',price_type:type}],products,mergeCatalogSellingPrices([],catalog));
  assert.equal(rows[0].unitPrice,expected);
 }
});
test('company overrides stay authoritative, unknown VAT cannot be used',()=>{
 const merged=mergeCatalogSellingPrices([{product_id:'p',price_type:'non_fire',interior_price:12000}],catalog);
 assert.equal(merged.find(x=>x.price_type==='non_fire').interior_price,12000);
 assert.equal(mergeCatalogSellingPrices([],catalog.map(x=>({...x,vat_included:true}))).length,0);
});
