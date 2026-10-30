import { createClient } from "@supabase/supabase-js";
import { validateQuote } from "../../../../lib/consultationQuote";
import { completionSeed, normalizeHeader, normalizePendingCompletionItems } from "../../../../lib/completionEstimate.mjs";

export const dynamic = "force-dynamic";
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const categories = new Set(["film", "labor", "expense", "supplies", "meal", "overhead"]);
const fail = (message, status) => Object.assign(new Error(message), { status });
const reply = (data, status=200) => Response.json(data, { status, headers: {"Cache-Control":"private, no-store",Vary:"Authorization"} });
const errorResponse = e => reply({error:e.status ? e.message : "견적서를 처리하지 못했습니다. 잠시 후 다시 시도해주세요."}, e.status || 500);
async function authorize(request) {
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token) throw fail("관리자 로그인이 필요합니다.",401);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error}=await db.auth.getUser(token);
 if(error || !auth?.user) throw fail("다시 로그인해주세요.",401);
 const profile=await db.from("profiles").select("company_id,role,is_active").eq("id",auth.user.id).maybeSingle();
 if(profile.error) throw profile.error;
 if(profile.data?.role!=="owner" || profile.data?.is_active!==true || !profile.data?.company_id) throw fail("관리자 권한이 필요합니다.",403);
 const companyId=profile.data.company_id;
 const company=await db.from("companies").select("company_name,representative_name,phone,is_active").eq("id",companyId).maybeSingle();
 if(company.error) throw company.error;
 if(company.data?.is_active!==true) throw fail("업체 사용 상태를 확인해주세요.",403);
 return {db, companyId, company:company.data, userId:auth.user.id};
}
async function loadQuote(db,companyId,id) {
 if(!uuid.test(id||"")) throw fail("견적서를 확인해주세요.",400);
 const result=await db.from("standalone_quotes").select("*").eq("id",id).eq("company_id",companyId).maybeSingle();
 if(result.error) throw result.error;
 if(!result.data) throw fail("견적서를 찾을 수 없습니다.",404);
 return result.data;
}
function savedCost(doc,version,updatedAt) { return doc ? { ...doc,version,updated_at:updatedAt } : null; }
async function defaultsFor(db,companyId) {
 const x=await db.from("company_estimate_defaults").select("note,bank_account").eq("company_id",companyId).maybeSingle();
 return x.error ? {note:"",bank_account:""} : x.data || {note:"",bank_account:""};
}
export async function GET(request) {
 try {
  const {db,companyId,company}=await authorize(request);
  const url=new URL(request.url),id=url.searchParams.get("id"),type=url.searchParams.get("type");
  if(!id) {
    const result=await db.from("standalone_quotes").select("id,area_document,area_revision,cost_document,cost_revision,linked_site_id,updated_at").eq("company_id",companyId).order("updated_at",{ascending:false}).limit(100);
    if(result.error) throw result.error;
    return reply({quotes:result.data,companyId});
  }
  const q=await loadQuote(db,companyId,id);
  if(type==="area") {
   if(q.area_document) return reply({document:q.area_document,revision:q.area_revision});
   const priorResult=await db.from("site_consultation_quotes").select("document").eq("company_id",companyId).order("updated_at",{ascending:false}).limit(1).maybeSingle();
   if(priorResult.error) throw priorResult.error;
   const prior=priorResult.data?.document||{};
   const defaults=Object.fromEntries(["title","company_name","business_number","company_phone","footer","vat"].filter(key=>typeof prior[key]==="string").map(key=>[key,prior[key]]));
   return reply({document:validateQuote({title:"인테리어필름시공 견적서",company_name:company.company_name||"",vat:"separate",...defaults,items:[]}),revision:q.area_revision});
  }
  if(type==="cost") {
   const defaults=await defaultsFor(db,companyId);
   const automatic=completionSeed({},company,{labor:[],material:[],expense:[]},[]);
   automatic.note=defaults.note;automatic.header.bank_account=defaults.bank_account;automatic.useDefaultNote=true;
   return reply({automatic,defaults,saved:savedCost(q.cost_document,q.cost_revision,q.updated_at),warning:"현장 연결 전 견적서입니다. 자재와 인건비를 직접 입력해주세요."});
  }
  return reply({quote:q});
 } catch(e) {return errorResponse(e);}
}
export async function POST(request) {
 try {
  const {db,companyId,company,userId}=await authorize(request);
  const raw=await request.text();if(raw.length>200000) throw fail("견적서 내용이 너무 깁니다.",413);
  let body;try{body=JSON.parse(raw)}catch{throw fail("입력 형식을 확인해주세요.",400)}
  const url=new URL(request.url),id=url.searchParams.get("id"),type=url.searchParams.get("type");
  if(body.action==="create") {
   const result=await db.from("standalone_quotes").insert({company_id:companyId,created_by:userId}).select("id").single();
   if(result.error) throw result.error;return reply({id:result.data.id});
  }
  const q=await loadQuote(db,companyId,id);
  if(body.action==="link") {
   if(!uuid.test(body.siteId||"")) throw fail("현장을 확인해주세요.",400);
   const result=await db.rpc("link_standalone_quote",{p_quote:id,p_site:body.siteId,p_company:companyId,p_user:userId});
   if(result.error?.code==="23505") throw fail("이미 연결되었거나 해당 현장에 같은 종류의 견적서가 있습니다. 기존 견적서를 확인해주세요.",409);
   if(result.error?.code==="P0002") throw fail("견적서 또는 현장을 찾을 수 없습니다.",404);
   if(result.error?.code==="22023") throw fail("견적서를 저장한 후 연결해주세요.",400);
   if(result.error) throw result.error;return reply({siteId:result.data});
  }
  if(q.linked_site_id) throw fail("현장에 연결된 견적서는 현장에서 수정해주세요.",409);
  if(type==="area") {
   if(!Number.isSafeInteger(body.revision)||body.revision<0) throw fail("저장 버전을 확인해주세요.",400);
   let document;try{document=validateQuote(body.document)}catch(e){throw fail(e.message,400)}
   const result=await db.from("standalone_quotes").update({area_document:document,area_revision:body.revision+1,updated_at:new Date().toISOString()}).eq("id",id).eq("company_id",companyId).eq("area_revision",body.revision).is("linked_site_id",null).select("area_document,area_revision").maybeSingle();
   if(result.error)throw result.error;if(!result.data) throw fail("다른 화면에서 먼저 저장했습니다. 저장본을 다시 불러와주세요.",409);
   return reply({document:result.data.area_document,revision:result.data.area_revision});
  }
  if(type!=="cost") throw fail("견적서 종류를 확인해주세요.",400);
  if(body.action==="saveDefaults") {
   if(typeof body.note!=="string" || body.note.length>3000 || typeof body.bank_account!=="string" || body.bank_account.length>500) throw fail("고정 비고·계좌번호를 확인해주세요.",400);
   const result=await db.from("company_estimate_defaults").upsert({company_id:companyId,note:body.note.trim(),bank_account:body.bank_account.trim(),updated_at:new Date().toISOString()},{onConflict:"company_id"});
   if(result.error)throw result.error;return reply({defaults:{note:body.note.trim(),bank_account:body.bank_account.trim()}});
  }
    if (
      !Number.isSafeInteger(body.version) ||
      body.version < 0 ||
      body.version > 2000000000 ||
      !Array.isArray(body.items) ||
      body.items.length > 300 ||
      typeof body.note !== "string" ||
      body.note.length > 3000
    ) {
      throw fail(
        "견적서 입력값을 확인해주세요. 항목은 최대 300개입니다.",
        400,
      );
    }

    let header;
    try { header = normalizeHeader(body.header); } catch (error) { throw fail(error.message, 400); }
    const vat = body.vat || "none";
    if (!["none", "included", "separate"].includes(vat)) throw fail("부가세 구분을 확인해주세요.", 400);
    const items = body.items.map((item) => {
      if (
        !item ||
        !categories.has(item.category) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 500 ||
        typeof item.unit !== "string" ||
        item.unit.length > 20 ||
        typeof item.quantity !== "number" ||
        !Number.isFinite(item.quantity) ||
        item.quantity < 0 ||
        item.quantity > 1000000 ||
        !Number.isSafeInteger(item.amount) ||
        item.amount < 0 ||
        item.amount > 1000000000
      ) {
        throw fail(
          "항목명·수량·금액을 확인해주세요. 금액은 0 이상의 정수입니다.",
          400,
        );
      }

      const unitPrice = item.unit_price == null || item.unit_price === "" ? null : Number(item.unit_price);
      if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000000 || Math.round(unitPrice * item.quantity) !== item.amount)) throw fail("수량 × 단가와 금액을 확인해주세요.", 400);
      return {
        unit_price: unitPrice,
        category: item.category,
        name: item.name.trim(),
        quantity: item.quantity,
        unit: item.unit.trim(),
        amount: item.amount,
      };
    });

    let pendingItems=[];
    if(body.pending_items !== undefined){try{pendingItems=normalizePendingCompletionItems(body.pending_items);}catch(error){throw fail(error.message,400);}}
    if(items.length+pendingItems.length>300)throw fail("견적 항목은 최대 300개입니다.",400);
    const document={pending_items:pendingItems,header,vat,useDefaultNote:body.useDefaultNote===true,items,note:body.note.trim()};
    const result=await db.from("standalone_quotes").update({cost_document:document,cost_revision:body.version+1,updated_at:new Date().toISOString()}).eq("id",id).eq("company_id",companyId).eq("cost_revision",body.version).is("linked_site_id",null).select("cost_document,cost_revision,updated_at").maybeSingle();
    if(result.error)throw result.error;if(!result.data)throw fail("다른 화면에서 먼저 저장했습니다. 저장본을 다시 불러와주세요.",409);
    return reply({saved:savedCost(result.data.cost_document,result.data.cost_revision,result.data.updated_at)});
 } catch(e) {return errorResponse(e);}
}
