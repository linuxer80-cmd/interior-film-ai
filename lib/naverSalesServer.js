import {connectionRow,publicConnection,withMarketingLock,sealKey,openKey} from './onlineSalesServer';
import {MARKETING_COMPANY_ID,reportingPeriod} from './onlineSales.mjs';
import {loadNaverReport,loadNaverKeywords,NAVER_CUSTOMER_ID,NaverAdsError} from './naverAds.mjs';
function storedCredentials(row){
  if(!row.api_key_ciphertext)throw new NaverAdsError('네이버 광고 API를 먼저 연결해주세요.',400);
  const value=JSON.parse(openKey(row.api_key_ciphertext,row.advertiser_id,'naver'));
  if(value.customerId!==NAVER_CUSTOMER_ID||row.advertiser_id!==NAVER_CUSTOMER_ID)throw new NaverAdsError('연결된 네이버 광고계정을 확인해주세요.',403);
  return value;
}
export async function syncNaver(db,credentials){
  return withMarketingLock(db,async token=>{
    try{
      const row=await connectionRow(db,'naver'),creds=credentials||storedCredentials(row);
      const snapshot=await loadNaverReport(creds,reportingPeriod());
      const update={snapshot,last_error:null,last_synced_at:new Date().toISOString()};
      if(credentials)Object.assign(update,{advertiser_id:creds.customerId,api_key_ciphertext:sealKey(JSON.stringify(creds),creds.customerId,'naver')});
      const {error}=await db.from('online_sales_connections').update(update).eq('company_id',MARKETING_COMPANY_ID).eq('platform','naver').eq('lock_token',token);if(error)throw error;
      return publicConnection(await connectionRow(db,'naver'));
    }catch(e){
      await db.from('online_sales_connections').update({last_error:e.publicMessage||'네이버 조회를 완료하지 못했습니다. 기존 결과를 유지합니다.'}).eq('company_id',MARKETING_COMPANY_ID).eq('platform','naver').eq('lock_token',token);
      throw e;
    }
  },'naver');
}
export async function naverKeywords(db,groupId){
  return withMarketingLock(db,async()=>{
    const row=await connectionRow(db,'naver');
    // Use the same reporting window as the dashboard so tables are comparable.
    return loadNaverKeywords(storedCredentials(row),groupId,row.snapshot?.period||reportingPeriod());
  },'naver');
}
