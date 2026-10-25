import {solapiConfig,solapiRequest} from './siteAlimtalk.mjs';
// Money can be serialized as decimal strings. Empty/missing values are never zero.
function amount(value){
 if(typeof value==='string'){const text=value.trim();if(!/^-?\d+(?:\.\d+)?$/.test(text))return null;value=Number(text);}
 return typeof value==='number'&&Number.isFinite(value)?value:null;
}
const authCodes=new Set(['SignatureDoesNotMatch','InvalidApiKey','InvalidAPIKey','Unauthorized','InvalidSignature','InvalidAuthentication','AuthenticationFailed','ApiKeyNotFound']);
function failed(result,data){
 const raw=data?.errorCode,authentication=result.status===401||authCodes.has(raw),permission=result.status===403;
 const code=authCodes.has(raw)?raw:permission?'PERMISSION_DENIED':result.status===429?'RATE_LIMITED':'HTTP_'+result.status;
 console.warn('solapi balance lookup',{status:result.status,code});
 return {available:false,error:authentication?'솔라피 API 인증에 실패했습니다. API Key와 Secret이 같은 쌍으로 등록되었는지 확인해주세요.':permission?'솔라피 API 키에 잔액 조회 권한이 없습니다. 솔라피 API 키 권한을 확인해주세요.':result.status===429?'솔라피 조회 요청이 많습니다. 잠시 후 다시 새로고침해주세요.':'솔라피 잔액을 조회하지 못했습니다. 잠시 후 새로고침해주세요.',code};
}
// balance already includes deposits net of VAT; never add deposit again.
export async function readSolapiBalance({config=solapiConfig('customer_schedule'),fetcher=fetch}={}){
 config={...config,apiKey:config.apiKey?.trim(),secret:config.secret?.trim()};
 if(!config.apiKey||!config.secret)return {available:false,error:'솔라피 API 설정을 확인해주세요.',code:'MISSING_CONFIGURATION'};
 try{
  const result=await solapiRequest('/cash/v1/balance',{config,fetcher});
  if(!result.ok)return failed(result,result.data);
  const payload=result.data?.data&&typeof result.data.data==='object'?result.data.data:result.data;
  const balance=amount(payload?.balance),point=amount(payload?.point);
  if(balance===null||point===null||!Number.isFinite(balance+point)){
   console.warn('solapi balance lookup',{status:result.status,code:'INVALID_BALANCE_RESPONSE',balanceType:typeof payload?.balance,pointType:typeof payload?.point});
   return {available:false,error:'솔라피 잔액 응답을 확인하지 못했습니다. 잠시 후 새로고침해주세요.',code:'INVALID_BALANCE_RESPONSE'};
  }
  return {available:true,balance,point,total:balance+point,checkedAt:new Date().toISOString()};
 }catch{console.warn('solapi balance lookup',{code:'PROVIDER_UNAVAILABLE'});return {available:false,error:'솔라피 잔액 조회가 지연됩니다. 잠시 후 새로고침해주세요.',code:'PROVIDER_UNAVAILABLE'};}
}
