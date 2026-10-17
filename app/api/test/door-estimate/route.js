import { randomUUID } from 'node:crypto';
import { imageHash, signDraft, readDraft } from '../../../../lib/test/doorDraft.mjs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { describeDoor } from '../../../../lib/test/doorVision';
import { VERSION, eligible, matchDoors } from '../../../../lib/test/doorMatch.mjs';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function dbClient(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
function check(result){if(result.error) throw fail('테스트 DB를 읽거나 저장하지 못했습니다. 연결 및 test/door-estimate/setup.sql 적용 여부를 확인해주세요.',503);return result.data;}
async function companyFor(db,slug){
 if(!/^[a-z0-9-]{1,100}$/.test(slug)) throw fail('업체 주소를 확인해주세요.');
 const row=check(await db.from('companies').select('id,slug,company_name').eq('slug',slug).eq('is_active',true).maybeSingle());
 if(!row) throw fail('업체를 찾을 수 없습니다.',404); return row;
}
async function owner(db,request,company){
 const token=(request.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token) throw fail('기존 관리자 계정으로 로그인해주세요.',401);
 const {data,error}=await db.auth.getUser(token); if(error||!data?.user) throw fail('다시 로그인해주세요.',401);
 const p=check(await db.from('profiles').select('company_id,role,is_active').eq('id',data.user.id).maybeSingle());
 if(p?.is_active!==false && p?.role==='owner' && (!company || p.company_id===company.id)) return {id:data.user.id,companyId:p.company_id};
 const s=check(await db.from('super_admins').select('user_id').eq('user_id',data.user.id).eq('is_active',true).maybeSingle());
 if(!s) throw fail('해당 업체의 관리자 권한이 필요합니다.',403);
 return {id:data.user.id,companyId:company?.id||p?.company_id};
}
async function preview(db,rows){return Promise.all(rows.map(async r=>{
 const {data}=await db.storage.from('work-photos').createSignedUrl(r.storage_path,600);
 return {...r,url:data?.signedUrl||null};
}));}
async function prepare(input){
 const image=sharp(input,{limitInputPixels:25000000});
 return image.rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();
}
async function imageInput(form){
 const file=form.get('image');
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>3000000)throw fail('JPG·PNG·WebP 사진 한 장을 3MB 이하로 등록해주세요.');
 return Buffer.from(await file.arrayBuffer());
}
export async function GET(request){try{
 const db=dbClient(),slug=new URL(request.url).searchParams.get('company_slug');
 let company=slug?await companyFor(db,slug):null;
 const actor=await owner(db,request,company);
 if(!company){company=check(await db.from('companies').select('id,slug,company_name').eq('id',actor.companyId).eq('is_active',true).maybeSingle());if(!company)throw fail('업체 주소를 입력해주세요.');}
 const rows=check(await db.from('door_test_uploads').select('*').eq('company_id',company.id).order('slot'));
 return reply({company,saved:await preview(db,rows)});
 }catch(e){return reply({error:e.status?e.message:'테스트 데이터를 불러오지 못했습니다.'},e.status||500);}}
export async function POST(request){try{
 const db=dbClient(),form=await request.formData(),company=await companyFor(db,String(form.get('company_slug')||''));
 const action=form.get('action'),saving=new URL(request.url).pathname.endsWith('/save');
 if(saving && action!=='save')throw fail('저장 전용 요청입니다.');
 if(!saving && action==='save')throw fail('저장 주소를 확인해주세요.');
 if(action==='sample'||action==='save'){
  const actor=await owner(db,request,company);
  const rows=check(await db.from('door_test_uploads').select('slot,photo_id,image_hash').eq('company_id',company.id).order('slot'));
  const raw=await imageInput(form), hash=imageHash(raw);
  const duplicate=rows.find(r=>r.image_hash===hash);
  if(duplicate){if(action==='save')return reply({saved:true,cached:true});throw fail('이미 저장된 사진입니다. 다른 샘플을 선택해주세요.');}
  if(rows.length>=10)throw fail('최대 10장까지 등록할 수 있습니다.');
  if(action==='sample'){
   const analysis=await describeDoor(await prepare(raw),'image/jpeg');
   if(!eligible(analysis))throw fail('문 전체 구조를 확인할 수 없습니다. 문과 문틀 전체가 보이는 사진을 선택해주세요.');
   return reply({analysis,draft:signDraft({analysis,hash,company:company.id,user:actor.id},process.env.SUPABASE_SERVICE_ROLE_KEY)});
  }
  const draft=readDraft(String(form.get('draft')||''),process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(draft.company!==company.id||draft.user!==actor.id||draft.hash!==hash)throw fail('분석한 사진과 저장할 사진이 다릅니다. 다시 분석해주세요.');
  const price=Number(form.get('price')),scope=String(form.get('scope'));
  if(!Number.isInteger(price)||price<1||price>10000000||!['leaf_one','leaf_both','leaf_frame'].includes(scope)||form.get('confirmed')!=='true')throw fail('1개 단가와 시공 범위를 확인해주세요.');
  const slots=new Set(rows.map(r=>r.slot));let slot=1;while(slots.has(slot))slot++;
  const id=randomUUID(),path=`door-test/${company.id}/${id}.jpg`;
  const uploaded=await db.storage.from('work-photos').upload(path,await prepare(raw),{contentType:'image/jpeg',upsert:false});
  if(uploaded.error)throw fail('샘플 사진 저장에 실패했습니다.',503);
  const saved=await db.from('door_test_uploads').insert({company_id:company.id,slot,photo_id:id,image_hash:hash,storage_path:path,version:VERSION,analysis:draft.analysis,scope,unit_price:price,confirmed_by:actor.id}).select('*').single();
  if(saved.error){await db.storage.from('work-photos').remove([path]);throw fail('DB 저장에 실패했습니다. 새로고침 후 다시 시도해주세요.',409);}
  return reply({saved:true,sample:saved.data});
 }
 if(action!=='match')throw fail('요청을 확인해주세요.');
 const rows=check(await db.from('door_test_uploads').select('*').eq('company_id',company.id).order('slot'));
 if(!rows.length)throw fail('문 샘플을 먼저 분석하고 단가를 저장해주세요.',409);
 const scope=String(form.get('scope')),quantity=Number(form.get('quantity'));
 if(!['leaf_one','leaf_both','leaf_frame'].includes(scope)||!Number.isInteger(quantity)||quantity<1||quantity>20)throw fail('시공 범위와 수량을 확인해주세요.');
 const raw=await imageInput(form),hash=imageHash(raw);
 const known=rows.find(r=>r.image_hash===hash && r.version===VERSION);
 const analysis=known?.analysis||await describeDoor(await prepare(raw),'image/jpeg');
 const result=matchDoors({...analysis,image_hash:hash},rows,scope,quantity);
 const matches=await preview(db,result.matches.map(r=>({storage_path:r.storage_path,photo_id:r.photo_id,score:r.score,analysis:r.analysis,unit_price:r.unit_price,scope:r.scope})));
 return reply({...result,analysis,matches:matches.map(({storage_path,...r})=>r),sampleCount:rows.length,version:VERSION});
 }catch(e){console.warn('door test:',e.status||'analysis');return reply({error:e.status?e.message:'사진 분석 또는 저장에 실패했습니다. 잠시 후 다시 시도해주세요.'},e.status||502);}}
