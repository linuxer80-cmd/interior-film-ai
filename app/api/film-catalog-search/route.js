import { normalizeFilmBrand } from "../../../lib/filmBrand.mjs";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";

export async function GET(request){
 const q=(new URL(request.url).searchParams.get("q")||"").trim();
 if(q.length<2||q.length>60)return Response.json({products:[]});
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc("search_film_catalog",{p_query:q});
  if(error)throw error;
  const products=data||[];
  return Response.json({products:products.map(p=>({...p,brand:normalizeFilmBrand(p.brand)}))},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("film catalog search",error);return Response.json({error:"제품 검색에 실패했습니다."},{status:500});}
}

