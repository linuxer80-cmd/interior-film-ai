// Call only after the normal team-site and daily-assignment authorization succeeds.
export async function teamInboxSummary(db,{companyId,siteId,date,userId}) {
  const result=await db.from('worker_team_messages').select('id,body,created_at')
    .eq('company_id',companyId).eq('site_id',siteId).eq('work_date',date)
    .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(101);
  if(result.error) throw result.error;
  const all=result.data||[], recent=all.slice(0,100), ids=recent.map(m=>m.id);
  if(!ids.length) return {lastMessage:'',lastAt:'',unreadCount:0,unreadHasOlder:false,readReady:true};
  const reads=await db.from('worker_team_message_reads').select('message_id')
    .eq('user_id',userId).is('read_at',null).in('message_id',ids);
  if(reads.error && !['42P01','PGRST205'].includes(reads.error.code)) throw reads.error;
  return {lastMessage:(recent[0].body||'').slice(0,100),lastAt:recent[0].created_at||'',
    unreadCount:reads.error?null:(reads.data||[]).length,unreadHasOlder:all.length>100,readReady:!reads.error};
}
