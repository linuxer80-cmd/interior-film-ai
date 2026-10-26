import {privateAuth,privateJson as json,uuid} from '../../../../lib/workerPrivate';
import {customerStageContext} from '../../../../lib/customerStageAlimtalk.mjs';
import {approvedTemplate,templateMatches,dispatchSiteMessage,refreshDeliveries} from '../../../../lib/siteAlimtalk.mjs';
import {isOperatorCompany} from '../../../../lib/operatorCompany.mjs';
export const runtime='nodejs';export const maxDuration=60;
async function context(request,siteId,stage){const a=await privateAuth(request);if(a.error)throw Object.assign(Error(a.error),{status:a.status});if(!uuid(siteId))throw Object.assign(Error('현장을 확인해주세요.'),{status:400});return {...a,...await customerStageContext(a.db,a.companyId,siteId,stage)};}
const fail=e=>{console.error('customer stage',e.code||'failed');return json({error:e.status?e.message:'고객 안내를 확인하지 못했습니다.'},e.status||503);};
export async function GET(request){try{
 const q=new URL(request.url).searchParams,c=await context(request,q.get('siteId'),q.get('stage'));
 let history=await c.db.from('alimtalk_deliveries').select('id,status,accounting,receipt_id,created_at,error_code').eq('company_id',c.companyId).eq('site_id',c.site.id).eq('kind',c.message.kind).order('created_at',{ascending:false}).limit(1);if(history.error)throw history.error;
 await refreshDeliveries(c.db,history.data,c.config);
 history=await c.db.from('alimtalk_deliveries').select('status,created_at,error_code').eq('company_id',c.companyId).eq('site_id',c.site.id).eq('kind',c.message.kind).order('created_at',{ascending:false}).limit(1);if(history.error)throw history.error;
 const reasons=[...c.reasons],approval=await approvedTemplate(c.config);
 if(!approval.ready)reasons.push(c.config.templateId?approval.reason:'이 단계의 링크형 템플릿 등록·승인이 필요합니다.');
 else if(!templateMatches(approval.template,c.message))reasons.push('승인된 템플릿 문구와 앱 안내문이 다릅니다.');
 else if(!(approval.template.buttons||[]).some(b=>b.buttonType==='WL'&&b.buttonName===c.message.requiredButton.buttonName&&b.linkMo===c.message.requiredButton.linkMo&&b.linkPc===c.message.requiredButton.linkPc))reasons.push('등록된 링크 버튼 설정을 확인해주세요.');
 const account=await c.db.from('alimtalk_accounts').select('enabled,available_count').eq('company_id',c.companyId).maybeSingle();if(account.error)throw account.error;
 if(!account.data?.enabled)reasons.push('업체 알림톡 사용 설정이 꺼져 있습니다.');
 if(!isOperatorCompany(c.companyId)&&!(account.data?.available_count>0))reasons.push('알림톡 충전이 필요합니다.');
 if(history.data?.length)reasons.push('이미 발송 요청한 안내입니다. 발송 결과를 확인해주세요.');
 return json({unlimited:isOperatorCompany(c.companyId),text:c.message.text,path:c.message.variables['#{고객페이지토큰}']?'/customer/site/'+c.message.variables['#{고객페이지토큰}']+'?stage='+c.message.stage:null,contentHash:c.message.contentHash,ready:!reasons.length,reasons,latest:history.data?.[0]||null});
 }catch(e){return fail(e);}}
export async function POST(request){try{const b=await request.json(),c=await context(request,b.siteId,b.stage);if(c.message.contentHash!==b.contentHash)return json({error:'고객 정보가 변경되었습니다. 다시 확인해주세요.'},409);if(c.reasons.length)return json({error:c.reasons.join(' ')},409);
 const result=await dispatchSiteMessage({db:c.db,site:c.site,company:c.company,message:c.message,config:c.config,actorId:c.user.id});return json(result,result.status==='blocked'?409:200);
 }catch(e){return fail(e);}}
