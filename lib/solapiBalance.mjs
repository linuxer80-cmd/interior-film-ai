import {solapiConfig,solapiRequest} from './siteAlimtalk.mjs';
// balance already includes deposits net of VAT; never add deposit again.
export async function readSolapiBalance({config=solapiConfig('customer_schedule'),fetcher=fetch}={}){
 if(!config.apiKey||!config.secret)return {available:false,error:'솔라피 API 설정을 확인해주세요.'};
 try{
  const result=await solapiRequest('/cash/v1/balance',{config,fetcher});
  const {balance,point}=result.data||{};
  if(!result.ok||typeof balance!=='number'||!Number.isFinite(balance)||typeof point!=='number'||!Number.isFinite(point))return {available:false,error:'솔라피 잔액을 조회하지 못했습니다. 잠시 후 새로고침해주세요.'};
  return {available:true,balance,point,total:balance+point,checkedAt:new Date().toISOString()};
 }catch{return {available:false,error:'솔라피 잔액 조회가 지연됩니다. 잠시 후 새로고침해주세요.'};}
}
