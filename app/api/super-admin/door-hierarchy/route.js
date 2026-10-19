import {pilotIdentity,pilotRole,pilotJson} from '../../../../lib/materialPilotServer';
import {registeredStoragePath} from '../../../../lib/visualCaseSearch';
import {doorSchema,doorPrompt,validateDoorHierarchy,isDoorCase} from '../../../../lib/doorHierarchy.mjs';
import {ESTIMATE_ANALYSIS_MODEL} from '../../../../lib/estimatePhotoAnalysis';
import sharp from 'sharp';
export const runtime='nodejs';export const maxDuration=60;
const uuid=v=>typeof v==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
async function read(q){const r=await q;if(r.error)throw r.error;return r.data||[];}
async function analyze(images,hint){
 if(!process.env.OPENAI_API_KEY)throw Error('AI 서버 설정을 확인해주세요.');
 const content=[{type:'input_text',text:doorPrompt+'\n등록 제목은 참고만 사용: '+String(hint||'').slice(0,300)},...images.map(image_url=>({type:'input_image',image_url,detail:'high'}))];
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:ESTIMATE_ANALYSIS_MODEL,store:false,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'door_hierarchy',strict:true,schema:doorSchema}}})});
 const result=await r.json();if(!r.ok||result.status==='incomplete')throw Error('문 분석에 실패했습니다. AI 사용량과 연결 상태를 확인해주세요.');
 const output=result.output_text||(result.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('');
 return validateDoorHierarchy(JSON.parse(output));
}
export async function POST(request){try{
 const {db,user}=await pilotIdentity(request);await pilotRole(db,user,'super');
 const raw=await request.text();if(raw.length>4500000)return pilotJson({error:'사진은 3MB 이하로 등록해주세요.'},413);
 const b=JSON.parse(raw);if(!uuid(b.companyId))return pilotJson({error:'업체를 확인해주세요.'},400);
 const companies=await read(db.from('companies').select('id,company_name').eq('id',b.companyId));if(!companies.length)return pilotJson({error:'업체가 없습니다.'},404);
 if(b.action==='query'){
  if(typeof b.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[a-z\d+/=\r\n]+$/i.test(b.image))return pilotJson({error:'JPG·PNG·WebP 사진을 등록해주세요.'},400);
  const bytes=Buffer.from(b.image.split(',')[1],'base64');if(bytes.length>3000000)return pilotJson({error:'사진은 3MB 이하로 등록해주세요.'},413);
  const image=await sharp(bytes,{limitInputPixels:25000000}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
  return pilotJson({analysis:await analyze(['data:image/jpeg;base64,'+image.toString('base64')],'새 테스트 사진')});
 }
 if(b.action==='analyze'){
  if(!uuid(b.workId))return pilotJson({error:'사례를 확인해주세요.'},400);
  const rows=await read(db.from('work_items').select('id,category,sub_category,case_profile').eq('company_id',b.companyId).eq('id',b.workId));
  if(!rows[0]||!isDoorCase(rows[0]))return pilotJson({error:'소속 업체의 문 사례만 분석합니다.'},403);
  const photos=await read(db.from('work_photos').select('id,photo_type,storage_path,photo_url').eq('company_id',b.companyId).eq('work_item_id',b.workId).order('id').limit(100));
  photos.sort((a,b)=>Number(b.photo_type==='before')-Number(a.photo_type==='before'));
  const images=[];
  for(const p of photos){if(images.length===3)break;const path=registeredStoragePath(p.storage_path||p.photo_url,process.env.NEXT_PUBLIC_SUPABASE_URL);if(!path)continue;const signed=await db.storage.from('work-photos').createSignedUrl(path,300);if(signed.error)throw signed.error;if(signed.data?.signedUrl)images.push(signed.data.signedUrl);}
  if(!images.length)return pilotJson({error:'분석 가능한 등록 사진이 없습니다.'},400);
  return pilotJson({analysis:await analyze(images,rows[0].category+' '+rows[0].sub_category),photoCount:images.length});
 }
 if(b.action!=='list')return pilotJson({error:'요청을 확인해주세요.'},400);
 const all=[];let cursor=null;
 for(let page=0;page<20;page++){
  let q=db.from('work_items').select('id,category,sub_category,case_profile,actual_cost').eq('company_id',b.companyId).order('id').limit(500);if(cursor)q=q.gt('id',cursor);
  const rows=await read(q);all.push(...rows.filter(isDoorCase));if(rows.length<500)break;cursor=rows.at(-1).id;if(page===19)throw Error('사례가 많아 조회 범위를 확인해야 합니다.');
 }
 const candidates=all.slice(0,100),ids=candidates.map(x=>x.id),photos=[];
 if(ids.length)for(let offset=0;offset<10000;offset+=500){const rows=await read(db.from('work_photos').select('id,work_item_id,photo_type,storage_path,photo_url').eq('company_id',b.companyId).in('work_item_id',ids).order('id').range(offset,offset+499));photos.push(...rows);if(rows.length<500)break;if(offset===9500)throw Error('사진이 많아 조회 범위를 확인해야 합니다.');}
 const chosen=candidates.map(w=>{const own=photos.filter(p=>p.work_item_id===w.id);const first=own.find(p=>p.photo_type==='before')||own[0];return {...w,photoCount:own.length,path:first?registeredStoragePath(first.storage_path||first.photo_url,process.env.NEXT_PUBLIC_SUPABASE_URL):''};});
 const paths=[...new Set(chosen.map(x=>x.path).filter(Boolean))];
 const signed=paths.length?await db.storage.from('work-photos').createSignedUrls(paths,3600):{data:[]};if(signed.error)throw signed.error;
 const urls=new Map((signed.data||[]).map(x=>[x.path,x.signedUrl]));
 return pilotJson({company:companies[0],total:all.length,limited:all.length>100,items:chosen.map(({path,...w})=>({...w,url:urls.get(path)||null}))});
 }catch(e){console.error('door-hierarchy',e.code||e.status||e.message);return pilotJson({error:e.status?e.message:'문 테스트 요청에 실패했습니다. 다시 조회해주세요.'},e.status||500);}}
