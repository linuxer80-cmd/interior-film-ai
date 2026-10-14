import {supabase} from "../../lib/supabase";
export async function workerProfileRequirements(){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session)return {authenticated:false,missing:[]};
 const response=await fetch("/api/worker/profile-completion",{
  headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"
 });
 if(!response.ok)throw Error("프로필 확인에 실패했습니다.");
 return {authenticated:true,...await response.json()};
}
