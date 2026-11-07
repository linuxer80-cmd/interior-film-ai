import {privateAuth,privateJson,uuid} from '../../../../lib/workerPrivate';
import {cleanFollowUp,validDate} from '../../../../lib/consultationFollowUp.mjs';
export async function GET(request) {
  try {
    const auth=await privateAuth(request);if(auth.error)return privateJson({error:auth.error},auth.status);
    const url=new URL(request.url);
    if(url.searchParams.get('companyId')!==auth.companyId)return privateJson({error:'선택한 업체를 확인해주세요.'},403);
    const id=url.searchParams.get('id');
    let query=auth.db.from('consultation_follow_ups').select('*').eq('company_id',auth.companyId);
    const due=url.searchParams.get('due');
    if(due){if(!validDate(due))return privateJson({error:'연락 날짜를 확인해주세요.'},400);query=query.neq('stage','closed').lte('due_date',due);}
    if(id){if(!uuid(id))return privateJson({error:'상담 번호를 확인해주세요.'},400);query=query.eq('id',id);}
    else {
      const offset=Number(url.searchParams.get('offset')||0);
      if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return privateJson({error:'페이지를 확인해주세요.'},400);
      query=query.order('due_date',{nullsFirst:false}).order('id').range(offset,offset+99);
    }
    const {data,error}=await query;if(error)throw error;
    return privateJson({companyId:auth.companyId,items:data});
  }catch{return privateJson({error:'상담 진행을 불러오지 못했습니다.'},500);}
}
export async function POST(request) {
  try {
    const auth=await privateAuth(request);if(auth.error)return privateJson({error:auth.error},auth.status);
    const raw=await request.text();if(raw.length>4000)return privateJson({error:'입력 내용이 너무 깁니다.'},400);
    let body,values;try{body=JSON.parse(raw);values=cleanFollowUp(body);}catch(e){return privateJson({error:e.message||'입력을 확인해주세요.'},400);}
    if(body.companyId!==auth.companyId)return privateJson({error:'선택한 업체를 확인해주세요.'},403);
    if(!uuid(body.id))return privateJson({error:'상담 번호를 확인해주세요.'},400);
    if(Object.hasOwn(body,'siteId')) {
      if(body.siteId!==null && !uuid(body.siteId))return privateJson({error:'연결 현장을 확인해주세요.'},400);
      if(body.siteId!==null){const site=await auth.db.from('sites').select('id').eq('id',body.siteId).eq('company_id',auth.companyId).maybeSingle();if(site.error)throw site.error;if(!site.data)return privateJson({error:'이 업체의 현장만 연결할 수 있습니다.'},403);}
      values.site_id=body.siteId;
    }
    let result;
    if(body.revision===0) result=await auth.db.from('consultation_follow_ups').insert({...values,id:body.id,company_id:auth.companyId}).select().single();
    else result=await auth.db.from('consultation_follow_ups').update({...values,revision:body.revision+1,updated_at:new Date().toISOString()}).eq('company_id',auth.companyId).eq('id',body.id).eq('revision',body.revision).select().maybeSingle();
    if(result.error?.code==='23505'||(!result.error&&!result.data))return privateJson({error:'다른 화면에서 변경되었습니다. 새로 확인한 뒤 저장해주세요.'},409);
    if(result.error)throw result.error;
    return privateJson({companyId:auth.companyId,item:result.data});
  }catch{return privateJson({error:'상담 진행을 저장하지 못했습니다. 다시 확인해주세요.'},500);}
}
