import { priceOwner } from '../../../../lib/dealerPriceServer';
import { readChatBody,ownerChat,chatMessages,saveChat,chatOrigin,chatError,chatReply,chatFail } from '../../../../lib/customerChatServer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){try{
  const url=new URL(request.url);
  if(url.searchParams.has('thread')){const a=await ownerChat(request);return chatReply({companyId:a.companyId,thread:a.thread,...await chatMessages(a.db,a.thread,request)});}
  const a=await priceOwner(request);
  const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
  const result=await a.db.from('customer_chat_threads').select('id,customer_name,updated_at,last_preview,last_customer_at,last_owner_at,owner_read_at').eq('company_id',a.companyId).order('updated_at',{ascending:false}).order('id').range(offset,offset+50);
  if(result.error)throw result.error;
  return chatReply({companyId:a.companyId,userId:a.userId,threads:result.data.slice(0,50),hasMore:result.data.length>50});
}catch(error){return chatError(error);}}
export async function POST(request){try{
  chatOrigin(request);const a=await ownerChat(request);
  const body=await readChatBody(request);
  if(body.action==='read'){
    // Acknowledge only the snapshot actually displayed; later arrivals remain unread.
    if(body.seenAt && (!Number.isFinite(Date.parse(body.seenAt)) || body.seenAt>a.thread.last_customer_at))throw chatFail('읽음 시점을 확인해주세요.');
    if(body.seenAt){const r=await a.db.from('customer_chat_threads').update({owner_read_at:body.seenAt}).eq('id',a.thread.id).eq('company_id',a.companyId);if(r.error)throw r.error;}
  }else await saveChat(a.db,a.thread,'owner',body);
  return chatReply({success:true});
}catch(error){return chatError(error);}}
