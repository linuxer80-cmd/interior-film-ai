"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import WorkDatePicker from '../../admin/WorkDatePicker';
import { supabase } from '../../../lib/supabase';
import '../../components/laborMarket.css';

const blank = {
  name:'',
  age:'',
  daily_wage:250000,
  region:'',
  skills:[],
  experience_years:0,
  introduction:'',
  available_dates:[],
  seeking:false,
  published:false
};

const privateBlank = {
  phone:'',
  bank_name:'',
  account_number:'',
  account_holder:'',
  departure_address:''
};

export default function WorkerAccount() {
  const [session,setSession]=useState(null);
  const [ready,setReady]=useState(false);
  const [signup,setSignup]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [profile,setProfile]=useState(blank);
  const [personal,setPersonal]=useState(privateBlank);
  const [skillText,setSkillText]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [saved,setSaved]=useState(false);
  const [section,setSection]=useState('profile');

  useEffect(()=>{
    if(
      new URLSearchParams(window.location.search)
        .get('section')==='seeking'
    )setSection('seeking');
  },[]);

  useEffect(()=>{
    let active=true;

    supabase.auth.getSession().then(({data})=>{
      if(active){
        setSession(data.session);
        setReady(true);
      }
    });

    const {data}=supabase.auth.onAuthStateChange((_event,s)=>{
      setSession(s);
      setReady(true);
    });

    return()=>{
      active=false;
      data.subscription.unsubscribe();
    };
  },[]);

  useEffect(()=>{
    if(!session){
      setLoaded(false);
      setSaved(false);
      return;
    }

    const controller=new AbortController();
    setLoaded(false);
    setMessage('');

    (async()=>{
      try{
        const response=await fetch('/api/labor-market?mode=me',{
          headers:{
            'X-Labor-View':'worker',
            Authorization:`Bearer ${session.access_token}`
          },
          cache:'no-store',
          signal:controller.signal
        });

        const data=await response.json();
        if(!response.ok)throw Error(data.error);

        if(!controller.signal.aborted){
          setProfile({
            ...blank,
            ...data.defaults,
            ...data.profile,
            age:data.profile?.age??''
          });
          setPersonal({...privateBlank,...data.personal});
          setSkillText((data.profile?.skills||[]).join(', '));
          setSaved(Boolean(data.profile));
          setLoaded(true);
        }
      }catch(e){
        if(!controller.signal.aborted)setMessage(e.message);
      }
    })();

    return()=>controller.abort();
  },[session?.user?.id,session?.access_token]);

  async function login(e){
    e.preventDefault();
    if(busy)return;

    setBusy(true);
    setMessage('');

    try{
      if(signup){
        const {data,error}=await supabase.auth.signUp({
          email:email.trim(),
          password,
          options:{
            emailRedirectTo:
              `${window.location.origin}/worker/account`
          }
        });

        if(error)throw error;

        setSession(data.session);
        setMessage(
          data.session
            ?'가입되었습니다. 개인 프로필을 등록해주세요.'
            :'인증 메일을 확인한 뒤 이 화면에서 로그인해주세요.'
        );
      }else{
        const {data,error}=
          await supabase.auth.signInWithPassword({
            email:email.trim(),
            password
          });

        if(error)throw error;
        setSession(data.session);
      }
    }catch(e){
      setMessage(e.message);
    }finally{
      setBusy(false);
    }
  }

  async function save(e){
    e.preventDefault();
    if(busy||!loaded)return;

    setBusy(true);
    setMessage('');

    try{
      const {data}=await supabase.auth.getSession();
      if(!data.session)throw Error('다시 로그인해주세요.');

      const response=await fetch('/api/labor-market',{
        method:'POST',
        headers:{
          'X-Labor-View':'worker',
          Authorization:`Bearer ${data.session.access_token}`,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          action:'profile',
          profile:{
            ...profile,
            skills:skillText.split(',')
              .map(s=>s.trim()).filter(Boolean)
          },
          personal
        })
      });

      const result=await response.json();
      if(!response.ok)throw Error(result.error);

      setSaved(true);
      setMessage('저장했습니다. 구직 공개 설정도 반영되었습니다.');
    }catch(e){
      setMessage(e.message);
    }finally{
      setBusy(false);
    }
  }

  async function photo(e){
    const file=e.target.files?.[0];
    if(!file||busy)return;

    setBusy(true);
    setMessage('');

    try{
      if(file.size>2097152){
        throw Error('사진은 2MB 이하로 올려주세요.');
      }

      const {data}=await supabase.auth.getSession();
      if(!data.session)throw Error('다시 로그인해주세요.');

      const form=new FormData();
      form.append('photo',file);

      const headers={
        'X-Labor-View':'worker',
        Authorization:`Bearer ${data.session.access_token}`
      };

      const response=await fetch('/api/labor-market',{
        method:'POST',
        headers,
        body:form
      });

      const result=await response.json();
      if(!response.ok)throw Error(result.error);

      const me=await fetch('/api/labor-market?mode=me',{
        headers,
        cache:'no-store'
      });

      const info=await me.json();
      if(!me.ok)throw Error(info.error);

      setProfile(p=>({
        ...p,photo_url:info.profile?.photo_url
      }));
      setMessage('프로필 사진을 등록했습니다.');
    }catch(e){
      setMessage(e.message);
    }finally{
      setBusy(false);
      e.target.value='';
    }
  }

  const field=(label,key,type='text',secret=false)=>(
    <label>
      {label}
      <input
        type={type}
        value={(secret?personal:profile)[key]}
        onChange={e=>
          secret
            ?setPersonal(p=>({...p,[key]:e.target.value}))
            :setProfile(p=>({...p,[key]:e.target.value}))
        }
        maxLength={
          key==='departure_address'?300:key==='name'?60:100
        }
        min={type==='number'?0:undefined}
      />
    </label>
  );

  return(
    <main className='labor-shell labor-account'>
      <nav>
        <Link href='/worker'>시공자 홈</Link>
        <Link href='/jobs?view=worker'>구인·구직</Link>
      </nav>

      <span className='eyebrow'>
        나를 소개하고 좋은 현장을 찾아요
      </span>

      <h1>{session?'내 프로필 · 구직':'시공자 계정'}</h1>

      {!ready?(
        <p>계정을 확인하는 중…</p>
      ):!session?(
        <form onSubmit={login}>
          <h2>{signup?'시공자 회원가입':'시공자 로그인'}</h2>
          <p>소속 업체 없이도 가입하고 구직할 수 있습니다.</p>

          <label>
            이메일
            <input
              type='email'
              required
              autoComplete='email'
              value={email}
              onChange={e=>setEmail(e.target.value)}
            />
          </label>

          <label>
            비밀번호
            <input
              type='password'
              required
              minLength={8}
              autoComplete={signup?'new-password':'current-password'}
              value={password}
              onChange={e=>setPassword(e.target.value)}
            />
          </label>

          <button className='primary' disabled={busy}>
            {busy?'처리 중…':signup?'가입하기':'로그인'}
          </button>

          <button
            type='button'
            disabled={busy}
            onClick={()=>setSignup(s=>!s)}
          >
            {signup?'로그인으로 돌아가기':'시공자 회원가입'}
          </button>

          <Link href='/worker/login'>기존 소속 시공자 로그인</Link>
        </form>
      ):(
        <>
          {!loaded?(
            <p>
              개인설정을 불러오는 중입니다.
              오류가 있으면 새로고침해주세요.
            </p>
          ):(
            <form onSubmit={save}>
              <fieldset disabled={busy}>
                <div className='tabs'>
                  {[
                    ['profile','기본 프로필'],
                    ['seeking','구직 공고'],
                    ['private','계좌·주소']
                  ].map(([id,label])=>(
                    <button
                      key={id}
                      type='button'
                      aria-pressed={section===id}
                      onClick={()=>setSection(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className='muted'>
                  기본정보를 한 번 저장하면
                  구직 공고에 그대로 사용됩니다.
                </p>

                <div hidden={section!=='profile'}>
                  <h2>내 프로필</h2>

                  <div className='profile-heading'>
                    {profile.photo_url?(
                      <img
                        src={profile.photo_url}
                        alt='내 프로필 사진'
                        width={80}
                        height={80}
                      />
                    ):(
                      <div className='avatar-placeholder'>
                        {profile.name?.slice(0,1)||'나'}
                      </div>
                    )}

                    <div>
                      <strong>
                        {profile.name||'프로필 사진'}
                      </strong>

                      <label className='photo-button'>
                        사진 변경
                        <input
                          className='visually-hidden'
                          type='file'
                          accept='image/jpeg,image/png,image/webp'
                          disabled={!saved}
                          onChange={photo}
                        />
                      </label>

                      <small>JPG·PNG·WebP / 2MB 이하</small>
                    </div>
                  </div>

                  {!saved&&(
                    <small>
                      프로필을 먼저 저장하면 사진을 올릴 수 있습니다.
                    </small>
                  )}

                  {field('이름','name')}
                  {field('연락처','phone','tel',true)}

                  <small>
                    지원할 때 동의한 업체에만 연락처를 공유합니다.
                  </small>

                  <div className='pair'>
                    {field('나이 (선택)','age','number')}
                    {field('경력 (년)','experience_years','number')}
                  </div>

                  {field('희망 일당 (원)','daily_wage','number')}

                  <div className='chips'>
                    {[200000,250000,300000].map(n=>(
                      <button
                        key={n}
                        type='button'
                        aria-pressed={Number(profile.daily_wage)===n}
                        onClick={()=>setProfile(p=>({
                          ...p,daily_wage:n
                        }))}
                      >
                        {n/10000}만원
                      </button>
                    ))}
                  </div>

                  {field('활동 지역 (예: 인천 서구)','region')}

                  <label>
                    잘하는 작업
                    <small>여러 개 선택할 수 있어요</small>
                  </label>

                  <div className='chips'>
                    {[
                      '문·문틀','싱크대','붙박이장',
                      '샤시','상가','전체 시공'
                    ].map(skill=>(
                      <button
                        type='button'
                        key={skill}
                        aria-pressed={
                          skillText.split(',')
                            .map(s=>s.trim()).includes(skill)
                        }
                        onClick={()=>{
                          const items=skillText.split(',')
                            .map(s=>s.trim()).filter(Boolean);

                          setSkillText(
                            (items.includes(skill)
                              ?items.filter(s=>s!==skill)
                              :[...items,skill]
                            ).join(', ')
                          );
                        }}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>

                  <details>
                    <summary>다른 전문 분야 직접 입력</summary>
                    <input
                      value={skillText}
                      maxLength={600}
                      onChange={e=>setSkillText(e.target.value)}
                    />
                  </details>

                  <label>
                    자기소개
                    <textarea
                      value={profile.introduction}
                      maxLength={1500}
                      onChange={e=>setProfile(p=>({
                        ...p,introduction:e.target.value
                      }))}
                    />
                  </label>
                </div>

                <div hidden={section!=='seeking'}>
                  <h2>내 구직 공고</h2>

                  <p>
                    저장한 프로필이 구직 공고가 됩니다.
                    공개 여부와 가능한 날짜만 선택하세요.
                  </p>

                  <article>
                    <strong>
                      {profile.name||'이름을 입력해주세요'}
                    </strong>

                    <p>
                      {profile.region||'활동 지역 미입력'} ·
                      희망 일당{' '}
                      {Number(profile.daily_wage).toLocaleString()}원 ·
                      경력 {profile.experience_years}년
                    </p>

                    <p>{skillText}</p>
                  </article>

                  <label>일할 수 있는 날짜 (선택)</label>

                  <WorkDatePicker
                    value={profile.available_dates}
                    disabled={busy}
                    onChange={dates=>setProfile(p=>({
                      ...p,
                      available_dates:dates.filter(d=>
                        d>=new Intl.DateTimeFormat('en-CA',{
                          timeZone:'Asia/Seoul',
                          year:'numeric',
                          month:'2-digit',
                          day:'2-digit'
                        }).format(new Date())
                      )
                    }))}
                  />

                  <small>
                    날짜를 비워두면 업체와 협의할 수 있습니다.
                    날짜 검색에는 선택한 날짜만 표시됩니다.
                  </small>

                  <label className='check toggle-row'>
                    <input
                      type='checkbox'
                      checked={profile.published}
                      onChange={e=>setProfile(p=>({
                        ...p,
                        published:e.target.checked,
                        seeking:e.target.checked?p.seeking:false
                      }))}
                    />
                    모든 관리자에게 프로필 공개
                  </label>

                  <label className='check toggle-row'>
                    <input
                      type='checkbox'
                      checked={profile.seeking}
                      onChange={e=>setProfile(p=>({
                        ...p,
                        seeking:e.target.checked,
                        published:e.target.checked?true:p.published
                      }))}
                    />
                    현재 구직 중
                  </label>

                  <small>
                    구직 중과 공개를 모두 켜면 모든 관리자의
                    시공자 찾기에 표시됩니다.
                  </small>
                </div>

                <div hidden={section!=='private'}>
                  <h2>연락처·입금 정보</h2>

                  <p>
                    전화번호는 지원한 업체에 동의 후 공유됩니다.
                    계좌와 상세 주소는 구인·구직에 공개되지 않습니다.
                  </p>

                  {field('은행명','bank_name','text',true)}
                  {field('계좌번호','account_number','text',true)}
                  {field('예금주','account_holder','text',true)}
                  {field(
                    '출발 상세 주소 (길찾기용)',
                    'departure_address','text',true
                  )}

                  <small>
                    저장하면 현재 연결된 활성 소속 업체의
                    계좌·출발 주소에도 반영됩니다.
                    희망 일당은 기존 업체의 계약 일당을
                    변경하지 않습니다.
                  </small>
                </div>

                <div className='save-row'>
                  <button className='primary' disabled={busy}>
                    {busy
                      ?'저장 중…'
                      :section==='seeking'
                        ?'구직 공고 저장'
                        :section==='private'
                          ?'계좌·주소 저장'
                          :'프로필 저장'}
                  </button>
                </div>
              </fieldset>
            </form>
          )}

          <button
            disabled={busy}
            onClick={async()=>{
              await supabase.auth.signOut();
              setProfile(blank);
              setPersonal(privateBlank);
              setMessage('로그아웃했습니다.');
            }}
          >
            로그아웃
          </button>
        </>
      )}

      {message&&<p role='status'>{message}</p>}
    </main>
  );
                        }
