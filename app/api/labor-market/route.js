import {directoryBadges,companyJobBadges} from '../../../lib/publicAchievementBadge';
import {canReceiveRecruitment,scopeLaborNotifications} from '../../../lib/laborNotificationPolicy.mjs';
import { attachAssignmentState } from '../../../lib/laborContracts.mjs';
import { dispatchLaborNotifications } from '../../../lib/laborPush';
import { privateAuth, privateJson as json, cleanPrivate, uuid } from '../../../lib/workerPrivate';
import { publicProfileFields, dayInKorea, fail, cleanProfile, cleanJob, nextApplication, roughRegion } from '../../../lib/laborMarket.mjs';
export const runtime = 'nodejs';

async function auth(request) {
  const result = await privateAuth(request, false);
  if (result.error) throw fail(result.error,result.status);
  if (result.user.is_anonymous || !result.user.email_confirmed_at) {
    throw fail('이메일 인증을 완료해주세요.',403);
  }

  const profile = await result.db.from('profiles')
    .select('company_id,role,is_active')
    .eq('id',result.user.id)
    .maybeSingle();

  if (profile.error) throw profile.error;
  if (profile.data?.is_active === false) {
    throw fail('사용이 중지된 계정입니다.',403);
  }

  let companyId = null;

  if (profile.data?.role === 'owner' && profile.data.company_id) {
    const company = await result.db.from('companies')
      .select('id,is_active')
      .eq('id',profile.data.company_id)
      .maybeSingle();

    if (company.error) throw company.error;
    if (company.data && company.data.is_active !== false) {
      companyId = company.data.id;
    }
  }

  const ownerCompanyId=companyId;

  if(request.headers.get('x-labor-view')==='worker') {
    companyId=null;
  }

  return {...result,companyId,ownerCompanyId};
}

const value = result => {
  if (result.error) throw result.error;
  return result.data;
};

async function photos(db, rows) {
  return Promise.all(rows.map(async row => {
    const copy = {...row};
    delete copy.photo_path;

    if (row.photo_path) {
      const signed = await db.storage.from('labor-avatars')
        .createSignedUrl(row.photo_path,300);

      copy.photo_url = signed.error ? '' : signed.data.signedUrl;
    }

    return copy;
  }));
}

function errorResponse(error) {
  console.error('구인·구직 오류:',error.code || error.message);

  return json({
    error:error.status
      ?error.message
      :['42P01','PGRST205','PGRST202'].includes(error.code)
        ?'구인·구직 SQL을 먼저 실행해주세요.'
        :'처리하지 못했습니다. 잠시 후 다시 확인해주세요.'
  },error.status || 503);
}

function validWorkDay(day) {
  if(typeof day!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return false;
  }

  const date=new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0,10)===day;
}

function siteWorkDays(site) {
  if(Array.isArray(site.work_dates)) {
    return [...new Set(site.work_dates.filter(validWorkDay))].sort();
  }

  const start=site.schedule_start?.slice(0,10);
  const end=site.schedule_end?.slice(0,10);

  if(!validWorkDay(start)||!validWorkDay(end)||end<start)return [];

  const days=[];

  for(
    let date=new Date(`${start}T00:00:00Z`);
    date.toISOString().slice(0,10)<=end;
    date.setUTCDate(date.getUTCDate()+1)
  ) {
    days.push(date.toISOString().slice(0,10));
    if(days.length>366) {
      throw fail('현장 일정을 여러 날짜 선택으로 등록해주세요.');
    }
  }

  return days;
}

