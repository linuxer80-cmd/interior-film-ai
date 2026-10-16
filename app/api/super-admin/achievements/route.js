import {randomUUID} from 'node:crypto';
import {achievementAuth,achievementResult,privateJson,badgeImageUrl} from '../../../../lib/achievementServer';
import {cleanBadge} from '../../../../lib/achievements.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){try{const a=await achievementAuth(request,true);return a.error?privateJson({error:a.error},a.status):await achievementResult(a,'catalog',{});}catch{return privateJson({error:'배지 목록을 불러오지 못했습니다.'},503);}}
export async function POST(request){
 try{
  const a=await achievementAuth(request,true);if(a.error)return privateJson({error:a.error},a.status);
  if(request.headers.get('content-type')?.includes('multipart/form-data')){
   const form=await request.formData(),file=form.get('file');
   if(!file||typeof file.arrayBuffer!=='function'||file.size>2097152||file.size<12)return privateJson({error:'2MB 이하 PNG·JPG·WebP 이미지를 선택해주세요.'},400);
   const bytes=Buffer.from(await file.arrayBuffer());
   const ext=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;
   if(!ext)return privateJson({error:'PNG·JPG·WebP 파일만 등록할 수 있습니다.'},400);
   const path=`custom/${randomUUID()}.${ext}`;
   const result=await a.db.storage.from('achievement-badges').upload(path,bytes,{contentType:ext==='jpg'?'image/jpeg':`image/${ext}`,upsert:false,cacheControl:'31536000'});
   if(result.error)return privateJson({error:'이미지 업로드에 실패했습니다. 업적 설치 SQL 적용 여부를 확인해주세요.'},503);
   return privateJson({image_path:path,image_url:badgeImageUrl(a.db,path)});
  }
  const raw=await request.text();if(raw.length>10000)return privateJson({error:'요청이 너무 큽니다.'},413);
  let b;try{b=cleanBadge(JSON.parse(raw));}catch(e){return privateJson({error:e.message||'입력을 확인해주세요.'},400);}
  return await achievementResult(a,'save',b);
 }catch{return privateJson({error:'배지 설정을 저장하지 못했습니다.'},503);}
}
