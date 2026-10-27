// One customer-confirmation retry explicitly requested by the owner on 2026-10-27.
// Run only as a one-off production operation. The deadline and existing atomic
// delivery reservation prevent subsequent builds from sending another message.
import {portalDb} from "./lib/customerPortal.mjs";
import {notifyCustomerConfirmation} from "./lib/customerConfirmation.mjs";
import {customerStageContext,stageConfig} from "./lib/customerStageAlimtalk.mjs";
import {refreshDeliveries,maskPhone,phoneNumber,workDates} from "./lib/siteAlimtalk.mjs";
const company="2ddfe3d9-4411-4991-ae35-5b876be411bc",site="c5eab1e9-f5ac-44e0-ac89-134a0e23d4de",actor="f7f8dd6f-1d74-434d-a139-10fa8691357e";
async function run(){
 if(process.env.VERCEL_ENV!=="production"||Date.now()>1793089184297)return console.log("AUTHORIZED_SEND",{status:"expired_or_wrong_environment"});
 const db=portalDb();
 const context=async(...args)=>{
  const c=await customerStageContext(...args);
  if(c.site.id!==site||c.site.company_id!==company||c.site.site_name!=="부평일신동"||c.site.status!=="scheduled"||new Date(c.site.updated_at).getTime()!==Date.parse("2026-10-27T07:47:30.497Z")||JSON.stringify(workDates(c.site))!==JSON.stringify(["2026-11-05","2026-11-06"])||maskPhone(phoneNumber(c.site.customer_phone))!=="010-****-3018"||c.config.templateId!=="KA01TP261026090529731Mn4wqrucb3t"||c.message.kind!=="customer_schedule")throw Object.assign(new Error("send_guard_failed"),{code:"send_guard_failed"});
  return c;
 };
 const result=await notifyCustomerConfirmation(db,company,site,actor,{context});
 console.log("AUTHORIZED_SEND",JSON.stringify({site,status:result.status,id:result.id||null,reason:result.reason||null}));
 if(!result.id)return;
 for(let i=0;i<5;i++){
  const q=await db.from("alimtalk_deliveries").select("id,status,accounting,receipt_id,error_code").eq("company_id",company).eq("site_id",site).eq("id",result.id).single();
  if(q.error)throw Object.assign(new Error("receipt_read_failed"),{code:"receipt_read_failed"});
  if(q.data.accounting!=="reserved"){console.log("AUTHORIZED_SEND_FINAL",JSON.stringify({id:q.data.id,status:q.data.status,accounting:q.data.accounting,error_code:q.data.error_code}));return;}
  await refreshDeliveries(db,[q.data],stageConfig("before"));
  if(i<4)await new Promise(resolve=>setTimeout(resolve,5000));
 }
 const q=await db.from("alimtalk_deliveries").select("id,status,accounting,error_code").eq("company_id",company).eq("site_id",site).eq("id",result.id).single();
 console.log("AUTHORIZED_SEND_FINAL",JSON.stringify(q.error?{status:"receipt_read_failed"}:q.data));
}
try{await run();}catch(e){console.error("AUTHORIZED_SEND_ERROR",e.code||"operation_failed");}
