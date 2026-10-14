import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";

export async function GET(request){
 const q=(new URL(request.url).searchParams.get("q")||"").trim();
 if(q.length<2||q.length>60)return Response.json({products:[]});
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const normalized=/^[GF][A-Z]/i.test(q)?q.slice(1):q;
  // Escape LIKE wildcard characters supplied by the user.
  const literal=normalized.replace(/[\\%_]/g,c=>"\\"+c);
  const {data,error}=await db.from("film_products")
   .select("id,brand,product_code,product_name,sample_image_path")
   .eq("is_active",true).ilike("product_code","%"+literal+"%")
   .order("product_code").limit(100);
  if(error)throw error;
  const key=normalized.toUpperCase();
  const score=p=>{
   const code=String(p.product_code||"").toUpperCase();
   if(code===key)return 0;
   if(code.endsWith(key))return 1;
   if(code.startsWith(key))return 2;
   return 3;
  };
  const products=(data||[]).sort((a,b)=>score(a)-score(b)||
   String(a.product_code).localeCompare(String(b.product_code),"ko"));
  return Response.json({products},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("film catalog search",error);return Response.json({error:"제품 검색에 실패했습니다."},{status:500});}
}
