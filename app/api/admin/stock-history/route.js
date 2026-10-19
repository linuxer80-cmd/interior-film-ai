import { createClient } from '@supabase/supabase-js';
import { stockHistoryRange, stockHistoryRows } from '../../../../lib/stockHistory.mjs';
export const runtime = 'nodejs';
const json = (body, status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
async function read(query) {const r=await query;if(r.error)throw r.error;return r.data || [];}
export async function GET(request) {
  try {
    const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if(!token)return json({error:'관리자 로그인이 필요합니다.'},401);
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const auth=await db.auth.getUser(token);
    if(auth.error||!auth.data?.user)return json({error:'다시 로그인해주세요.'},401);
    const profile=await read(db.from('profiles').select('company_id,role,is_active').eq('id',auth.data.user.id));
    const p=profile[0];
    if(!p?.company_id||p.role!=='owner'||p.is_active===false)return json({error:'업체 관리자만 조회할 수 있습니다.'},403);
    const co=p.company_id;
    const company=await read(db.from('companies').select('id').eq('id',co).eq('is_active',true));
    if(!company.length)return json({error:'활성 업체를 확인해주세요.'},403);
    const params=new URL(request.url).searchParams;
    let range;
    try{range=stockHistoryRange(params.get('start'),params.get('end'));}catch(e){return json({error:e.message},400);}
    const scoped=(table)=>db.from(table).select('*').eq('company_id',co);
    // Bounded per source. Tell the UI to narrow the dates if any source reaches the limit.
    const dated=(table,column)=>read(scoped(table).gte(column,range.from).lt(column,range.until).order(column,{ascending:false}).limit(500));
    const [events,issues,returns]=await Promise.all([
      dated('film_stock_events','created_at'),dated('site_material_issues','created_at'),dated('site_material_returns','updated_at'),
    ]);
    const ids=(rows,key)=>[...new Set(rows.map(r=>r[key]).filter(Boolean))];
    const materialIds=ids([...issues,...returns],'material_id');
    const rollIds=ids(events,'roll_id'),siteIds=ids([...events,...issues,...returns],'site_id');
    const actorIds=[...new Set([...ids(events,'actor'),...ids(issues,'created_by'),...ids(returns,'updated_by')])];
    async function matching(table,column,values) {
      const result=[];
      // Keep URL size and the Data API's default 1,000-row cap from hiding labels or links.
      for(let i=0;i<values.length;i+=100){
        const chunk=values.slice(i,i+100);
        for(let offset=0;;offset+=1000){
          const rows=await read(scoped(table).in(column,chunk).order('id').range(offset,offset+999));
          result.push(...rows);
          if(rows.length<1000)break;
          if(offset>=19000)throw Error('연결 기록이 너무 많습니다. 조회 기간을 줄여주세요.');
        }
      }
      return result;
    }
    const [rolls,materials,sites,profiles,workers,trips]=await Promise.all([
      matching('film_stock_rolls','id',rollIds),matching('site_materials','id',materialIds),
      matching('sites','id',siteIds),matching('profiles','id',actorIds),matching('workers','user_id',actorIds),
      matching('film_stock_trips','material_id',materialIds),
    ]);
    return json({rows:stockHistoryRows({events,issues,returns,trips,rolls,materials,sites,profiles,workers}),truncated:[events,issues,returns].some(r=>r.length===500)});
  }catch(e){console.error('stock-history',e.code||e.message);return json({error:'입출고 이력을 불러오지 못했습니다. 다시 조회해주세요.'},500);}
}
