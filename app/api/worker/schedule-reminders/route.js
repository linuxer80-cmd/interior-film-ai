import {createClient} from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime="nodejs";
export const maxDuration=60;
export const dynamic="force-dynamic";
const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});

function tomorrowKorea(){
 const now=new Date(Date.now()+24*60*60*1000);
 return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
async function all(query){
 const result=[];
 for(let offset=0;offset<10000;offset+=500){
  const {data,error}=await query.range(offset,offset+499);
  if(error)throw error;
  result.push(...(data||[]));
  if(!data||data.length<500)return result;
 }
 throw Error("조회 한도를 초과했습니다.");
}
const chunks=(items,n=100)=>Array.from({length:Math.ceil(items.length/n)},(_,i)=>items.slice(i*n,(i+1)*n));
const key=(company,site)=>company+":"+site;

export async function GET(request){
 if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)
  return reply({error:"Unauthorized"},401);
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY)
  return reply({error:"Supabase 또는 VAPID 환경 변수가 누락됐습니다."},503);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false}
 });
 const date=tomorrowKorea();
 try{
  webpush.setVapidDetails("mailto:linuxer80@gmail.com",
   process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  // Explicit daily assignments take precedence; legacy assignments are used only
  // for sites with no dated assignment and an explicit work_dates match.
  const [assignments,sites]=await Promise.all([
   all(db.from("site_daily_assignments")
    .select("company_id,site_id,worker_id,work_date").eq("work_date",date).order("site_id")),
   all(db.from("sites")
    .select("id,company_id,site_name,work_dates,status")
    .in("status",["scheduled","in_progress"]).order("id"))
  ]);
  const eligible=sites.filter(site=>Array.isArray(site.work_dates)&&site.work_dates.includes(date));
  const siteMap=new Map(eligible.map(site=>[key(site.company_id,site.id),site]));
  const assigned=new Map();
  const datedSites=new Set(assignments.map(row=>key(row.company_id,row.site_id)));
  for(const row of assignments){
   const site=siteMap.get(key(row.company_id,row.site_id));
   if(site)assigned.set(key(row.company_id,row.site_id)+":"+row.worker_id,{site,workerId:row.worker_id});
  }
  const legacySites=eligible.filter(site=>!datedSites.has(key(site.company_id,site.id)));
  for(const batch of chunks(legacySites)){
   if(!batch.length)continue;
   const legacy=await all(db.from("site_workers")
    .select("company_id,site_id,worker_id").in("site_id",batch.map(site=>site.id)).order("id"));
   for(const row of legacy){
    const site=siteMap.get(key(row.company_id,row.site_id));
    if(site)assigned.set(key(row.company_id,row.site_id)+":"+row.worker_id,{site,workerId:row.worker_id});
   }
  }
  const workerIds=[...new Set([...assigned.values()].map(item=>item.workerId))];
  const workers=new Map();
  for(const batch of chunks(workerIds)){
   const found=await all(db.from("workers")
    .select("id,company_id,user_id,is_active").in("id",batch).eq("is_active",true).order("id"));
   for(const worker of found)if(worker.user_id)workers.set(key(worker.company_id,worker.id),worker);
  }
  const companyIds=[...new Set(eligible.map(site=>site.company_id))];
  const companies=new Map();
  for(const batch of chunks(companyIds)){
   const {data,error}=await db.from("companies").select("id,company_name").in("id",batch);
   if(error)throw error;
   for(const company of data||[])companies.set(company.id,company.company_name);
  }
  let queued=0,sent=0,failed=0,noSubscription=0;
  const errors=[];
  for(const {site,workerId} of assigned.values()){
   const worker=workers.get(key(site.company_id,workerId));
   if(!worker)continue;
   const unique={company_id:site.company_id,site_id:site.id,worker_id:workerId,work_date:date};
   // The unique key prevents a second run from creating duplicate reminders.
   const {error:insertError}=await db.from("worker_schedule_reminders")
    .upsert({...unique,user_id:worker.user_id},{onConflict:"company_id,site_id,worker_id,work_date",ignoreDuplicates:true});
   if(insertError)throw insertError;
   const {data:record,error:readError}=await db.from("worker_schedule_reminders")
    .select("id,status,attempts").match(unique).single();
   if(readError)throw readError;
   if(record.status==="sent")continue;
   queued++;
   const {data:subscriptions,error:subError}=await db.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth").eq("user_id",worker.user_id).limit(20);
   if(subError){errors.push(subError.message);failed++;continue;}
   if(!subscriptions?.length){
    noSubscription++;
    await db.from("worker_schedule_reminders").update({status:"no_subscription",attempts:record.attempts+1,last_error:"알림을 허용한 기기가 없습니다.",updated_at:new Date().toISOString()}).eq("id",record.id);
    continue;
   }
   const title="내일 시공 일정 · "+(companies.get(site.company_id)||"협력 업체");
   const payload=JSON.stringify({title,body:`${site.site_name||"현장"} · ${date} 시공 예정입니다. 현장 정보를 확인해주세요.`,
    url:`/worker/site/${site.id}`,tag:`site-reminder-${date}-${site.id}`});
   let success=0;
   const failures=[];
   for(const subscription of subscriptions){
    try{
     await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},payload,{timeout:5000});
     success++;
    }catch(error){
     failures.push(String(error.statusCode||error.message||"push error").slice(0,160));
     if([404,410].includes(error.statusCode))
      await db.from("push_subscriptions").delete().eq("id",subscription.id).eq("user_id",worker.user_id);
    }
   }
   await db.from("worker_schedule_reminders").update({
    status:success?"sent":"failed",attempts:record.attempts+1,
    sent_at:success?new Date().toISOString():null,
    last_error:failures.length?failures.join(", ").slice(0,500):null,
    updated_at:new Date().toISOString()
   }).eq("id",record.id);
   if(success)sent++;else failed++;
  }
  return reply({ok:true,date,assignments:assigned.size,queued,sent,failed,noSubscription,errors:errors.slice(0,5)});
 }catch(error){
  console.error("worker schedule reminder",error);
  return reply({ok:false,date,error:"전날 알림 실행에 실패했습니다.",code:error.code||null},503);
 }
}
