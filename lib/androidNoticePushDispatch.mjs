import { configuredSender } from './androidChatPushDispatch.mjs';

// Callers supply a fresh server-side authorization check for each recipient.
export async function dispatchAndroidNotice(db, {noticeId, title, body, recipients}, {send, allowed} = {}) {
  const result={sent:0,failed:0,acceptedUserIds:[]};
  try { if(send===undefined) send=configuredSender(); } catch { return {...result,failed:1,state:'unconfigured'}; }
  if(!send || typeof allowed!=='function') return {...result,state:'unconfigured'};
  for(const recipientId of [...new Set(recipients || [])]) {
    try {
      if(!await allowed(recipientId)) continue;
      const blocked=await db.from('account_deletion_blocks').select('user_id').eq('user_id',recipientId).maybeSingle();
      if(blocked.error || blocked.data) continue;
      const devices=await db.from('android_chat_push_tokens').select('device_id,token').eq('user_id',recipientId).eq('native_general_ready',true).limit(100);
      if(devices.error) throw devices.error;
      for(const device of devices.data || []) {
        if(!await allowed(recipientId)) continue;
        const current=await db.from('android_chat_push_tokens').select('device_id').eq('device_id',device.device_id)
          .eq('user_id',recipientId).eq('token',device.token).eq('native_general_ready',true).maybeSingle();
        if(current.error) throw current.error;
        if(!current.data) continue;
        const response=await send({kind:'notice',token:device.token,recipientId,noticeId,title,body});
        if(response.state==='accepted') {result.sent++;if(!result.acceptedUserIds.includes(recipientId))result.acceptedUserIds.push(recipientId);}
        else if(response.state==='unregistered') {
          const removed=await db.from('android_chat_push_tokens').delete().eq('device_id',device.device_id).eq('user_id',recipientId).eq('token',device.token);
          if(removed.error) result.failed++;
        } else result.failed++;
      }
    } catch {result.failed++;}
  }
  return {...result,state:'attempted'};
}

// Each row is scoped to its actual recipient; callers revalidate policy separately.
export function noticeRowAllowed(db, table, id) {
  if(!['labor_notifications','material_pilot_notifications','worker_schedule_reminders'].includes(table)) throw Error('Invalid notice source');
  return async userId => {
    const result=await db.from(table).select('id').eq('id',id).eq('user_id',userId).maybeSingle();
    if(result.error) throw result.error;
    return Boolean(result.data);
  };
}
