import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadConsultationPhotos} from '../lib/uploadConsultationPhotos.mjs';
function fixture(){
 const rows=new Map(),objects=new Set(),uploads=[];let fail=true;
 const db={storage:{from(){return {async upload(path){uploads.push(path);if(path.includes('never'))throw Error('invalid');if(objects.has(path))return {error:{statusCode:'409'}};objects.add(path);return {};}};}},from(){let id,insert;
  const q={select(){return q},eq(k,v){if(k==='id')id=v;return q},insert(v){insert=v;return q},async maybeSingle(){return {data:rows.get(id)||null}},async single(){if(fail&&rows.size===1){fail=false;return {error:{message:'interrupted'}};}rows.set(insert.id,insert);return {data:insert};}};return q;
 }};return {db,rows,objects,uploads};
}
test('partial photo failures resume without duplicating photos or overwriting storage',async()=>{
 const f=fixture(),one=new File(['photo-one'],'1.jpg',{type:'image/jpeg'}),two=new File(['photo-two'],'2.jpg',{type:'image/jpeg'});
 await assert.rejects(uploadConsultationPhotos(f.db,'co','site',[one,two]),/다시 저장/);assert.equal(f.rows.size,1);
 const result=await uploadConsultationPhotos(f.db,'co','site',[one,two]);assert.equal(result.length,2);assert.equal(f.rows.size,2);assert.equal(f.objects.size,2);
 const requests=f.uploads.length;
 assert.equal((await uploadConsultationPhotos(f.db,'co','site',[one,one,two])).length,2);assert.equal(f.uploads.length,requests);
 const other=await uploadConsultationPhotos(f.db,'co','other-site',[one]);assert.notEqual(other[0].id,result[0].id);
});
