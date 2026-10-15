import { createClient } from '@supabase/supabase-js';
import {
  koreaDay, reminderWindow, finalWorkDay, reminderRows,
  currentReportReminder, reportReminderNotice, queueReportReminder,
} from '../../../../lib/workReportReminders.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(request) {
  if(!process.env.CRON_SECRET || request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)
    return reply({error:'Unauthorized'},401);
  const now=new Date();
  const date=koreaDay(now);
  if(!reminderWindow(now)) return reply({ok:true,date,queued:0,skipped:'before_18_kst'});
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return reply({error:'서버 설정을 확인해주세요.'},503);
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false}});
  let queued=0,duplicates=0,noLeader=0,failed=0;
  try {
    const sites=await reminderRows(db.from('sites')
      .select('id,company_id,status,work_dates,schedule_start,schedule_end,schedule_date')
      .in('status',['scheduled','in_progress','completed']).order('id'));
    // Explicit calendars can be narrowed without reading every site's assignments.
    const candidates=sites.filter(site=>!Array.isArray(site.work_dates) || finalWorkDay(site)===date);
    for(let i=0;i<candidates.length;i+=10) {
      await Promise.all(candidates.slice(i,i+10).map(async candidate=>{
        try {
          // Reload current assignment/report just before enqueueing (not the first/earlier leader).
          const {site,leaders}=await currentReportReminder(db,candidate.id,date);
          if(!leaders.length) {noLeader++;return;}
          for(const leader of leaders) {
            if(await queueReportReminder(db,reportReminderNotice(site,leader,date))) queued++;
            else duplicates++;
          }
        } catch(error) {
          failed++;
          console.error('report reminder queue',candidate.id,error.code || error.message);
        }
      }));
    }
    return reply({ok:failed===0,date,queued,duplicates,skipped:noLeader,failed},failed?503:200);
  } catch(error) {
    console.error('report reminders',error.code || error.message);
    return reply({ok:false,date,error:'완료보고 알림 생성에 실패했습니다.'},503);
  }
}
