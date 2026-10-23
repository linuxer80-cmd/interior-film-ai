import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {uuid,validateTargets,STAGES} from '../../../../lib/photoHierarchy.mjs';
import {analyzePhotoHierarchy} from '../../../../lib/server/analyzePhotoHierarchy';
export const maxDuration=60;
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request){
 try{
  const token=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return reply({error:'로그인이 필요합니다.'},401);
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const {data:auth,error:ae}=await db.auth.getUser(token);if(ae||!auth?.user)return reply({error:'다시 로그인해주세요. 입력 내용은 유지됩니다.'},401);
  const {data:profile,error:pe}=await db.from('profiles').select('company_id,role,is_active').eq('id',auth.user.id).maybeSingle();
  if(pe)throw pe;if(profile?.role!=='owner'||profile.is_active===false)return reply({error:'업체 관리자만 등록할 수 있습니다.'},403);
  const {data:company}=await db.from('companies').select('id').eq('id',profile.company_id).eq('is_active',true).maybeSingle();if(!company)return reply({error:'활성 업체를 확인해주세요.'},403);
  const form=await request.formData(),action=form.get('action'),stage=form.get('stage'),file=form.get('file');
  if(!['analyze','save'].includes(action)||!Object.hasOwn(STAGES,stage)||!file||typeof file.arrayBuffer!=='function'||file.size>3*1024*1024||file.type!=='image/jpeg')return reply({error:'3MB 이하 JPG 사진과 사진 상태를 확인해주세요.'},400);
  const bytes=Buffer.from(await file.arrayBuffer());if(bytes.length<3||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return reply({error:'JPG 사진을 확인해주세요.'},400);
  if(action==='analyze')return reply({targets:await analyzePhotoHierarchy('data:image/jpeg;base64,'+bytes.toString('base64'),stage)});
  const photoId=form.get('photoId'),itemId=form.get('itemId');if(!uuid(photoId)||!uuid(itemId))return reply({error:'등록 식별자를 확인해주세요.'},400);
  let targets;try{targets=validateTargets(JSON.parse(form.get('targets')),{reviewed:true});}catch(e){return reply({error:e.message},400);}
  const path=`hierarchy/${company.id}/${photoId}.jpg`,hash=createHash('sha256').update(bytes).digest('hex');
  const {error:uploadError}=await db.storage.from('work-photos').upload(path,bytes,{contentType:'image/jpeg',upsert:false});
  if(uploadError&&String(uploadError.statusCode)!=='409'&&uploadError.error!=='Duplicate')throw uploadError;
  const {data,error}=await db.rpc('register_admin_photo_hierarchy',{p_user:auth.user.id,p_photo:photoId,p_item:itemId,p_path:path,p_hash:hash,p_stage:stage,p_targets:targets,p_memo:String(form.get('memo')||'').slice(0,2000)});
  if(error){if(error.code==='40001')return reply({error:error.message},409);throw error;}
  return reply({saved:data});
 }catch(e){console.error('admin-photo-data',e.code||e.status||'server');return reply({error:e.status?e.message:'등록하지 못했습니다. 입력 내용은 유지됩니다. 다시 저장해주세요.'},e.status||500);}
}
