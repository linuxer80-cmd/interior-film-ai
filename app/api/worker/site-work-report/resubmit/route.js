import { privateAuth, privateJson, uuid } from '../../../../../lib/workerPrivate';
import { resolveWorkerSite } from '../../../../../lib/workerSiteAccess.mjs';
import { syncAfterReport } from '../../../../../lib/siteLifecycle.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request) {
  try {
    const auth=await privateAuth(request,false);
    if(auth.error) return privateJson({success:false,error:auth.error},auth.status);
    const raw=await request.text();
    if(raw.length>18000) return privateJson({success:false,error:'보고 내용이 너무 깁니다.'},400);
    let body;try{body=JSON.parse(raw)}catch{return privateJson({success:false,error:'보고 내용을 확인해 주세요.'},400)}
    const {siteId,reportId,updatedAt}=body || {};
    const summary=typeof body?.summary==='string'?body.summary.trim():'';
    const region=typeof body?.region==='string'?body.region.trim():'';
    const memo=typeof body?.memo==='string'?body.memo.trim():'';
    if(!uuid(siteId)||!uuid(reportId)||typeof updatedAt!=='string'||updatedAt.length>64||!Number.isFinite(Date.parse(updatedAt))||
       !summary||summary.length>5000||region.length>5000||memo.length>5000)
      return privateJson({success:false,error:'보고 내용과 기존 상태를 확인해 주세요.'},400);
    const access=await resolveWorkerSite(auth.db,auth.user.id,siteId);
    if(!access.canSubmit || access.site.status==='cancelled') return privateJson({success:false,error:'이 현장의 완료보고 제출 권한을 확인해 주세요.'},403);
    const result=await auth.db.rpc('assistant_resubmit_report',{
      p_company_id:access.worker.company_id,p_site_id:siteId,p_worker_id:access.worker.id,p_user_id:auth.user.id,
      p_report_id:reportId,p_expected_updated_at:updatedAt,p_work_region:region,p_work_summary:summary,p_memo:memo,
    });
    if(result.error){
      const code=result.error.code;
      if(['PGRST202','42883'].includes(code)) return privateJson({success:false,error:'안전한 재제출 기능이 서버에 아직 준비되지 않았습니다.'},503);
      const status=code==='42501'?403:code==='P0001'?409:code==='22023'?400:500;
      return privateJson({success:false,error:status===500?'보고서 재제출을 처리하지 못했습니다.':result.error.message},status);
    }
    if(result.data?.reportId!==reportId||result.data?.review_status!=='pending')
      return privateJson({success:false,error:'저장 결과를 확인하지 못했습니다. 다시 시도하기 전에 보고서 상태를 확인해 주세요.'},503);
    const warning=await syncAfterReport(auth.db,access.worker.company_id,siteId);
    return privateJson({success:true,reportId,review_status:'pending',message:warning||'보완한 완료보고를 재제출했습니다. 관리자 검수를 기다려 주세요.'});
  } catch(error) {
    return privateJson({success:false,error:error.status?error.message:'보고서를 재제출하지 못했습니다.'},error.status||500);
  }
}
