import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {TARGETS,SPACES,DAMAGES,STAGES,uuid,validateTargets,aiTargets} from '../../../../lib/photoHierarchy.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
const fail=(message,status=400)=>Object.assign(Error(message),{status});
async function context(request) {
 const token=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)throw fail('로그인이 필요합니다.',401);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error}=await db.auth.getUser(token);
 if(error||!auth?.user)throw fail('로그인이 만료됐습니다.',401);
 const {data:admin,error:ae}=await db.from('super_admins').select('user_id').eq('user_id',auth.user.id).eq('is_active',true).maybeSingle();
 if(ae)throw ae;if(!admin)throw fail('슈퍼관리자만 이용할 수 있습니다.',403);
 return {db,user:auth.user};
}
function check(error){if(!error)return;if(['42P01','PGRST205','42883','PGRST202'].includes(error.code))throw Object.assign(fail('사진 데이터 관리 설정 SQL을 먼저 실행해주세요.',503),{setup:true});if(error.code==='40001')throw fail(error.message,409);if(error.code==='42501')throw fail('슈퍼관리자 권한을 확인해주세요.',403);throw error;}
function pathFor(photo) {
 let path=photo.storage_path||photo.photo_url||'';
 if(/^https?:/i.test(path)){
  try{const u=new URL(path);if(u.origin!==new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin)return null;
   const match=u.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/work-photos\/(.+)$/);if(!match)return null;path=decodeURIComponent(match[1]);
  }catch{return null;}
 }
 path=path.replace(/^\/+/,'').replace(/^work-photos\//,'');
 return path&&!/[\\?#]/.test(path)&&!path.split('/').some(x=>!x||x==='.'||x==='..')?path:null;
}
async function withUrls(db,rows){
 const paths=[...new Set(rows.map(pathFor).filter(Boolean))];let urls=new Map();
 if(paths.length){const {data,error}=await db.storage.from('work-photos').createSignedUrls(paths,600);check(error);urls=new Map((data||[]).filter(x=>x.signedUrl&&!x.error).map(x=>[x.path,x.signedUrl]));}
 return rows.map(({storage_path,photo_url,...row})=>({...row,url:urls.get(pathFor({storage_path,photo_url}))||null}));
}
export async function GET(request){
 try{
  const {db}=await context(request),p=new URL(request.url).searchParams;
  const photoId=p.get('photoId');
  if(photoId){
   if(!uuid(photoId))throw fail('사진 식별자를 확인해주세요.');
   const {data:photo,error}=await db.from('photo_case_management').select('id,revision,targets,photo_stage,review_status').eq('id',photoId).maybeSingle();check(error);
   if(!photo)throw fail('사진을 찾을 수 없습니다.',404);
   return reply({photo});
  }
  const company=p.get('company')||'',status=p.get('status')||'all',page=Number(p.get('page')||1),part=p.get('part')||'';
  if((company&&!uuid(company))||!['all','unclassified','draft','reviewed','excluded','unpriced'].includes(status)||!Number.isInteger(page)||page<1||page>100000||(part&&!Object.hasOwn(TARGETS,part)))throw fail('조회 조건을 확인해주세요.');
  const base=()=>{let q=db.from('photo_case_management');return q;};
  let q=base().select('*',{count:'exact'});if(company)q=q.eq('company_id',company);
  if(status==='unpriced')q=q.gt('missing_prices',0).neq('review_status','excluded');else if(status!=='all')q=q.eq('review_status',status);
  if(part)q=q.contains('targets',[{part}]);
  const {data,count,error}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*12,page*12-1);check(error);
  const stats=await Promise.all(['all','unclassified','draft','reviewed','excluded'].map(async state=>{let s=base().select('id',{count:'exact',head:true});if(company)s=s.eq('company_id',company);if(state!=='all')s=s.eq('review_status',state);const r=await s;check(r.error);return [state,r.count||0];}));
  return reply({photos:await withUrls(db,data||[]),count:count||0,page,stats:Object.fromEntries(stats)});
 }catch(e){return reply({error:e.status?e.message:'사진 목록을 불러오지 못했습니다.',setupRequired:!!e.setup},e.status||500);}
}
async function propose(db,photo) {
 if(!process.env.OPENAI_API_KEY)throw fail('AI 분석 서버 설정을 확인해주세요.',503);
 const [signed]=await withUrls(db,[photo]);if(!signed.url)throw fail('사진 파일을 불러오지 못했습니다.');
 const instruction=`인테리어필름 시공 데이터의 6단계 분류를 제안한다. 사진 속 주요 시공 대상을 각각 분리한다. 배경 부위를 무조건 모두 등록하지 말고 주요 독립 대상을 기록한다.
1 공간 space: ${JSON.stringify(SPACES)}.
2 대상 part 및 3 세부종류 kind는 다음 사전에서만 선택: ${JSON.stringify(TARGETS)}.
4 shapes는 모양·배치·표면구조·개폐방식의 짧은 한국어 태그 배열.
5 damage: ${JSON.stringify(DAMAGES)} 중 하나. 사진에서 보이지 않으면 확인 필요, 손상이 눈에 띄지 않으면 파손 미관찰. '파손 없음(관리자 확인)'은 사용하지 말것. 시공 후 사진에서 시공 전 파손을 추측하지 말것.
6 components는 보이는 구성부위의 한국어 배열. 문과 문틀이 함께 보이면 문·문틀 세트로 묶고 문짝·문틀을 별도 중복 등록하지 말것. 격자살 등 추가특징은 허용.
싱크대와 함께 보이는 냉장고장은 주 싱크대의 구성 부위로 포함하고 하나의 대상으로 기록한다. 이 경우 kind는 냉장고장 결합형 싱크대, components에 냉장고장을 포함한다. 냉장고장을 별도 대상으로 중복 등록하지 않는다. 싱크대 없이 냉장고장만 촬영한 사례는 냉장고장 독립 대상으로 유지한다. 냉장고장과 붙박이장을 구분. 금액은 추정하거나 기존가격을 여러 대상에 배분하지 말것. 크기·수량·시공범위를 창작하지 말것. 공간과 방화 성능 등은 불확실하면 확인 필요로 기록. 주거 엘리베이터를 무조건 상업공간으로 판단하지 말것.
현재 사진 상태: ${STAGES[photo.photo_stage]||'미확인'}. 이는 촬영상태이며 보수 전 상태의 증거가 아니다.
JSON만 반환: {"targets":[{"space":"주거공간","part":"문","kind":"방문","shapes":["평판형","여닫이"],"damage":"파손 미관찰","components":["문·문틀 세트"],"notes":"판단 이유와 미확인 사항"}]} 최대 20대상.`;
 const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.PHOTO_CLASSIFICATION_MODEL||'gpt-5.6-luna',max_output_tokens:6000,input:[{role:'user',content:[{type:'input_text',text:instruction},{type:'input_image',image_url:signed.url}]}],text:{format:{type:'json_object'}}})});
 if(!res.ok)throw fail('AI 분류에 실패했습니다. 기존 데이터는 유지됩니다. 잠시 후 다시 시도해주세요.',502);
 const result=await res.json(),text=result.output_text||(result.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 let parsed;try{parsed=JSON.parse(text);}catch{throw fail('AI 응답을 확인하지 못했습니다. 직접 분류하거나 다시 시도해주세요.',502);}
 return aiTargets(parsed.targets,randomUUID);
}
export async function POST(request){
 try{
  const {db,user}=await context(request);const raw=await request.text();if(raw.length>100000)throw fail('입력 내용이 너무 큽니다.');
  let b;try{b=JSON.parse(raw);}catch{throw fail('입력 형식을 확인해주세요.');}
  if(!b||!uuid(b.photoId)||!Number.isInteger(b.revision)||b.revision<0||!['save','analyze'].includes(b.action))throw fail('사진과 작업 내용을 확인해주세요.');
  const {data:photo,error}=await db.from('photo_case_management').select('*').eq('id',b.photoId).maybeSingle();check(error);
  if(!photo)throw fail('사진을 찾을 수 없습니다.',404);
  if(!photo.company_id)throw fail('사진의 소속 업체를 먼저 확인해주세요.');
  if(photo.revision!==b.revision)throw fail('다른 작업에서 변경되었습니다. 최신 목록을 다시 불러와주세요.',409);
  let targets,stage,status;
  if(b.action==='analyze'){
   if(photo.review_status!=='unclassified')throw fail('이미 분류한 사진입니다. 기존 분류를 직접 검토해주세요.',409);
   targets=await propose(db,photo);stage=photo.photo_stage;status='draft';
  }else{
   if(!Object.hasOwn(STAGES,b.photoStage)||!['draft','reviewed','excluded'].includes(b.status))throw fail('사진 상태와 검토 상태를 확인해주세요.');
   try{targets=validateTargets(b.targets,{reviewed:b.status==='reviewed'});}catch(e){throw fail(e.message);}
   stage=b.photoStage;status=b.status;
  }
  const {data:saved,error:se}=await db.rpc('save_photo_case_classification',{p_user:user.id,p_photo:photo.id,p_revision:b.revision,p_body:{photoStage:stage,status,targets}});check(se);
  return reply({saved});
 }catch(e){console.error('photo-data',e.code||e.status||'server');return reply({error:e.status?e.message:'사진 분류 저장에 실패했습니다. 입력 내용은 유지됩니다.',setupRequired:!!e.setup},e.status||500);}
}
