import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHeicPhoto, prepareRequestPhoto, convertHeicBlob } from '../lib/heicPhoto.mjs';

test('HEIC/HEIF extension and MIME detection', () => {
 for (const name of ['a.HEIC','b.heif','https://x/a.heic?token=x']) assert.equal(isHeicPhoto(name),true);
 assert.equal(isHeicPhoto('image','image/heif'),true);
 assert.equal(isHeicPhoto('a.jpg','image/jpeg'),false);
});
test('JPEG uploads are preserved; HEIC uploads become a correctly named JPEG', async () => {
 const jpg=new File(['jpg'],'a.jpg',{type:'image/jpeg'});
 assert.equal(await prepareRequestPhoto(jpg),jpg);
 const file=new File(['heic'],'a.HEIC',{type:'image/heic',lastModified:123});
 const result=await prepareRequestPhoto(file,async()=>new Blob(['jpeg'],{type:'image/jpeg'}));
 assert.equal(result.name,'a.jpg');assert.equal(result.type,'image/jpeg');assert.equal(result.lastModified,123);
});
test('failed conversion never uploads original and does not block later conversions',async()=>{
 await assert.rejects(prepareRequestPhoto(new File(['x'],'a.heic'),async()=>{throw Error('invalid');}));
 await assert.rejects(convertHeicBlob(new Blob(['x']),async()=>new Blob([],{type:'image/jpeg'})));
 const result=await convertHeicBlob(new Blob(['x']),async()=>new Blob(['ok'],{type:'image/jpeg'}));
 assert.equal(result.size,2);
});
