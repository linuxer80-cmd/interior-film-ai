import {supabase} from "../../lib/supabase";

// Check on every new login/app launch; do not rely on cached completion flags.
// Employees use company wages; freelancers must register their own daily wage.
export async function workerProfileRequirements(){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session)return {authenticated:false,missing:[]};
 const headers={Authorization:"Bearer "+session.access_token,"X-Labor-View":"worker"};
 const response=await fetch("/api/labor-market?mode=me",{headers,cache:"no-store"});
 if(!response.ok)throw Error("프로필 확인에 실패했습니다.");
 const data=await response.json();
 const p=data.profile||{},personal=data.personal||{};
 const missing=[];
 if(!String(p.name||data.defaults?.name||"").trim())missing.push("이름");
 if(!String(personal.phone||"").trim())missing.push("연락처");
 const {data:workers,error:we}=await supabase.from("workers").select("id,company_id")
  .eq("user_id",session.user.id).eq("is_active",true);
 if(we)throw we;
 let freelancer=false;
 const ids=(workers||[]).map(w=>w.id);
 if(ids.length){
  const {data:relations,error:re}=await supabase.from("worker_relationships")
   .select("worker_id,relationship_type").in("worker_id",ids).is("ended_at",null);
  if(re)throw re;
  freelancer=(relations||[]).some(r=>r.relationship_type==="freelancer");
 }
 // Accounts without an employee relationship must be ready for freelance work.
 const {data:relations,error:re}=ids.length?{data:null,error:null}:
  {data:null,error:null};
 if(freelancer && !(Number(p.daily_wage)>0))missing.push("개인 일당");
 return {authenticated:true,missing,freelancer};
}
