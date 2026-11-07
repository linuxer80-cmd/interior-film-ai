const clean=(value,max)=>typeof value==='string'?value.replace(/[\r\n\t]+/g,' ').trim().slice(0,max):'';
async function one(query){const r=await query.maybeSingle();if(r.error)throw r.error;return r.data;}
// Called only after recipient authorization, never from caller-provided display text.
export async function androidChatPreview(db,m) {
  if(m.kind==='customer') {
    const thread=await one(db.from('customer_chat_threads').select('customer_name').eq('id',m.targetId).eq('company_id',m.companyId));
    const message=await one(db.from('customer_chat_messages').select('body,image_path').eq('id',m.messageId).eq('thread_id',m.targetId).eq('sender','customer'));
    if(!thread||!message)return {};
    return {title:'고객 메시지 · '+(clean(thread.customer_name,70)||'고객'),body:clean(message.body,200)||(message.image_path?'사진을 보냈습니다.':'새 메시지가 있습니다.')};
  }
  const site=await one(db.from('sites').select('site_name').eq('id',m.targetId).eq('company_id',m.companyId));
  const message=await one(db.from('worker_team_messages').select('body').eq('id',m.messageId).eq('site_id',m.targetId).eq('company_id',m.companyId).eq('work_date',m.date).eq('sender_id',m.senderId));
  const sender=await one(db.from('profiles').select('name').eq('id',m.senderId));
  if(!site||!message)return {};
  return {title:'팀 채팅 · '+(clean(site.site_name,70)||'현장'),body:(clean(sender?.name,40)||'팀원')+': '+(clean(message.body,200)||'사진을 보냈습니다.')};
}
