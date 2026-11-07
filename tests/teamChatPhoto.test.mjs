import test from 'node:test';
import assert from 'node:assert/strict';
import {teamPhotoPath,teamPhotoMessages,deleteUserTeamPhotos,uploadTeamPhoto} from '../lib/teamChatPhoto.mjs';
import sharp from 'sharp';
const c='11111111-1111-4111-8111-111111111111',s='22222222-2222-4222-8222-222222222222',u='33333333-3333-4333-8333-333333333333',m='44444444-4444-4444-8444-444444444444';
const path=`sites/${c}/${s}/team-chat/${u}/${m}-${'a'.repeat(24)}.jpg`;
test('team photos reject foreign company/site/sender paths and deleted senders',async()=>{
 let signed=0;const db={storage:{from:()=>({createSignedUrl:async()=>{signed++;return {data:{signedUrl:'signed'}};}})}};
 const rows=await teamPhotoMessages(db,{site:{id:s,company_id:c}},[{id:m,sender_id:u,image_path:path},{sender_id:null,image_path:path},{sender_id:u,image_path:path.replace(s,c)}]);
 assert.equal(signed,1);assert.equal(rows[0].has_image,true);assert.equal(rows[1].has_image,undefined);assert.ok(rows.every(r=>!('image_path' in r)));
 assert.equal(teamPhotoPath(path+'/../x',c,s,u),false);
});
test('team image upload normalizes and assigns a unique owned path',async()=>{
 const bytes=await sharp({create:{width:30,height:20,channels:3,background:'red'}}).png().toBuffer();
 const db={storage:{from:bucket=>({upload:async(p,image,opts)=>{assert.equal(bucket,'work-photos');assert.ok(teamPhotoPath(p,c,s,u));assert.equal(opts.upsert,false);assert.equal((await sharp(image).metadata()).format,'jpeg');return {};}})}};
 await uploadTeamPhoto(db,{site:{id:s,company_id:c},user:{id:u}},m,new File([bytes],'x.png',{type:'image/png'}));
});
test('personal deletion checks lease and removes only validated sender attachments',async()=>{
 let leases=0,removed=[];const db={from:()=>({select(){return this},eq(k,v){assert.equal(v,u);return this},order(){return this},range:async()=>({data:[{company_id:c,site_id:s,sender_id:u,image_path:path}]})}),storage:{from:()=>({remove:async paths=>{removed=paths;return {};}})}};
 await deleteUserTeamPhotos(db,u,async()=>{leases++;});assert.deepEqual(removed,[path]);assert.equal(leases,2);
 await assert.rejects(deleteUserTeamPhotos(db,u,async()=>{throw Error('expired');}),/expired/);
});
