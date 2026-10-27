// Read-only production preflight: never reserves credits or sends messages.
import {pathToFileURL} from 'node:url';
import {stageConfig} from '../lib/customerStageAlimtalk.mjs';
import {CUSTOMER_TEMPLATE_NAMES,stageTemplate,stageButton} from '../lib/customerStages.mjs';
import {approvedTemplate,templateMatches,templateButtonMatches} from '../lib/siteAlimtalk.mjs';
export async function checkCustomerTemplateLinks(env=process.env,fetcher=fetch){
 const results=await Promise.all(Object.keys(CUSTOMER_TEMPLATE_NAMES).map(async stage=>{
  const config=stageConfig(stage,env),approval=await approvedTemplate(config,fetcher);
  if(!approval.ready)return {stage,name:config.templateName,ready:false,reason:approval.reason};
  const message={text:stageTemplate(stage),variables:{},requiredButton:stageButton(stage)};
  return {stage,name:config.templateName,templateId:approval.template.templateId,ready:templateMatches(approval.template,message)&&templateButtonMatches(approval.template,message),reason:!templateMatches(approval.template,message)?'문구 불일치':!templateButtonMatches(approval.template,message)?'고객페이지 버튼 불일치':null,...(!templateMatches(approval.template,message)||!templateButtonMatches(approval.template,message)?{approvedTemplate:{content:approval.template.content,buttons:approval.template.buttons,extra:approval.template.extra,ad:approval.template.ad}}:{})};
 }));
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.VERCEL_ENV!=='production'||!process.env.SOLAPI_API_KEY){
  console.log('Customer link templates: production check skipped.');
 }else{
  const results=await checkCustomerTemplateLinks();
  for(const r of results)console.log('Customer link template:',JSON.stringify(r));
  if(results.some(r=>!r.ready)){console.error('Customer link template verification failed; deployment stopped.');process.exitCode=1;}
 }
}
