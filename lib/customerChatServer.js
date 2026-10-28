import { normalizeChatPhoto } from './customerChatPhoto.mjs';
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { priceOwner } from './dealerPriceServer';
export const chatFail = (message, status=400) => Object.assign(Error(message),{status});
export const chatReply = (data,status=200) => NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'}});
export function chatError(error) {
  if (['42P01','PGRST205'].includes(error.code)) return chatReply({error:'채팅 준비 중입니다. 잠시 후 다시 이용해주세요.'},503);
  if (error.code === 'P0001') return chatReply({error:'메시지를 너무 빠르게 보냈습니다. 잠시 후 다시 보내주세요.'},429);
  return chatReply({error:error.status ? error.message : '채팅을 처리하지 못했습니다. 다시 시도해주세요.'},error.status || 500);
}
export function chatOrigin(request) {
  if(request.headers.get('origin') !== new URL(request.url).origin) throw chatFail('요청 출처를 확인해주세요.',403);
}
export function chatMessage(body) {
  if(typeof body.text !== 'string' || (!body.text.trim() && !body.photo) || body.text.trim().length>2000) throw chatFail('메시지 또는 사진을 추가해주세요. 글은 2,000자까지 보낼 수 있습니다.');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.messageId || '')) throw chatFail('메시지 번호를 확인해주세요.');
  return body.text.trim();
}
export async function visitorChat(request) {
  const slug=new URL(request.url).searchParams.get('slug') || '';
  if(!/^[a-z0-9-]{1,100}$/.test(slug)) throw chatFail('업체 주소를 확인해주세요.');
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const company=await db.from('companies').select('id,company_name').eq('slug',slug).eq('is_active',true).maybeSingle();
  if(company.error) throw company.error;
  if(!company.data) throw chatFail('이용 가능한 업체가 아닙니다.',404);
  const cookieName='film_chat_'+createHash('sha256').update(slug).digest('hex').slice(0,16);
  const cookies=Object.fromEntries((request.headers.get('cookie')||'').split(';').map(p=>p.trim().split('=')));
  const existing=cookies[cookieName];
  const token=/^[a-f0-9]{64}$/.test(existing||'')?existing:randomBytes(32).toString('hex');
  const hash=createHash('sha256').update(token).digest('hex');
  const thread=await db.from('customer_chat_threads').select('id,customer_name,last_owner_at,visitor_realtime_topic').eq('company_id',company.data.id).eq('visitor_hash',hash).maybeSingle();
  if(thread.error) throw thread.error;
  const {visitor_realtime_topic:realtimeTopic,...safeThread}=thread.data || {};
  return {db,companyId:company.data.id,companyName:company.data.company_name,thread:thread.data?safeThread:null,realtimeTopic:realtimeTopic||null,hash,hasCookie:token===existing,
    reply(data){const response=chatReply(data);response.cookies.set(cookieName,token,{httpOnly:true,secure:new URL(request.url).protocol==='https:',sameSite:'strict',path:'/api/customer-chat',maxAge:60*60*24*180});return response;}};
}
export async function ownerChat(request) {
  const a=await priceOwner(request);
  const id=new URL(request.url).searchParams.get('thread');
  if(!id || !/^[0-9a-f-]{36}$/i.test(id)) throw chatFail('대화를 선택해주세요.');
  const thread=await a.db.from('customer_chat_threads').select('id,customer_name,last_customer_at').eq('id',id).eq('company_id',a.companyId).maybeSingle();
  if(thread.error) throw thread.error;
  if(!thread.data) throw chatFail('대화를 찾을 수 없습니다.',404);
  return {...a,thread:thread.data};
}
export async function chatMessages(db,thread,request) {
  if(!thread) return {messages:[],hasOlder:false};
  let q=db.from('customer_chat_messages').select('id,sender,body,created_at,image_path').eq('thread_id',thread.id);
  const before=new URL(request.url).searchParams.get('before');
  if(before){if(!Number.isFinite(Date.parse(before)))throw chatFail('조회 시점을 확인해주세요.');q=q.lt('created_at',before);}
  const result=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(101);
  if(result.error) throw result.error;
  const messages=await Promise.all((result.data||[]).slice(0,100).reverse().map(async row=>{
    const {image_path,...message}=row;
    if(image_path && image_path.startsWith(thread.id+'/') && !image_path.includes('..')){
      const signed=await db.storage.from('customer-chat').createSignedUrl(image_path,600);
      message.image_url=signed.data?.signedUrl || null;
      message.has_image=true;
    }
    return message;
  }));
  return {messages,hasOlder:result.data.length>100};
}
export async function saveChat(db,thread,sender,body) {
  const text=chatMessage(body);
  const previous=await db.from('customer_chat_messages').select('id,body,sender,image_path').eq('thread_id',thread.id).eq('id',body.messageId).maybeSingle();
  if(previous.error)throw previous.error;
  if(previous.data){if(previous.data.body!==text || previous.data.sender!==sender || Boolean(previous.data.image_path)!==Boolean(body.photo))throw chatFail('메시지 번호가 중복되었습니다.',409);return;}
  let imagePath=null;
  if(body.photo){
    const image=await normalizeChatPhoto(body.photo);
    imagePath=thread.id+'/'+body.messageId+'-'+randomBytes(12).toString('hex')+'.jpg';
    const upload=await db.storage.from('customer-chat').upload(imagePath,image,{contentType:'image/jpeg',upsert:false});
    if(upload.error)throw chatFail('사진을 저장하지 못했습니다. 다시 시도해주세요.',503);
  }
  const row={id:body.messageId,thread_id:thread.id,sender,body:text};
  if(imagePath)row.image_path=imagePath;
  const result=await db.from('customer_chat_messages').insert(row);
  // Only remove this attempt's unique upload on a definite database rejection.
  if(result.error && imagePath && /^[0-9A-Z]{5}$/.test(result.error.code||''))await db.storage.from('customer-chat').remove([imagePath]);
  if(result.error && result.error.code!=='23505')throw result.error;
  if(result.error)throw chatFail('전송 상태를 확인한 후 다시 시도해주세요.',409);
}

export async function readChatBody(request){
  const reader=request.body?.getReader();if(!reader)throw chatFail('메시지를 확인해주세요.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2300000){await reader.cancel();throw chatFail('사진 용량이 너무 큽니다.',413);}chunks.push(value);}
  const raw=Buffer.concat(chunks);
  if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
    const form=await new Response(raw,{headers:{'Content-Type':request.headers.get('content-type')}}).formData();
    const photo=form.get('photo');
    if(!photo || typeof photo.arrayBuffer!=='function')throw chatFail('사진을 선택해주세요.');
    return {text:String(form.get('text')||''),messageId:String(form.get('messageId')||''),name:String(form.get('name')||''),consent:form.get('consent')==='true',photo};
  }
  if(raw.length>12000)throw chatFail('메시지가 너무 깁니다.');
  const body=JSON.parse(raw.toString('utf8'));
  // JSON callers cannot fabricate file attachments or a stored image path.
  delete body.photo;delete body.image_path;
  return body;
}