export async function GET(request) {
  try {
    const {db,user,companyId,ownerCompanyId} = await auth(request);
    const params = new URL(request.url).searchParams;

    if (params.get('mode') === 'sites') {
      if(!companyId)throw fail('관리자 권한이 필요합니다.',403);

      const rows=value(await db.from('sites')
        .select('id,site_name,region,address,work_type,work_description,work_dates,schedule_start,schedule_end,status')
        .eq('company_id',companyId)
        .order('created_at',{ascending:false})
      );

      return json({
        sites:rows
          .filter(s=>!['cancelled','completed'].includes(s.status))
          .map(s=>({
            id:s.id,
            site_name:s.site_name,
            status:s.status,
            region:s.region||roughRegion(s.address),
            work_content:[s.work_type,s.work_description]
              .filter(Boolean).join('\n'),
            work_dates:siteWorkDays(s).filter(d=>d>=dayInKorea())
          }))
          .filter(s=>s.work_dates.length)
      });
    }

    if (params.get('mode') === 'site') {
      if(!companyId) throw fail('관리자 권한이 필요합니다.',403);

      const siteId=params.get('site');
      if(!uuid(siteId))throw fail('현장을 확인해주세요.');

      const site=value(await db.from('sites')
        .select('id,region,address,work_type,work_description,work_dates,schedule_start,schedule_end,status')
        .eq('id',siteId)
        .eq('company_id',companyId)
        .maybeSingle()
      );

      if(!site) {
        throw fail('본인 업체의 현장만 구인할 수 있습니다.',403);
      }

      if(['cancelled','completed'].includes(site.status)) {
        throw fail('진행할 현장을 선택해주세요.');
      }

      const dates=siteWorkDays(site).filter(d=>d>=dayInKorea());

      return json({
        site:{
          id:site.id,
          region:site.region || roughRegion(site.address),
          work_content:[site.work_type,site.work_description]
            .filter(Boolean).join('\n'),
          work_dates:dates,
          work_date:dates[0] || site.schedule_start?.slice(0,10),
          end_date:dates.at(-1) || site.schedule_end?.slice(0,10)
        }
      });
    }

    if(params.get('mode')==='avatar') {
      const profile=value(await db.from('labor_profiles')
        .select('photo_path').eq('user_id',user.id).maybeSingle());
      const photo=profile ? (await photos(db,[profile]))[0] : null;
      return json({photo_url:photo?.photo_url || ''});
    }

    if(params.get('mode')==='notifications') {
      const recruiting=await canReceiveRecruitment(db,user.id);
      const fields='id,title,message,link,read_at,created_at';
      let noticeQuery=scopeLaborNotifications(db.from('labor_notifications')
        .select(companyId ? fields+',labor_jobs!inner(company_id)' : fields),!companyId);
      // Scope before LIMIT: unrelated notices must not crowd out company notices.
      if(companyId) noticeQuery=noticeQuery.eq('labor_jobs.company_id',companyId);
      if(!recruiting) noticeQuery=noticeQuery.neq('title','구인 제안');
      const notices=value(await noticeQuery
        .eq('user_id',user.id)
        .order('created_at',{ascending:false})
        .limit(50)
      );

      return json({notifications:notices.map(({labor_jobs,...notice})=>notice)});
    }

    if (params.get('mode') === 'me') {
      const profile = value(await db.from('labor_profiles')
        .select(publicProfileFields)
        .eq('user_id',user.id)
        .maybeSingle()
      );

      let personal = value(await db.from('labor_personal_details')
        .select('phone,bank_name,account_number,account_holder,departure_address')
        .eq('user_id',user.id)
        .maybeSingle()
      );

      let defaults = null;

      if(!profile || !personal) {
        const linked=value(await db.from('workers')
          .select('id,company_id,name,phone')
          .eq('user_id',user.id)
          .eq('is_active',true)
          .limit(1)
          .maybeSingle()
        );

        if(linked) {
          defaults={name:linked.name || ''};

          if(!personal) {
            personal={
              phone:linked.phone || '',
              ...value(await db.from('worker_private_details')
                .select('bank_name,account_number,account_holder,departure_address')
                .eq('worker_id',linked.id)
                .eq('company_id',linked.company_id)
                .maybeSingle()
              )
            };
          }
        }
      }

      return json({
        profile:profile ? (await photos(db,[profile]))[0] : null,
        defaults,
        personal,
        manager:Boolean(companyId)
      });
    }

    value(await db.rpc('expire_labor_jobs'));

    try {
      await dispatchLaborNotifications(db);
    }catch {
      // 푸시가 실패해도 저장된 앱 알림은 확인할 수 있습니다.
    }

    const ownProfile = value(await db.from('labor_profiles')
      .select(publicProfileFields)
      .eq('user_id',user.id)
      .maybeSingle()
    );

    const page = Math.max(
      0,
      Math.min(1000,Number.parseInt(params.get('page') || '0',10) || 0)
    );

    const capability=await db.rpc('labor_proposal_capabilities');
    if(capability.error && !['PGRST202','42883'].includes(capability.error.code))throw capability.error;
    const proposalsEnabled=!capability.error && capability.data?.version===1;
    let jobsQuery = db.from('labor_jobs')
      .select('*')
      .order('created_at',{ascending:false})
      .range(page*30,page*30+29);

    if (companyId) {
      if (!companyId) throw fail('관리자 권한이 필요합니다.',403);
      jobsQuery = jobsQuery.eq('company_id',companyId);
    } else {
      jobsQuery = jobsQuery.eq('status','open').gte('end_date',dayInKorea());
      if(proposalsEnabled)jobsQuery=jobsQuery.or(`proposal_user_id.is.null,proposal_user_id.eq.${user.id}`);

      if(ownerCompanyId) {
        jobsQuery=jobsQuery.neq('company_id',ownerCompanyId);
      }
    }

    if (!companyId && params.get('region')) {
      jobsQuery = jobsQuery.ilike(
        'region',
        `%${params.get('region').slice(0,100).replace(/[%_]/g,'')}%`
      );
    }

    if(!companyId && params.get('date')) {
      jobsQuery=jobsQuery.contains('work_dates',[params.get('date')]);
    }

    const jobs = value(await jobsQuery);

    if(params.get('job')) {
      if(!uuid(params.get('job')))throw fail('공고를 확인해주세요.');

      const requested=value(await db.from('labor_jobs')
        .select('*')
        .eq('id',params.get('job'))
        .maybeSingle()
      );

      if(requested && (!requested.proposal_user_id || requested.proposal_user_id===user.id || requested.company_id===companyId) && !jobs.some(j=>j.id===requested.id)) {
        const application=!companyId
          ?value(await db.from('labor_applications')
            .select('id')
            .eq('job_id',requested.id)
            .eq('user_id',user.id)
            .maybeSingle()
          )
          :null;

        if(companyId
          ?requested.company_id===companyId
          :Boolean(application)
        ) {
          jobs.push(requested);
        }
      }
    }

    for(const job of jobs) {
      job.address=job.region;
      delete job.created_by;
    }

    let applicationsQuery = db.from('labor_applications')
      .select('*')
      .order('updated_at',{ascending:false});

    if(!companyId && params.get('job')) {
      applicationsQuery=applicationsQuery.eq('job_id',params.get('job'));
    }

    const applications = companyId
      ?jobs.length
        ?value(await applicationsQuery
          .in(
            'job_id',
            jobs.filter(j => j.company_id === companyId)
              .map(j => j.id)
              .concat('00000000-0000-0000-0000-000000000000')
          )
          .limit(300)
        )
        :[]
      :value(await applicationsQuery.eq('user_id',user.id).limit(300));

    const missingIds = [
      ...new Set(
        applications.map(a=>a.job_id)
          .filter(id=>!jobs.some(j=>j.id===id))
      )
    ];

    const applicationJobs = missingIds.length
      ?value(await db.from('labor_jobs').select('*').in('id',missingIds))
      :[];

    for(const job of applicationJobs) {
      job.address=job.region;
      delete job.created_by;
    }

    const companyIds = [
      ...new Set([...jobs,...applicationJobs].map(j=>j.company_id))
    ];

    const managers = companyIds.length
      ?value(await db.from('profiles')
        .select('company_id,name')
        .in('company_id',companyIds)
        .eq('role','owner')
        .eq('is_active',true)
      )
      :[];

    const companies = companyIds.length
      ?value(await db.from('companies')
        .select('id,company_name')
        .in('id',companyIds)
      )
      :[];

    for(const job of [...jobs,...applicationJobs]) {
      job.company_name=companies.find(c=>c.id===job.company_id)?.company_name || '업체';
      job.manager_name=managers
        .filter(p=>p.company_id===job.company_id)
        .map(p=>p.name)
        .filter(Boolean)
        .join(' · ');
    }

    let candidates = [];

    if (companyId) {
      if(params.get('date')&&!validWorkDay(params.get('date'))) throw fail('날짜를 확인해주세요.');
      for(const [key,max] of [['wage',2000000],['experience',70]]) {
        if(params.get(key)&&(!Number.isInteger(Number(params.get(key)))||Number(params.get(key))<0||Number(params.get(key))>max)) throw fail('검색 범위를 확인해주세요.');
      }
      const result=value(await db.rpc('worker_directory_action',{p_actor:user.id,p_action:'search',p_body:{
        query:params.get('name')||'',region:params.get('region')||'',skill:params.get('skill')||'',
        page,experience:Number(params.get('experience')||0),date:params.get('date')||'',wage:params.get('wage')||''
      }}));
      candidates=await photos(db,(result?.profiles||[]).slice(0,30));
    }

    if (companyId) {
      const ids = [...new Set(applications.map(a=>a.user_id))];

      if(ids.length) {
        const applicantProfiles = await photos(
          db,
          value(await db.from('labor_profiles')
            .select(publicProfileFields)
            .in('user_id',ids)
          )
        );

        const consenting = [
          ...new Set(
            applications
              .filter(a=>a.share_phone&&['applied','accepted'].includes(a.status))
              .map(a=>a.user_id)
          )
        ];

        const contacts = consenting.length
          ?value(await db.from('labor_personal_details')
            .select('user_id,phone')
            .in('user_id',consenting)
          )
          :[];

        for(const a of applications) {
          a.profile=applicantProfiles.find(p=>p.user_id===a.user_id);

          if(a.share_phone && ['applied','accepted'].includes(a.status)) {
            a.phone=contacts.find(p=>p.user_id===a.user_id)?.phone || '';
          }
        }
      }
    }

    // Batch only the people and jobs already authorized by the filters above.
    const visibleProfiles=[...candidates,...applications.map(a=>a.profile).filter(Boolean),...(ownProfile?[ownProfile]:[])];
    const [badgedProfiles,badgedJobs]=await Promise.all([
      directoryBadges(db,visibleProfiles),
      companyJobBadges(db,[...jobs,...applicationJobs])
    ]);
    const profileBadges=new Map(badgedProfiles.map(p=>[p.user_id,p.featured_badge]));
    candidates=candidates.map(p=>({...p,featured_badge:profileBadges.get(p.user_id)||null}));
    for(const a of applications){
      if(a.profile)a.profile={...a.profile,featured_badge:profileBadges.get(a.profile.user_id)||null};
    }
    if(ownProfile)ownProfile.featured_badge=profileBadges.get(ownProfile.user_id)||null;
    const jobBadges=new Map(badgedJobs.map(j=>[j.id,j.company_badge]));
    for(const j of [...jobs,...applicationJobs])j.company_badge=jobBadges.get(j.id)||null;

    await attachAssignmentState(db, applications, [...jobs,...applicationJobs]);

    return json({
      manager:Boolean(companyId),
      proposalsEnabled,
      companyId,
      jobs,
      applicationJobs,
      applications,
      candidates,
      page,
      profile:ownProfile ? (await photos(db,[ownProfile]))[0] : null
    });
  } catch(error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const {db,user,companyId,ownerCompanyId} = await auth(request);

    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      if(companyId) {
        throw fail('관리자는 구인 공고만 등록할 수 있습니다.',403);
      }

      if(Number(request.headers.get('content-length'))>2200000) {
        throw fail('사진은 2MB 이하로 올려주세요.');
      }

      const form = await request.formData();
      const file=form.get('photo');

      if(
        !file || !file.size || file.size>2097152
        || !['image/jpeg','image/png','image/webp'].includes(file.type)
      ) {
        throw fail('2MB 이하 JPG·PNG·WebP 사진을 선택해주세요.');
      }

      const bytes=new Uint8Array(await file.arrayBuffer());

      const valid=file.type==='image/jpeg'
        ?bytes[0]===255 && bytes[1]===216 && bytes[2]===255
        :file.type==='image/png'
          ?[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)
          :String.fromCharCode(...bytes.slice(0,4))==='RIFF'
            && String.fromCharCode(...bytes.slice(8,12))==='WEBP';

      if(!valid) throw fail('지원하는 이미지 파일을 선택해주세요.');

      const existing=value(await db.from('labor_profiles')
        .select('photo_path')
        .eq('user_id',user.id)
        .maybeSingle()
      );

      if(!existing) throw fail('개인 프로필을 먼저 저장해주세요.');

      const path=`${user.id}/${crypto.randomUUID()}.${
        file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp'
      }`;

      value(await db.storage.from('labor-avatars')
        .upload(path,bytes,{contentType:file.type,upsert:false})
      );

      const updated=await db.from('labor_profiles')
        .update({photo_path:path,updated_at:new Date().toISOString()})
        .eq('user_id',user.id)
        .select('user_id')
        .single();

      if(updated.error) {
        await db.storage.from('labor-avatars').remove([path]);
        throw updated.error;
      }

      // The DB update has succeeded. Cleanup must not turn it into a failed upload.
      if(existing.photo_path) {
        try {
          await db.storage.from('labor-avatars').remove([existing.photo_path]);
        } catch {
          console.warn('프로필 이전 사진 정리 지연');
        }
      }

      // Return the saved image directly; an unrelated profile read must not
      // hide a successful upload or overwrite unsaved form edits.
      let photoUrl=null;
      try {
        const signed=await db.storage.from('labor-avatars').createSignedUrl(path,300);
        photoUrl=signed.data?.signedUrl||null;
        if(signed.error)console.warn('프로필 사진 미리보기 생성 실패',signed.error.statusCode||'storage');
      } catch {
        console.warn('프로필 사진 미리보기 생성 지연');
      }
      return json({ok:true,photo_url:photoUrl});
    }

    const body=await request.json();

    if(body.action==='read_notification') {
      if(!uuid(body.id))throw fail('알림을 확인해주세요.');

      if(companyId) {
        const notice=value(await db.from('labor_notifications')
          .select('id,labor_jobs!inner(company_id)')
          .eq('id',body.id)
          .eq('user_id',user.id)
          .eq('labor_jobs.company_id',companyId)
          .maybeSingle());
        if(!notice) throw fail('본인 업체의 알림만 확인할 수 있습니다.',403);
      }

      value(await scopeLaborNotifications(db.from('labor_notifications')
        .update({read_at:new Date().toISOString()}),!companyId)
        .eq('id',body.id)
        .eq('user_id',user.id)
      );

      return json({ok:true});
    }

    if(body.action==='seeking') {
      if(companyId) {
        throw fail('시공자 화면에서 구직 공고를 등록해주세요.',403);
      }

      const dates=body.dates;

      if(
        !Array.isArray(dates)||!dates.length||dates.length>90
        ||dates.some(d=>!validWorkDay(d)||d<dayInKorea())
      ) {
        throw fail('오늘 이후 일할 수 있는 날짜를 선택해주세요.');
      }

      if(body.consent!==true) {
        throw fail('공개한 날짜에 현장 배정과 연락처 공유를 동의해주세요.');
      }

      const profile=value(await db.from('labor_profiles')
        .select(publicProfileFields)
        .eq('user_id',user.id)
        .maybeSingle()
      );

      const personal=value(await db.from('labor_personal_details')
        .select('phone')
        .eq('user_id',user.id)
        .maybeSingle()
      );

      if(!profile || !profile.region || !profile.daily_wage || !personal?.phone) {
        throw fail('개인설정에서 이름·연락처·활동 지역·희망 일당을 먼저 저장해주세요.');
      }

      value(await db.from('labor_profiles').update({
        available_dates:[...new Set(dates)].sort(),
        seeking:true,
        published:true,
        direct_hire_consent:true,
        updated_at:new Date().toISOString()
      }).eq('user_id',user.id));

      return json({ok:true});
    }

    if(body.action==='stop_seeking') {
      if(companyId)throw fail('시공자 화면에서 변경해주세요.',403);

      value(await db.from('labor_profiles').update({
        seeking:false,
        direct_hire_consent:false,
        updated_at:new Date().toISOString()
      }).eq('user_id',user.id));

      return json({ok:true});
    }

    if(body.action==='profile') {
      if(companyId) {
        throw fail('관리자는 구인 공고만 등록할 수 있습니다.',403);
      }

      const profile=cleanProfile(body.profile);
      const personal=cleanPrivate(body.personal);

      if(
        typeof body.personal.phone!=='string'
        || !/^[0-9 +()-]{0,30}$/.test(body.personal.phone.trim())
      ) {
        throw fail('전화번호를 확인해주세요.');
      }

      value(await db.rpc('save_labor_profile',{
        p_user_id:user.id,
        p_profile:profile,
        p_private:{...personal,phone:body.personal.phone.trim()}
      }));

      return json({ok:true});
    }

    if(body.action==='job') {
      if(!companyId) throw fail('관리자 권한이 필요합니다.',403);
      if(!uuid(body.job?.site_id)) {
        throw fail('내 현장에서 구인하기를 눌러주세요.');
      }

      const site=value(await db.from('sites')
        .select('id,company_id,work_dates,schedule_start,schedule_end,status')
        .eq('id',body.job.site_id)
        .eq('company_id',companyId)
        .maybeSingle()
      );

      if(!site || ['cancelled','completed'].includes(site.status)) {
        throw fail('본인 업체의 진행할 현장만 구인할 수 있습니다.',403);
      }

      const allowed=siteWorkDays(site).filter(day=>day>=dayInKorea());
      let days;

      if(Object.hasOwn(body.job,'work_dates')) {
        if(
          !Array.isArray(body.job.work_dates)
          ||!body.job.work_dates.length
          ||body.job.work_dates.length>366
          ||body.job.work_dates.some(day=>!validWorkDay(day))
        ) {
          throw fail('구인이 필요한 시공 날짜를 선택해주세요.');
        }

        days=[...new Set(body.job.work_dates)].sort();

        if(days.some(day=>!allowed.includes(day))) {
          throw fail('현장에 등록된 오늘 이후 시공일만 선택할 수 있습니다. 일정을 다시 확인해주세요.');
        }
      } else {
        days=allowed.filter(day=>
          day>=body.job.work_date && day<=body.job.end_date
        );
      }

      if(!days.length)throw fail('내 현장에 시공 예정일을 먼저 등록해주세요.');

      const job=cleanJob({
        ...body.job,
        work_date:days[0],
        end_date:days.at(-1)
      });

      if(body.recruitUserId) {
        if(!uuid(body.recruitUserId))throw fail('시공자를 확인해주세요.');
        if(!Number.isSafeInteger(body.expectedWage)||body.expectedWage<=0)throw fail('적용할 시공자 등록 일당을 확인해주세요.');

        const result=await db.rpc('create_labor_job_proposal',{
          p_expected_wage:body.expectedWage,
          p_actor:user.id,
          p_target:body.recruitUserId,
          p_job:{
            ...job,
            site_id:site.id,
            work_dates:days,
            company_id:companyId,
            created_by:user.id
          }
        });

        if(result.error) {
          if(result.error.code==='P0001') {
            throw fail(result.error.message,409);
          }
          throw result.error;
        }

        try {
          await dispatchLaborNotifications(db,result.data?.id);
        }catch {
          // 저장된 알림은 유지하고 푸시는 재시도합니다.
        }

        return json(result.data);
      }

      const saved=value(await db.from('labor_jobs')
        .insert({
          ...job,
          site_id:site.id,
          work_dates:days,
          company_id:companyId,
          created_by:user.id
        })
        .select('id')
        .single()
      );

      return json({ok:true,id:saved.id});
    }

    if(!uuid(body.jobId)) throw fail('구인 공고를 확인해주세요.');

    const job=value(await db.from('labor_jobs')
      .select('*')
      .eq('id',body.jobId)
      .maybeSingle()
    );

    if(!job) throw fail('공고를 찾을 수 없습니다.',404);

    if(['proposal_accept','proposal_decline'].includes(body.action)) {
      if(companyId)throw fail('시공자 홈에서 본인에게 온 제안을 확인해주세요.',403);
      if(body.action==='proposal_accept' && (body.share_phone!==true || !Number.isSafeInteger(body.expectedWage) || body.expectedWage<=0))throw fail('제안 일당과 연락처 공유 동의를 확인해주세요.');
      const result=await db.rpc('reply_labor_job_proposal',{p_actor:user.id,p_job:job.id,p_accept:body.action==='proposal_accept',p_expected_wage:body.expectedWage??null});
      if(result.error){if(result.error.code==='P0001')throw fail(result.error.message,409);throw result.error;}
      try{await dispatchLaborNotifications(db,job.id);}catch{}
      return json(result.data);
    }
    if(job.proposal_user_id && !['close','finish'].includes(body.action))throw fail('현장 제안은 수락 또는 거절 버튼으로 처리해주세요.',409);

    if(body.action==='direct_hire')throw fail('시공자에게 현장 제안을 보내고 수락을 기다려주세요.',409);
    const manager=[
      'close','finish','invite','accept','reject','direct_hire'
    ].includes(body.action);

    if(manager && (!companyId || job.company_id!==companyId)) {
      throw fail('본인 업체의 공고만 관리할 수 있습니다.',403);
    }

    if(![
      'close','finish','invite','apply','withdraw','accept','reject','direct_hire'
    ].includes(body.action)) {
      throw fail('요청을 확인해주세요.');
    }

    if(companyId && ['apply','withdraw'].includes(body.action)) {
      throw fail('관리자는 구인만 등록할 수 있습니다.',403);
    }

    if(
      ['apply','withdraw'].includes(body.action)
      && ownerCompanyId===job.company_id
    ) {
      throw fail('본인 업체의 공고에는 지원할 수 없습니다.',403);
    }

    if(body.action==='apply') {
      // A worker can apply to an external company without changing their
      // employee relationship with the current employer.
      const {data:ownWorkers,error:workerError}=await db.from('workers')
        .select('id,company_id').eq('user_id',user.id).eq('is_active',true).limit(100);
      if(workerError)throw workerError;
      const linked=(ownWorkers||[]).filter(w=>w.company_id===job.company_id);
      if(linked.length){
        const {data:relationships,error:relationshipError}=await db.from('worker_relationships')
          .select('worker_id,relationship_type,ended_at').eq('company_id',job.company_id)
          .in('worker_id',linked.map(w=>w.id)).is('ended_at',null);
        if(relationshipError)throw relationshipError;
        if((relationships||[]).some(r=>r.relationship_type==='employee')){
          throw fail('소속 업체 현장은 구직 지원 대신 관리자에게 배정을 요청해주세요.',409);
        }
      }
      // Never create or overwrite a company relationship on application.
      // Hiring remains subject to manager approval and existing RPC validation.
    }

    if(body.action==='apply'){
      const {data:personal,error:personalError}=await db.from('labor_personal_details')
        .select('phone').eq('user_id',user.id).maybeSingle();
      if(personalError)throw personalError;
      const {data:profile,error:profileError}=await db.from('labor_profiles')
        .select('name,daily_wage,region').eq('user_id',user.id).maybeSingle();
      if(profileError)throw profileError;
      const missing=[];
      if(!profile?.name?.trim())missing.push('이름');
      if(!personal?.phone?.trim())missing.push('연락처');
      if(!profile?.region?.trim())missing.push('활동 지역');
      if(!Number.isFinite(Number(profile?.daily_wage))||Number(profile?.daily_wage)<=0)missing.push('개인 일당');
      if(missing.length)throw fail('구직 지원 전에 개인설정 필수 항목을 입력해주세요: '+missing.join(', '),422);
    }

    if(body.action==='apply' && body.share_phone!==true) {
      throw fail('지원할 업체에 프로필·연락처 공유를 동의해주세요.');
    }

    if(
      ['invite','accept','reject','direct_hire'].includes(body.action)
      && !uuid(body.userId)
    ) {
      throw fail('시공자를 확인해주세요.');
    }

    const rated=['accept','direct_hire'].includes(body.action);
    if(rated && (!Number.isSafeInteger(body.expectedWage)||body.expectedWage<=0)) throw fail('적용할 시공자 등록 일당을 확인해주세요.');
    const result=await db.rpc(rated?'labor_action_registered_wage':'labor_action',{
      ...(rated?{p_expected_wage:body.expectedWage}:{}),
      p_actor:user.id,
      p_job:job.id,
      p_action:body.action,
      p_target:manager?body.userId || null:null
    });

    if(result.error) {
      if(result.error.code==='P0001') {
        throw fail(result.error.message,409);
      }
      throw result.error;
    }

    try {
      await dispatchLaborNotifications(db,job.id);
    }catch(error) {
      console.error('구인 알림 발송 대기:',error.code || 'push');
    }

    return json(result.data || {ok:true});
  } catch(error) {
    return errorResponse(error);
  }
}
