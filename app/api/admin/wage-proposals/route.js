import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export async function GET(req){
 try{
  const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return Response.json({error:"로그인이 필요합니다."},{status:401});
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:ae}=await db.auth.getUser(token);
  if(ae||!auth?.user)return Response.json({error:"인증이 만료되었습니다."},{status:401});
  const {data:profile,error:pe}=await db.from("profiles").select("company_id,role,is_active").eq("id",auth.user.id).single();
  if(pe||profile?.role!=="owner"||profile.is_active!==true)return Response.json({error:"관리자 권한이 필요합니다."},{status:403});
  const companyId=profile.company_id;
  const {data:pending,error}=await db.from("worker_assignment_wage_pending")
   .select("site_id,worker_id,work_date,status").eq("company_id",companyId).eq("status","pending").order("work_date").limit(300);
  if(error)throw error;
  const siteIds=[...new Set((pending||[]).map(p=>p.site_id))];
  const workerIds=[...new Set((pending||[]).map(p=>p.worker_id))];
  if(!pending?.length)return Response.json({items:[]});
  const [{data:sites,error:se},{data:workers,error:we},{data:assignments,error:de}]=await Promise.all([
   db.from("sites").select("id,site_name").eq("company_id",companyId).in("id",siteIds),
   db.from("workers").select("id,name").eq("company_id",companyId).in("id",workerIds),
   db.from("site_daily_assignments").select("site_id,worker_id,work_date").eq("company_id",companyId).in("site_id",siteIds)
  ]);
  if(se||we||de)throw se||we||de;
  const active=new Set((assignments||[]).map(a=>a.site_id+":"+a.worker_id+":"+a.work_date));
  const items=pending.filter(p=>active.has(p.site_id+":"+p.worker_id+":"+p.work_date)).map(p=>({
   ...p,site_name:sites.find(s=>s.id===p.site_id)?.site_name||"현장",
   worker_name:workers.find(w=>w.id===p.worker_id)?.name||"시공자"
  }));
  return Response.json({items},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("pending wages",e);return Response.json({error:"미확정 일당을 불러오지 못했습니다."},{status:500});}
}
