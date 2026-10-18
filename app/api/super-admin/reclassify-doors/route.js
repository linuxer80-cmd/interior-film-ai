import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeProfile, profilePrompt, profileSchema } from "../../../../lib/caseClassification.mjs";
import { registeredStoragePath } from "../../../../lib/visualCaseSearch";
export const runtime = "nodejs";
export const maxDuration = 60;
const door = /방문|문짝|문틀|중문|방화문|현관문|도어|door/i;
export async function POST(request) {
  try {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer /i, "");
    if (!token) return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
    const userDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
    const {data:user,error:authError}=await userDb.auth.getUser();
    if(authError || !user.user) return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
    const {data:status,error:statusError}=await userDb.rpc("get_super_admin_status");
    if(statusError || !(Array.isArray(status)?status[0]:status)?.is_super_admin) return NextResponse.json({error:"슈퍼관리자만 이용할 수 있습니다."},{status:403});
    const body=await request.json();
    if(!/^[0-9a-f-]{36}$/i.test(body.company_id||"")) return NextResponse.json({error:"업체를 선택해주세요."},{status:400});
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
    if(!body.work_id) {
      const {data,error}=await db.from("work_items").select("id,category,sub_category,case_profile").eq("company_id",body.company_id).order("id").limit(10001);
      if(error) throw error;
      if(data.length>10000) throw Error("사례가 너무 많습니다. 대상 범위를 나눠주세요.");
      return NextResponse.json({items:data.filter(w=>door.test([w.category,w.sub_category].join(" ")) || w.category==="문")});
    }
    const {data:work,error:workError}=await db.from("work_items").select("id,category,sub_category,case_profile").eq("company_id",body.company_id).eq("id",body.work_id).single();
    if(workError) throw workError;
    if(!door.test([work.category,work.sub_category].join(" ")) && work.category!=="문") throw Error("문 사례만 분석할 수 있습니다.");
    const {data:photos,error}=await db.from("work_photos").select("id,photo_type,storage_path,photo_url").eq("company_id",body.company_id).eq("work_item_id",work.id).order("created_at").limit(100);
    if(error) throw error;
    const selected=[...photos].sort((a,b)=>Number(b.photo_type==="before")-Number(a.photo_type==="before")).slice(0,3);
    if(!selected.length) throw Error("등록된 사진이 없습니다.");
    const content=[{type:"input_text",text:profilePrompt+JSON.stringify({registered_category:work.category,registered_sub_category:work.sub_category})+" 등록된 방문/방화문 종류를 참고하되 사진과 충돌하면 확인 필요로 남긴다. 기존 사례의 같은 대상 사진들이다. 사진이 서로 다른 대상이면 확실한 공통 정보만 기록한다. 시공 후 사진으로 원래 손상을 추정하지 말고 확인 필요로 둔다. 실제 금액의 시공 범위는 사진으로 단정하지 않는다."}];
    for(const photo of selected){
      const path=registeredStoragePath(photo.storage_path||photo.photo_url,process.env.NEXT_PUBLIC_SUPABASE_URL);
      if(!path) throw Error("사진 경로를 확인해주세요.");
      const {data:signed,error:signError}=await db.storage.from("work-photos").createSignedUrl(path,300);
      if(signError) throw signError;
      content.push({type:"input_text",text:`사진 종류: ${photo.photo_type}`},{type:"input_image",image_url:signed.signedUrl});
    }
    if(!process.env.OPENAI_API_KEY) return NextResponse.json({error:"서버에 OPENAI_API_KEY가 설정되지 않았습니다.",stopBatch:true},{status:503});
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:"gpt-5.6-luna",input:[{role:"user",content}],text:{format:{type:"json_schema",name:"door_profile",strict:true,schema:profileSchema}}})});
    const result=await response.json();
    if(!response.ok) {
      const code=String(result.error?.code||result.error?.type||"unknown");
      const exhausted=["insufficient_quota","credit_balance_exhausted","billing_hard_limit_reached"].includes(code);
      const stopBatch=code==="AI_QUOTA_UNAVAILABLE" || exhausted || [401,403,429].includes(response.status) || code==="model_not_found";
      const reason=code==="AI_QUOTA_UNAVAILABLE"?"AI 사용량 확인에 실패했습니다. 서버의 사용량 설정을 확인해주세요.":exhausted?"AI 크레딧 또는 결제 한도가 부족합니다.":response.status===401?"AI API 키 인증에 실패했습니다.":code==="model_not_found"?"설정된 AI 모델을 사용할 수 없습니다.":response.status===429?"AI 요청 한도에 도달했습니다. 잠시 후 실패 건만 재시도해주세요.":code.includes("image")?"사진을 AI가 읽지 못했습니다. 사진 경로와 파일을 확인해주세요.":"AI 요청이 거절되었습니다.";
      console.error("Door reclassification provider error",{status:response.status,code});
      return NextResponse.json({error:`${reason} (HTTP ${response.status}, ${code.replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80)})`,stopBatch},{status:502});
    }
    const output=result.output?.flatMap(item=>item.content||[]).filter(item=>item.type==="output_text").map(item=>item.text).join("");
    if(!output) throw Error("AI 분석 결과가 없습니다.");
    // Return a reviewable draft only. The user applies SQL after checking it.
    return NextResponse.json({profile:normalizeProfile(JSON.parse(output)),photoCount:selected.length});
  }catch(error){return NextResponse.json({error:error.message||"재분석 실패"},{status:500});}
}
