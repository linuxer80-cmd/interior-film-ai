import {resolvePortal} from '../../../../lib/customerPortal.mjs';
export async function POST(request){
 try{const {token}=await request.json();const p=await resolvePortal(token);return Response.json(p?{remaining:3-p.used}:{error:'고객 링크가 만료되었습니다.'},{status:p?200:403,headers:{'Cache-Control':'private, no-store'}});}
 catch{return Response.json({error:'체험 횟수를 확인하지 못했습니다.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
