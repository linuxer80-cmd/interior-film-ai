import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizeChatPhoto,CHAT_PHOTO_MAX} from '../lib/customerChatPhoto.mjs';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../lib/customerChatServer.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
const {readChatBody,chatMessages}=new Function(source+';return {readChatBody,chatMessages};')();
test('photo is resized, converted to JPEG and private metadata removed',async()=>{
 const input=await sharp({create:{width:2200,height:1100,channels:3,background:'#226644'}}).withMetadata().png().toBuffer();
 const output=await normalizeChatPhoto(new File([input],'photo.png',{type:'image/png'}));
 const meta=await sharp(output).metadata();
 assert.equal(meta.format,'jpeg');assert.equal(meta.width,1600);assert.equal(meta.height,800);assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);
});
test('reject oversized, SVG, forged MIME and corrupt images',async()=>{
 for(const file of [new File([new Uint8Array(CHAT_PHOTO_MAX+1)],'big.jpg',{type:'image/jpeg'}),new File(['<svg/>'],'a.svg',{type:'image/svg+xml'}),new File(['<svg/>'],'a.jpg',{type:'image/jpeg'}),new File(['broken'],'a.png',{type:'image/png'})])await assert.rejects(normalizeChatPhoto(file),e=>e.status===400);
});
test('JSON cannot specify a photo or arbitrary storage path',async()=>{
 const body=await readChatBody(new Request('https://test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'hi',photo:{},image_path:'other/secret.jpg'})}));
 assert.equal(body.photo,undefined);assert.equal(body.image_path,undefined);
});
test('multipart preserves a photo-only message and consent',async()=>{
 const form=new FormData();form.append('photo',new File(['image'],'p.jpg',{type:'image/jpeg'}));form.append('consent','true');form.append('name','고객');
 const body=await readChatBody(new Request('https://test',{method:'POST',body:form}));assert.equal(body.text,'');assert.equal(body.consent,true);assert.equal(body.photo.type,'image/jpeg');
});
test('oversized request rejected before multipart decoding',async()=>{
 await assert.rejects(readChatBody(new Request('https://test',{method:'POST',body:'x'.repeat(2300001)})),e=>e.status===413);
});
test('only images belonging to authorized thread receive signed URLs',async()=>{
 const signed=[];const rows=[{id:'1',image_path:'mine/a.jpg'},{id:'2',image_path:'other/secret.jpg'},{id:'3',image_path:'mine/../secret.jpg'}];
 const db={from(){const q={select(){return q},eq(k,v){assert.equal(k,'thread_id');assert.equal(v,'mine');return q},order(){return q},limit(){return Promise.resolve({data:rows,error:null})}};return q;},storage:{from(bucket){assert.equal(bucket,'customer-chat');return {async createSignedUrl(path,ttl){signed.push(path);assert.equal(ttl,600);return {data:{signedUrl:'https://test/signed'}}}}}}};
 const result=await chatMessages(db,{id:'mine'},new Request('https://test'));
 assert.deepEqual(signed,['mine/a.jpg']);assert.ok(result.messages.every(m=>!('image_path' in m)));assert.equal(result.messages.find(m=>m.id==='1').image_url,'https://test/signed');assert.equal(result.messages.find(m=>m.id==='2').image_url,undefined);
});
