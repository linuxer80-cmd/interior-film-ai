import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
async function auth(req){
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return {error:"로그인이 필요합니다.",status:401};
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);
 if(error||!data?.user)return {error:"인증이 만료되었습니다.",status:401};
 return {db,user:data.user};
}
export async function GET(req){
 try{
  const ctx=await auth(req);if(ctx.error)return json({error:ctx.error},ctx.status);
  const {db,user}=ctx;
  const {data:workers,error:we}=await db.from("workers").select("id,company_id").eq("user_id",user.id).eq("is_active",true);
  if(we)throw we;
  const ids=(workers||[]).map(w=>w.id);
  if(!ids.length)return json({agreements:[]});
  const {data,error}=await db.from("worker_wage_agreements").select("id,company_id,site_id,worker_id,work_date,proposed_wage,status,created_at")
   .in("worker_id",ids).order("created_at",{ascending:false}).limit(100);
  if(error)throw error;
  return json({agreements:data||[]});
 }catch(e){console.error("wage agreements GET",e);return json({error:"일당 합의 내역을 불러오지 못했습니다."},500);}
}
export async function POST(req){
 try{
  const ctx=await auth(req);if(ctx.error)return json({error:ctx.error},ctx.status);
  const {db,user}=ctx;const body=await req.json();
  if(body.action==="respond"){
   if(!/^[0-9a-f-]{36}$/i.test(body.agreementId||"")||typeof body.accept!=="boolean")return json({error:"요청 형식을 확인해주세요."},400);
   const {data,error}=await db.rpc("respond_worker_wage_agreement",{p_agreement:body.agreementId,p_user:user.id,p_accept:body.accept});
   if(error)return json({error:error.code==="P0001"?error.message:"합의 처리에 실패했습니다."},409);
   return json(data);
  }
  if(body.action!=="propose")return json({error:"지원하지 않는 요청입니다."},400);
  const {data:profile,error:pe}=await db.from("profiles").select("company_id,role,is_active").eq("id",user.id).single();
  if(pe||profile?.role!=="owner"||profile.is_active!==true)return json({error:"관리자 권한이 필요합니다."},403);
  const {siteId,workerId,workDate}=body;
  const wage=Number(body.wage);
  if(!/^[0-9a-f-]{36}$/i.test(siteId||"")||!/^[0-9a-f-]{36}$/i.test(workerId||"")||
   !/^\d{4}-\d{2}-\d{2}$/.test(workDate||"")||!Number.isSafeInteger(wage)||wage<=0||wage>100000000)
   return json({error:"현장, 날짜, 시공자, 일당을 확인해주세요."},400);
  const companyId=profile.company_id;
  const [{data:assigned,error:ae},{data:relation,error:re},{data:confirmed,error:ce}]=await Promise.all([
   db.from("site_daily_assignments").select("id").eq("company_id",companyId).eq("site_id",siteId).eq("worker_id",workerId).eq("work_date",workDate).maybeSingle(),
   db.from("worker_relationships").select("relationship_type").eq("company_id",companyId).eq("worker_id",workerId).is("ended_at",null).maybeSingle(),
   db.from("worker_assignment_wages").select("daily_wage").eq("company_id",companyId).eq("site_id",siteId).eq("worker_id",workerId).eq("work_date",workDate).maybeSingle()
  ]);
  if(ae||re||ce)throw ae||re||ce;
  if(!assigned||relation?.relationship_type!=="freelancer")return json({error:"배정된 협력 프리랜서만 합의할 수 있습니다."},409);
  if(confirmed)return json({error:"이미 확정된 일당입니다."},409);
  const {data:previous,error:prevError}=await db.from("worker_wage_agreements").select("id,status")
   .eq("company_id",companyId).eq("site_id",siteId).eq("worker_id",workerId).eq("work_date",workDate).maybeSingle();
  if(prevError)throw prevError;
  if(previous?.status==="accepted")return json({error:"이미 승인된 합의입니다."},409);
  const record={company_id:companyId,site_id:siteId,worker_id:workerId,work_date:workDate,proposed_wage:wage,status:"proposed",proposed_by:user.id,responded_at:null,updated_at:new Date().toISOString()};
  const result=previous?await db.from("worker_wage_agreements").update(record).eq("id",previous.id).neq("status","accepted").select("id").single()
   :await db.from("worker_wage_agreements").insert(record).select("id").single();
  if(result.error)throw result.error;
  return json({ok:true,id:result.data.id});
 }catch(e){console.error("wage agreements POST",e);return json({error:"일당 합의 요청을 처리하지 못했습니다."},500);}
}
