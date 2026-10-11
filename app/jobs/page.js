"use client";

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../lib/supabase';
import LaborNotifications from '../components/LaborNotifications';

const blankJob={
  site_id:'',
  title:'인테리어필름 시공자 구인',
  region:'',
  work_content:'',
  work_date:'',
  end_date:'',
  work_dates:[],
  daily_wage:'',
  headcount:1,
  skills:[],
  min_experience:'',
  min_age:'',
  max_age:'',
  worker_region:''
};

const labels={
  invited:'구인 제안',
  applied:'지원 완료',
  accepted:'구인 확정',
  rejected:'지원 만료',
  expired:'지원 만료',
  withdrawn:'지원 취소'
};

export default function JobsPage(){
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [tab,setTab]=useState('');
  const [filters,setFilters]=useState({
    region:'',skill:'',date:'',wage:'',experience:''
  });
  const [search,setSearch]=useState({});
  const [page,setPage]=useState(0);
  const [job,setJob]=useState(blankJob);
  const [jobSkillText,setJobSkillText]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [selectedJob,setSelectedJob]=useState('');
  const [consentJob,setConsentJob]=useState('');
  const [confirmation,setConfirmation]=useState(null);
  const [notice,setNotice]=useState('');
  const [highlight,setHighlight]=useState({job:'',applicant:''});
  const [siteDates,setSiteDates]=useState([]);

  async function api(path,body,signal){
    const workerView=
      new URLSearchParams(window.location.search)
        .get('view')==='worker';

    const {data:s}=await supabase.auth.getSession();

    if(!s.session){
      throw Error('시공자 또는 관리자 계정으로 로그인해주세요.');
    }

    const response=await fetch(path,{
      method:body?'POST':'GET',
      cache:'no-store',
      signal,
      headers:{
        'X-Labor-View':workerView?'worker':'manager',
        Authorization:`Bearer ${s.session.access_token}`,
        ...(body?{'Content-Type':'application/json'}:{})
      },
      ...(body?{body:JSON.stringify(body)}:{})
    });

    const result=await response.json();
    if(!response.ok)throw Error(result.error||'요청에 실패했습니다.');
    return result;
  }

  useEffect(()=>{
    const {data:listener}=supabase.auth.onAuthStateChange(event=>{
      if(['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event)){
        setData(null);
        setTab('');
        setConsentJob('');
        setConfirmation(null);
        setAttempt(n=>n+1);
      }
    });

    return()=>listener.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    setError('');

    api(
      `/api/labor-market?${new URLSearchParams({
        ...search,page:String(page)
      })}`,
      null,
      controller.signal
    ).then(r=>{
      if(controller.signal.aborted)return;
      setData(r);
      setTab(t=>t||(r.manager?'candidates':'jobs'));
    }).catch(e=>{
      if(!controller.signal.aborted){
        setData(null);
        setError(e.message);
      }
    });

    return()=>controller.abort();
  },[attempt,search,page]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);

    setHighlight({
      job:params.get('job')||'',
      applicant:params.get('applicant')||''
    });

    if(params.get('job')){
      setTab('applications');
      setSearch({job:params.get('job')});
    }

    if(!params.get('site'))return;

    const controller=new AbortController();

    api(
      `/api/labor-market?mode=site&site=${encodeURIComponent(
        params.get('site')
      )}`,
      null,
      controller.signal
    ).then(r=>{
      if(controller.signal.aborted)return;

      setSiteDates(r.site.work_dates||[]);
      setJob({
        ...blankJob,
        ...r.site,
        site_id:r.site.id,
        work_dates:r.site.work_dates||[]
      });
      setShowForm(true);
      setTab('mine');
    }).catch(e=>{
      if(!controller.signal.aborted)setError(e.message);
    });

    return()=>controller.abort();
  },[]);

  async function act(body){
    if(busy)return;

    if(body.action==='job'&&!body.job.work_dates?.length){
      setError('구인이 필요한 날짜를 한 개 이상 선택해주세요.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');

    try{
      await api('/api/labor-market',body);

      if(body.action==='job'){
        setShowForm(false);
        setTab('mine');
        setNotice('구인 공고가 등록되었습니다.');
      }else if(body.action==='accept'){
        setNotice(
          '시공자를 선택하고 현장에 배정했습니다. 모집 인원이 차면 자동 마감됩니다.'
        );
      }else{
        setNotice('처리했습니다.');
      }

      setConfirmation(null);
      setConsentJob('');
      setAttempt(n=>n+1);
    }catch(e){
      setError(e.message);
    }finally{
      setBusy(false);
    }
  }

  const field=(label,key,type='text',required=false)=>(
    <label>
      {label}{!required&&<small>선택</small>}
      <input
        required={required}
        type={type}
        value={job[key]??''}
        min={type==='number'?0:undefined}
        max={type==='number'?2000000:undefined}
        onChange={e=>setJob(j=>({...j,[key]:e.target.value}))}
      />
    </label>
  );

  const myJobs=data?.jobs.filter(j=>j.status==='open')||[];

  const profileCard=p=>(
    <>
      <div className='person'>
        {p.photo_url&&(
          <img src={p.photo_url} alt='' width={64} height={64}/>
        )}
        <div>
          <h3>{p.name}{p.age?` · ${p.age}세`:''}</h3>
          <p>{p.region} · 경력 {p.experience_years}년</p>
        </div>
      </div>

      <p>희망 일당 {Number(p.daily_wage).toLocaleString()}원</p>
      {p.skills?.length>0&&<p>{p.skills.join(' · ')}</p>}
      {p.introduction&&(
        <p className='multiline'>{p.introduction}</p>
      )}
      {p.available_dates?.length>0&&(
        <p>가능한 날짜 {p.available_dates.join(', ')}</p>
      )}
    </>
  );

  const jobCard=j=>(
    <>
      <h3>{j.title}</h3>
      <p>
        {j.company_name} · {j.region} ·
        {j.status==='open'?' 모집 중':' 모집 종료'}
      </p>
      <p className='multiline'>{j.work_content}</p>
      <p>
        {j.work_dates?.length
          ?j.work_dates.join(', ')
          :`${j.work_date} ~ ${j.end_date}`}
        {' '}· {j.headcount}명
      </p>

      {j.daily_wage!=null&&(
        <p>일당 {Number(j.daily_wage).toLocaleString()}원</p>
      )}

      {j.min_age!=null||j.max_age!=null?(
        <p>
          나이 {j.min_age!=null?`${j.min_age}세 이상`:''}
          {' '}{j.max_age!=null?`${j.max_age}세 이하`:''}
        </p>
      ):null}

      {j.worker_region&&(
        <p>희망 시공자 지역 {j.worker_region}</p>
      )}
      {j.min_experience!=null&&(
        <p>경력 {j.min_experience}년 이상</p>
      )}
      {j.skills?.length>0&&(
        <p>필요 분야 {j.skills.join(' · ')}</p>
      )}
    </>
  );

  return(
    <main>
      <nav>
        <Link href={data?.manager?'/admin':'/worker'}>‹ 홈</Link>
        {!data?.manager&&(
          <Link href='/worker/account'>내 프로필</Link>
        )}
      </nav>

      <h1>
        {data?.manager
          ?'구인 관리 · 시공자 찾기'
          :'구인 찾기 · 내 구직'}
      </h1>

      <LaborNotifications refreshKey={attempt}/>

      {error&&(
        <p role='alert' className='error'>
          {error}{' '}
          <Link href='/worker/account'>프로필 등록·로그인</Link>
        </p>
      )}

      {notice&&<p role='status'>{notice}</p>}
      {!data&&!error&&<p>불러오는 중…</p>}

      {data&&(
        <>
          <div className='tabs'>
            {(data.manager?[
              ['candidates','구직 시공자 찾기'],
              ['mine','내 구인 공고'],
              ['applications','지원자 확인']
            ]:[
              ['jobs','구인 공고 찾기'],
              ['applications','내 지원 현황']
            ]).map(([id,label])=>(
              <button
                key={id}
                aria-pressed={tab===id}
                onClick={()=>setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {!data.manager&&(
            <aside>
              <p>
                구직 공고는 내 프로필을 활용해 한 번에 공개할 수 있습니다.
              </p>
              <Link href='/worker/account?section=seeking'>
                내 구직 공고 등록·수정 ›
              </Link>
            </aside>
          )}

          {data.manager&&tab==='mine'&&(
            <>
              {!showForm&&(
                <aside>
                  <p>내 현장 정보를 활용해 구인 공고를 작성하세요.</p>
                  <Link href='/admin?tab=sites'>
                    내 현장 선택 → 구인하기
                  </Link>
                </aside>
              )}

              {showForm&&(
                <form onSubmit={e=>{
                  e.preventDefault();
                  act({
                    action:'job',
                    job:{
                      ...job,
                      skills:jobSkillText.split(',')
                        .map(s=>s.trim()).filter(Boolean)
                    }
                  });
                }}>
                  <fieldset disabled={busy}>
                    <h2>현장에서 구인하기</h2>
                    <p>
                      지역과 작업 내용을 가져왔습니다.
                      공고에 공개할 내용을 확인해주세요.
                    </p>

                    {field('공고 제목','title','text',true)}
                    {field('대략적인 현장 지역','region','text',true)}

                    <label>
                      작업 내용
                      <textarea
                        required
                        maxLength={2000}
                        value={job.work_content}
                        onChange={e=>setJob(j=>({
                          ...j,work_content:e.target.value
                        }))}
                      />
                    </label>

                    <h3>구인이 필요한 시공일</h3>
                    <p>
                      현장에 등록된 날짜를 가져왔습니다.
                      필요한 날만 선택하세요.
                    </p>

                    <button
                      type='button'
                      onClick={()=>setJob(j=>({
                        ...j,work_dates:[...siteDates]
                      }))}
                    >
                      전체 선택
                    </button>

                    <button
                      type='button'
                      onClick={()=>setJob(j=>({...j,work_dates:[]}))}
                    >
                      선택 해제
                    </button>

                    <div className='date-options'>
                      {siteDates.map(day=>(
                        <button
                          key={day}
                          type='button'
                          aria-pressed={job.work_dates.includes(day)}
                          onClick={()=>setJob(j=>({
                            ...j,
                            work_dates:j.work_dates.includes(day)
                              ?j.work_dates.filter(d=>d!==day)
                              :[...j.work_dates,day].sort()
                          }))}
                        >
                          {new Intl.DateTimeFormat('ko-KR',{
                            timeZone:'Asia/Seoul',
                            month:'long',
                            day:'numeric',
                            weekday:'short'
                          }).format(
                            new Date(`${day}T00:00:00+09:00`)
                          )}
                        </button>
                      ))}
                    </div>

                    <p>
                      선택한 시공일 {job.work_dates.length}일 ·
                      {' '}{job.work_dates.join(', ')||
                        '날짜를 선택해주세요.'}
                    </p>

                    {!siteDates.length&&(
                      <p className='error'>
                        현장 일정에 시공일을 먼저 등록해주세요.
                      </p>
                    )}

                    {field('모집 인원','headcount','number',true)}

                    <details>
                      <summary>
                        원하는 조건 · 공란은 공고에서 생략
                      </summary>

                      {field('제시 일당 (원)','daily_wage','number')}

                      <div className='pair'>
                        {field('최소 나이','min_age','number')}
                        {field('최대 나이','max_age','number')}
                      </div>

                      {field('시공자 활동 지역','worker_region')}
                      {field('최소 경력 (년)','min_experience','number')}

                      <label>
                        전문 분야 <small>선택</small>
                        <input
                          placeholder='문·문틀, 싱크대'
                          value={jobSkillText}
                          onChange={e=>setJobSkillText(e.target.value)}
                        />
                      </label>
                    </details>

                    <p>
                      상세 주소·고객 연락처·출입 비밀번호는 공개 공고에
                      입력하지 마세요. 채용 후 내 현장에서 상세 정보를
                      확인합니다.
                    </p>

                    <button className='primary' disabled={busy}>
                      {busy?'등록 중…':'구인하기'}
                    </button>

                    <button
                      type='button'
                      onClick={()=>setShowForm(false)}
                    >
                      작성 닫기
                    </button>
                  </fieldset>
                </form>
              )}
            </>
          )}

          {(tab==='candidates'||tab==='jobs')&&(
            <form onSubmit={e=>{
              e.preventDefault();
              setPage(0);
              setSearch({...filters});
            }}>
              <label>
                지역
                <input
                  placeholder='예: 인천 서구'
                  value={filters.region}
                  onChange={e=>setFilters(f=>({
                    ...f,region:e.target.value
                  }))}
                />
              </label>

              <label>
                작업 날짜
                <input
                  type='date'
                  value={filters.date}
                  onChange={e=>setFilters(f=>({
                    ...f,date:e.target.value
                  }))}
                />
              </label>

              {data.manager&&(
                <details>
                  <summary>일당·경력·전문 분야로 검색</summary>

                  <label>
                    희망 일당 상한 (원)
                    <input
                      type='number'
                      value={filters.wage}
                      onChange={e=>setFilters(f=>({
                        ...f,wage:e.target.value
                      }))}
                    />
                  </label>

                  <label>
                    최소 경력 (년)
                    <input
                      type='number'
                      value={filters.experience}
                      onChange={e=>setFilters(f=>({
                        ...f,experience:e.target.value
                      }))}
                    />
                  </label>

                  <label>
                    전문 분야
                    <input
                      value={filters.skill}
                      onChange={e=>setFilters(f=>({
                        ...f,skill:e.target.value
                      }))}
                    />
                  </label>
                </details>
              )}

              <button className='primary'>검색</button>
              <button type='button' onClick={()=>{
                setSearch({});
                setFilters({
                  region:'',skill:'',date:'',wage:'',experience:''
                });
                setPage(0);
              }}>
                초기화
              </button>
            </form>
          )}

          {data.manager&&tab==='candidates'&&(
            <>
              <h2>공개 구직 공고</h2>
              {!data.candidates.length&&(
                <p>조건에 맞는 구직 공고가 없습니다.</p>
              )}

              <label>
                제안할 우리 업체 공고
                <select
                  value={selectedJob}
                  onChange={e=>setSelectedJob(e.target.value)}
                >
                  <option value=''>공고 선택</option>
                  {myJobs.map(j=>(
                    <option key={j.id} value={j.id}>
                      {j.title} · {j.region}
                    </option>
                  ))}
                </select>
              </label>

              {data.candidates.map(p=>(
                <article key={p.user_id}>
                  {profileCard(p)}
                  <button
                    disabled={
                      busy||!myJobs.some(j=>j.id===selectedJob)
                    }
                    onClick={()=>act({
                      action:'invite',
                      jobId:selectedJob,
                      userId:p.user_id
                    })}
                  >
                    이 공고로 구인 제안
                  </button>
                </article>
              ))}
            </>
          )}

          {(tab==='mine'||tab==='jobs')&&(
            <>
              <h2>
                {data.manager?'내 업체 구인 공고':'모집 중인 현장'}
              </h2>
              {!data.jobs.length&&<p>등록된 공고가 없습니다.</p>}

              {data.jobs.map(j=>(
                <article key={j.id}>
                  {jobCard(j)}

                  {data.manager?(
                    <>
                      {j.status==='open'&&(
                        <button
                          disabled={busy}
                          onClick={()=>setConfirmation({
                            action:'close',
                            jobId:j.id,
                            title:
                              '모집을 종료하면 미선택 지원자에게 만료 알림을 보냅니다.'
                          })}
                        >
                          모집 마감
                        </button>
                      )}

                      <button onClick={()=>{
                        setHighlight({job:j.id,applicant:''});
                        setTab('applications');
                      }}>
                        지원자 보기
                      </button>
                    </>
                  ):(
                    <>
                      {data.applications.some(a=>
                        a.job_id===j.id&&
                        !['invited','withdrawn'].includes(a.status)
                      )?(
                        <p>내 지원 현황에서 상태를 확인해주세요.</p>
                      ):(
                        <>
                          <label className='check'>
                            <input
                              type='checkbox'
                              checked={consentJob===j.id}
                              onChange={e=>setConsentJob(
                                e.target.checked?j.id:''
                              )}
                            />
                            이 업체에 내 프로필·연락처를 공유합니다.
                          </label>

                          <button
                            className='primary'
                            disabled={busy||consentJob!==j.id}
                            onClick={()=>act({
                              action:'apply',
                              jobId:j.id,
                              share_phone:true
                            })}
                          >
                            지원하기
                          </button>
                        </>
                      )}
                    </>
                  )}
                </article>
              ))}
            </>
          )}

          {tab==='applications'&&(
            <>
              <h2>
                {data.manager?'지원한 시공자':'내 지원·제안 현황'}
              </h2>

              {highlight.job&&(
                <button onClick={()=>setHighlight({
                  job:'',applicant:''
                })}>
                  전체 지원 보기
                </button>
              )}

              {!data.applications.filter(a=>
                !highlight.job||a.job_id===highlight.job
              ).length&&<p>지원 내역이 없습니다.</p>}

              {data.applications.filter(a=>
                !highlight.job||a.job_id===highlight.job
              ).map(a=>{
                const j=[...data.jobs,...data.applicationJobs]
                  .find(j=>j.id===a.job_id);

                return(
                  <article
                    key={a.id}
                    className={
                      highlight.applicant===a.user_id?'highlight':''
                    }
                  >
                    <h3>{j?.title} · {labels[a.status]}</h3>

                    {data.manager?(
                      <>
                        {a.profile&&profileCard(a.profile)}
                        {a.phone&&(
                          <p>
                            <a href={`tel:${a.phone}`}>전화 {a.phone}</a>
                          </p>
                        )}

                        {a.status==='applied'&&(
                          <>
                            <button
                              className='primary'
                              disabled={busy}
                              onClick={()=>setConfirmation({
                                action:'accept',
                                jobId:a.job_id,
                                userId:a.user_id,
                                title:`${
                                  a.profile?.name||'이 시공자'
                                }님을 선택하고 현장에 배정할까요? 기존 소속 시공자의 계약 일당은 유지됩니다.`
                              })}
                            >
                              구인하기
                            </button>

                            <button
                              disabled={busy}
                              onClick={()=>setConfirmation({
                                action:'reject',
                                jobId:a.job_id,
                                userId:a.user_id,
                                title:
                                  '이 지원을 만료 처리하고 시공자에게 알림을 보낼까요?'
                              })}
                            >
                              선택하지 않음
                            </button>
                          </>
                        )}
                      </>
                    ):(
                      <>
                        {j&&jobCard(j)}
                        {a.status==='invited'&&(
                          <>
                            <label className='check'>
                              <input
                                type='checkbox'
                                checked={consentJob===a.job_id}
                                onChange={e=>setConsentJob(
                                  e.target.checked?a.job_id:''
                                )}
                              />
                              프로필·연락처 공유 동의
                            </label>

                            <button
                              disabled={busy||consentJob!==a.job_id}
                              onClick={()=>act({
                                action:'apply',
                                jobId:a.job_id,
                                share_phone:true
                              })}
                            >
                              제안에 지원하기
                            </button>
                          </>
                        )}

                        {['invited','applied'].includes(a.status)&&(
                          <button
                            disabled={busy}
                            onClick={()=>act({
                              action:'withdraw',jobId:a.job_id
                            })}
                          >
                            지원 취소
                          </button>
                        )}

                        {a.status==='accepted'&&j?.site_id&&(
                          <Link
                            className='site-link'
                            href={`/worker/site/${j.site_id}`}
                          >
                            배정된 내 현장 보기 ›
                          </Link>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
            </>
          )}

          {confirmation&&(
            <aside role='alert'>
              <p>{confirmation.title}</p>
              <button
                className='primary'
                disabled={busy}
                onClick={()=>act(confirmation)}
              >
                확인
              </button>
              <button
                disabled={busy}
                onClick={()=>setConfirmation(null)}
              >
                취소
              </button>
            </aside>
          )}

          {tab!=='applications'&&(
            <div className='pages'>
              <button
                disabled={page===0}
                onClick={()=>setPage(p=>p-1)}
              >
                이전
              </button>
              <span>{page+1}페이지</span>
              <button
                disabled={
                  (tab==='candidates'?data.candidates:data.jobs)
                    .length<30
                }
                onClick={()=>setPage(p=>p+1)}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        main{
          max-width:760px;margin:auto;
          padding:24px 18px 80px;
          background:#f8f7f3;color:#243648;
          min-height:100vh;
        }
        nav,.tabs,.pages,.person{
          display:flex;gap:12px;align-items:center;flex-wrap:wrap;
        }
        .date-options button[aria-pressed=true],
        .tabs button[aria-pressed=true],.primary{
          background:#243648;color:white;
        }
        form,article,aside{
          padding:20px;background:white;
          border:1px solid #e0d5c5;
          border-radius:20px;margin:16px 0;
        }
        aside{background:#eef5ff}
        fieldset{border:0;padding:0;min-width:0}
        label{display:block;font-weight:700;margin:16px 0}
        label small{
          margin-left:8px;color:#748092;font-weight:400;
        }
        input,textarea,select{
          display:block;width:100%;box-sizing:border-box;
          padding:12px;border:1px solid #cbd5e1;
          border-radius:12px;margin-top:7px;font:inherit;
        }
        textarea{min-height:120px}
        button{
          padding:12px 16px;margin:8px 6px 8px 0;
          border:1px solid #cbd5e1;border-radius:12px;
          background:#eff6ff;color:#243648;
          font:inherit;cursor:pointer;
        }
        button:disabled{opacity:.45;cursor:default}
        .check{display:flex;gap:10px;align-items:center}
        .check input{width:auto}
        p{line-height:1.7;overflow-wrap:anywhere}
        .error{color:#b91c1c}
        .multiline{white-space:pre-wrap}
        img{border-radius:50%;object-fit:cover}
        .pair{
          display:grid;grid-template-columns:1fr 1fr;gap:12px;
        }
        summary{
          cursor:pointer;font-weight:700;padding:10px 0;
        }
        .highlight{border:2px solid #417bc3}
        .site-link{display:block;padding:14px}
        .person h3,.person p{margin:5px 0}
      `}</style>
    </main>
  );
                      }
