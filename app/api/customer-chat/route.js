import { readChatBody,visitorChat,chatMessages,saveChat,chatOrigin,chatError,chatFail,chatMessage } from '../../../lib/customerChatServer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){try{const a=await visitorChat(request);return a.reply({thread:a.thread,companyName:a.companyName,...await chatMessages(a.db,a.thread,request)});}catch(error){return chatError(error);}}
export async function POST(request){try{
  chatOrigin(request);
  const body=await readChatBody(request);chatMessage(body);
  const a=await visitorChat(request);
  if(!a.hasCookie)throw chatFail('채팅을 다시 열어주세요. 브라우저 쿠키 허용이 필요합니다.');
  let thread=a.thread;
  if(!thread){
    if(body.consent!==true)throw chatFail('채팅 안내에 동의해주세요.');
    if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>60)throw chatFail('이름 또는 별명을 입력해주세요.');
    const count=await a.db.from('customer_chat_threads').select('id',{count:'exact',head:true}).eq('company_id',a.companyId).gte('created_at',new Date(Date.now()-86400000).toISOString());
    if(count.error)throw count.error;if(count.count>=100)throw chatFail('오늘 새 문의가 많습니다. 업체에 전화로 문의해주세요.',429);
    const result=await a.db.from('customer_chat_threads').upsert({company_id:a.companyId,visitor_hash:a.hash,customer_name:body.name.trim()},{onConflict:'company_id,visitor_hash',ignoreDuplicates:true});
    if(result.error)throw result.error;
    const found=await a.db.from('customer_chat_threads').select('id,customer_name').eq('company_id',a.companyId).eq('visitor_hash',a.hash).single();if(found.error)throw found.error;thread=found.data;
  }
  await saveChat(a.db,thread,'customer',body);
  return a.reply({success:true,thread});
}catch(error){return chatError(error);}}
