import {privateAuth,privateJson as json,uuid} from '../../../../lib/workerPrivate';
import {completionContext} from '../../../../lib/customerCompletion.mjs';
import {approvedTemplate,templateMatches,dispatchSiteMessage,refreshDeliveries} from '../../../../lib/siteAlimtalk.mjs';
export const runtime='nodejs';
export const maxDuration=60;
async function context(request,siteId){
 const a=await privateAuth(request);if(a.error)throw Object.assign(Error(a.error),{status:a.status});
 if(!uuid(siteId))throw Object.assign(Error('현장을 확인해주세요.'),{status:400});
 return {...a,...await completionContext(a.db,a.companyId,siteId)};
}
const fail=e=>{console.error('completion alimtalk',e.code||'failed');return json({error:e.status?e.message:'완료 안내를 확인하지 못했습니다.'},e.status||503);};
export async function GET(request){try{
 const c=await context(request,new URL(request.url).searchParams.get('siteId'));
 let history=await c.db.from('alimtalk_deliveries').select('id,status,accounting,receipt_id,created_at,error_code').eq('company_id',c.companyId).eq('site_id',c.site.id).eq('kind','customer_completion').order('created_at',{ascending:false}).limit(1);if(history.error)throw history.error;
 await refreshDeliveries(c.db,history.data,c.config);
 history=await c.db.from('alimtalk_deliveries').select('status,created_at,error_code').eq('company_id',c.companyId).eq('site_id',c.site.id).eq('kind','customer_completion').order('created_at',{ascending:false}).limit(1);if(history.error)throw history.error;
 const approval=await approvedTemplate(c.config),reasons=[...c.reasons];
 if(!approval.ready)reasons.push(c.config.templateId?approval.reason:'계좌·계약금액을 포함한 시공 완료 템플릿 등록과 승인이 필요합니다.');
 else if(!templateMatches(approval.template,c.message))reasons.push('승인된 완료 템플릿 내용이 앱 안내문과 다릅니다.');
 if(history.data?.length)reasons.push('이미 발송 요청한 완료 안내입니다. 발송 결과를 확인해주세요.');
 return json({text:c.message.text,contentHash:c.message.contentHash,ready:!reasons.length,reasons,latest:history.data?.[0]||null});
 }catch(e){return fail(e);}}
export async function POST(request){try{
 const body=await request.json(),c=await context(request,body.siteId);
 if(c.message.contentHash!==body.contentHash)return json({error:'계좌·계약금액 또는 고객 정보가 바뀌었습니다. 다시 확인해주세요.'},409);
 if(c.reasons.length)return json({error:c.reasons.join(' ')},409);
 const result=await dispatchSiteMessage({db:c.db,site:c.site,company:c.company,message:c.message,config:c.config,actorId:c.user.id});return json(result,result.status==='blocked'?409:200);
 }catch(e){return fail(e);}}
