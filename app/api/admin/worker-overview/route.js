import {privateAuth,privateJson} from '../../../../lib/workerPrivate';
import {validDate} from '../../../../lib/consultationFollowUp.mjs';
export async function GET(request) {
  try {
    const auth=await privateAuth(request);if(auth.error)return privateJson({error:auth.error},auth.status);
    const url=new URL(request.url),date=url.searchParams.get('date');
    if(url.searchParams.get('companyId')!==auth.companyId)return privateJson({error:'선택한 업체를 확인해주세요.'},403);
    if(!validDate(date))return privateJson({error:'조회 날짜를 확인해주세요.'},400);
    async function all(table,columns,filter){let rows=[];for(let start=0;start<100000;start+=500){let q=auth.db.from(table).select(columns).eq('company_id',auth.companyId);q=filter(q).range(start,start+499);const {data,error}=await q;if(error)throw error;rows.push(...data);if(data.length<500)return rows;}throw Error('too many');}
    const [workers,relationships,assignments]=await Promise.all([
      all('workers','id,name,is_active',q=>q.order('id')),
      all('worker_relationships','worker_id,relationship_type,ended_at',q=>q.is('ended_at',null).order('worker_id')),
      all('site_daily_assignments','id,worker_id,site_id,role,work_date',q=>q.eq('work_date',date).order('id'))
    ]);
    return privateJson({companyId:auth.companyId,date,workers,relationships,assignments});
  }catch{return privateJson({error:'시공자와 배정을 불러오지 못했습니다.'},500);}
}
