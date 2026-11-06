import { createFcmSender } from './fcmChatPush.mjs';

export function configuredSender(env = process.env, makeSender = createFcmSender) {
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = env;
  let privateKey=env.FIREBASE_PRIVATE_KEY;
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    let credentials;
    try { credentials=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); }
    catch { throw new Error('Invalid Firebase service account configuration'); }
    if (credentials?.type!=='service_account' || credentials.project_id!==projectId || credentials.client_email!==clientEmail || typeof credentials.private_key!=='string')
      throw new Error('Invalid Firebase service account configuration');
    privateKey=credentials.private_key;
  }
  if (!projectId || !clientEmail || !privateKey) return null;
  return makeSender({ projectId, clientEmail, privateKey: privateKey.replaceAll('\\n','\n') });
}

async function one(query) {
  const result=await query.maybeSingle();
  if(result.error) throw result.error;
  return result.data;
}

/** Fail closed on deleted messages, disabled users, removed assignments or inactive companies. */
export async function canReceiveAndroidChat(db, { kind, companyId, targetId, messageId, recipientId, date, senderId }) {
  const blocked=await db.from('account_deletion_blocks').select('user_id').in('user_id', [recipientId,...(senderId ? [senderId] : [])]).limit(1);
  if(blocked.error) throw blocked.error;
  if(!Array.isArray(blocked.data) || blocked.data.length) return false;
  const company=await one(db.from('companies').select('id,is_active').eq('id',companyId));
  if(!company || company.is_active!==true) return false;
  const profile=await one(db.from('profiles').select('id,company_id,role,is_active').eq('id',recipientId));
  if(profile?.is_active===false) return false;
  if(kind==='customer') {
    if(!profile || profile.company_id!==companyId || profile.role!=='owner') return false;
    const thread=await one(db.from('customer_chat_threads').select('id').eq('id',targetId).eq('company_id',companyId));
    if(!thread) return false;
    return Boolean(await one(db.from('customer_chat_messages').select('id').eq('id',messageId).eq('thread_id',targetId).eq('sender','customer')));
  }
  if(kind!=='team' || !date || recipientId===senderId) return false;
  const site=await one(db.from('sites').select('id,status,work_dates').eq('id',targetId).eq('company_id',companyId));
  if(!site) return false;
  const message=await one(db.from('worker_team_messages').select('id').eq('id',messageId).eq('site_id',targetId).eq('company_id',companyId).eq('work_date',date).eq('sender_id',senderId));
  if(!message) return false;
  if(profile?.company_id===companyId && profile.role==='owner') return true;
  if(site.status==='cancelled' || (Array.isArray(site.work_dates) && !site.work_dates.includes(date))) return false;
  const workers=await db.from('workers').select('id').eq('user_id',recipientId).eq('company_id',companyId).eq('is_active',true).limit(100);
  if(workers.error) throw workers.error;
  const ids=(workers.data || []).map(worker=>worker.id);
  if(!ids.length) return false;
  const assigned=await db.from('site_daily_assignments').select('id').eq('company_id',companyId).eq('site_id',targetId).eq('work_date',date).in('worker_id',ids).limit(1);
  if(assigned.error) throw assigned.error;
  return Array.isArray(assigned.data) && assigned.data.length>0;
}

/** Recipients must be derived by the server from an authenticated chat or notification. */
export async function dispatchAndroidChat(db, metadata, { send = configuredSender(), allowed = canReceiveAndroidChat } = {}) {
  const result={sent:0,failed:0,suppressed:0,acceptedUserIds:[]};
  if(!send) return {...result,state:'unconfigured'};
  for(const recipientId of [...new Set(metadata.recipients || [])]) {
    const args={...metadata,recipientId};
    try {
      if(!await allowed(db,args)) { result.suppressed++; continue; }
      const devices=await db.from('android_chat_push_tokens').select('device_id,token').eq('user_id',recipientId).eq('native_chat_ready',true).limit(100);
      if(devices.error) throw devices.error;
      for(const device of devices.data || []) {
        // Recheck after the token lookup, as access and account status can change.
        if(!await allowed(db,args)) { result.suppressed++; continue; }
        const current=await one(db.from('android_chat_push_tokens').select('device_id').eq('device_id',device.device_id).eq('user_id',recipientId).eq('token',device.token).eq('native_chat_ready',true));
        if(!current) { result.suppressed++; continue; }
        const reply=await send({token:device.token,recipientId,companyId:metadata.companyId,kind:metadata.kind,targetId:metadata.targetId,date:metadata.date,messageId:metadata.messageId});
        if(reply.state==='accepted') { result.sent++; if(!result.acceptedUserIds.includes(recipientId)) result.acceptedUserIds.push(recipientId); }
        else if(reply.state==='unregistered') {
          const removed=await db.from('android_chat_push_tokens').delete().eq('device_id',device.device_id).eq('user_id',recipientId).eq('token',device.token);
          if(removed.error) result.failed++;
        } else result.failed++;
      }
    } catch { result.failed++; }
  }
  return {...result,state:'attempted'};
}
