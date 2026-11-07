import { randomBytes } from 'node:crypto';
import { normalizeChatPhoto } from './customerChatPhoto.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);
export function teamPhotoPath(path,company,site,user) {
 return [company,site,user].every(uuid)&&typeof path==='string'&&new RegExp('^sites/'+company+'/'+site+'/team-chat/'+user+'/[0-9a-f-]{36}-[0-9a-f]{24}\\.jpg$','i').test(path);
}
export async function uploadTeamPhoto(db,a,id,file) {
 const image=await normalizeChatPhoto(file);
 const path=`sites/${a.site.company_id}/${a.site.id}/team-chat/${a.user.id}/${id}-${randomBytes(12).toString('hex')}.jpg`;
 const result=await db.storage.from('work-photos').upload(path,image,{contentType:'image/jpeg',upsert:false});
 if(result.error)throw Object.assign(Error('사진을 저장하지 못했습니다.'),{status:503});
 return path;
}
export async function teamPhotoMessages(db,a,rows) {
 return Promise.all(rows.map(async row=>{
  const {image_path,...message}=row;
  if(teamPhotoPath(image_path,a.site.company_id,a.site.id,row.sender_id)) {
   const result=await db.storage.from('work-photos').createSignedUrl(image_path,300);
   message.has_image=true;message.image_url=result.data?.signedUrl||null;
  }
  return message;
 }));
}
export async function deleteUserTeamPhotos(db,user,assertLease) {
 for(let offset=0;;offset+=100) {
  await assertLease();
  const r=await db.from('worker_team_messages').select('id,company_id,site_id,sender_id,image_path').eq('sender_id',user).order('id').range(offset,offset+99);
  if(r.error)throw r.error;
  const paths=(r.data||[]).filter(m=>m.image_path).map(m=>{
   if(!teamPhotoPath(m.image_path,m.company_id,m.site_id,user))throw Error('Invalid team photo ownership');
   return m.image_path;
  });
  if(paths.length){await assertLease();const removed=await db.storage.from('work-photos').remove(paths);if(removed.error)throw removed.error;}
  if((r.data||[]).length<100)break;
  if(offset>=99900)throw Error('Team photo inventory limit');
 }
}
