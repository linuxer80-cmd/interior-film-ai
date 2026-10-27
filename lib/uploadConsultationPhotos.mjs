import { prepareRequestPhoto } from './heicPhoto.mjs';

// A stable, site-scoped ID makes retries after a partial upload safe.
export async function uploadConsultationPhotos(db, companyId, siteId, files) {
  const photos=new Map();
  for(const original of files) {
    const content=new Uint8Array(await original.arrayBuffer());
    const scope=new TextEncoder().encode(`${companyId}/${siteId}/`);
    const bytes=new Uint8Array(scope.length+content.length);bytes.set(scope);bytes.set(content,scope.length);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const hex=digest.slice(0,32), id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    const read=()=>db.from('site_photos').select('*').eq('id',id).eq('company_id',companyId).eq('site_id',siteId).maybeSingle();
    const existing=await read();
    if(existing.error)throw Error('기존 사진을 확인하지 못했습니다. 다시 저장해주세요.');
    if(existing.data){photos.set(id,existing.data);continue;}
    const file=await prepareRequestPhoto(original);
    const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const path=`sites/${companyId}/${siteId}/request/consultation-${digest}.${extension}`;
    const uploaded=await db.storage.from('work-photos').upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
    if(uploaded.error && !['409', 'Duplicate'].includes(String(uploaded.error.statusCode || uploaded.error.status || uploaded.error.error))) throw Error('사진 업로드에 실패했습니다. 다시 저장하면 이어서 추가합니다.');
    const row={id,company_id:companyId,site_id:siteId,photo_type:'request',storage_path:path,photo_url:null,description:'추가 상담 사진'};
    const inserted=await db.from('site_photos').insert(row).select().single();
    if(inserted.error) {
      // A lost response can follow a successful write. Verify before retrying.
      const confirmed=await read();
      if(confirmed.data){photos.set(id,confirmed.data);continue;}
      throw Error('사진 정보 저장을 마치지 못했습니다. 다시 저장하면 이어서 추가합니다.');
    }
    photos.set(id,inserted.data);
  }
  return [...photos.values()];
}
