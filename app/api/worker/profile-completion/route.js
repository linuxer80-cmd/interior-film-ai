import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export async function GET(req){
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return Response.json({error:"로그인이 필요합니다."},{status:401});
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await db.auth.getUser(token);
  if(error||!user)return Response.json({error:"로그인이 만료되었습니다."},{status:401});
  const [{data:profile,error:pe},{data:personal,error:pr},{data:workers,error:we}]=await Promise.all([
   db.from("labor_profiles").select("name,daily_wage").eq("user_id",user.id).maybeSingle(),
   db.from("labor_personal_details").select("phone").eq("user_id",user.id).maybeSingle(),
   db.from("workers").select("id,company_id,daily_wage").eq("user_id",user.id).eq("is_active",true)
  ]);
  if(pe||pr||we)throw pe||pr||we;
  const ids=(workers||[]).map(w=>w.id);
  let freelancer=!ids.length;
  if(ids.length){
   const {data:relations,error:re}=await db.from("worker_relationships")
    .select("worker_id,relationship_type").in("worker_id",ids).is("ended_at",null);
   if(re)throw re;
   freelancer=(relations||[]).some(r=>r.relationship_type==="freelancer")||
    !(relations||[]).some(r=>r.relationship_type==="employee");
  }
  const missing=[];
  if(!String(profile?.name||"").trim())missing.push("이름");
  if(!String(personal?.phone||"").trim())missing.push("연락처");
  if(freelancer && !(Number(profile?.daily_wage)>0))missing.push("개인 일당");
  if(!freelancer && (workers||[]).some(w=>!(Number(w.daily_wage)>0)))missing.push("업체 등록 일당");
  return Response.json({complete:missing.length===0,missing},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("worker profile check",e);return Response.json({error:"필수 프로필 확인에 실패했습니다."},{status:503});}
}
