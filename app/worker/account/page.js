"use client";
import HomeReturnButton from '../../components/HomeReturnButton';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { confirmEmailDomain } from '../../../lib/emailDomainGuard';
import '../../components/laborMarket.css';

const blank = {
  name:'',
  age:'',
  gender:'',
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

  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);

  const [saved,setSaved]=useState(false);
  const [section,setSection]=useState('profile');
  const [pendingInvite,setPendingInvite]=useState('');

  useEffect(()=>{
    const invite=new URLSearchParams(window.location.search).get('invite');
    if(invite && /^[0-9a-f-]{36}$/i.test(invite)){setPendingInvite(invite);setSection('profile');}
    if(new URLSearchParams(window.location.search).get('section')==='seeking') {
      setSection('seeking');
    }
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
        if(!response.ok) throw Error(data.error);

        if(!controller.signal.aborted){
          setProfile({
            ...blank,
            ...data.defaults,
            ...data.profile,
            age:data.profile?.age??''
          });
          setPersonal({...privateBlank,...data.personal});
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
        if(!confirmEmailDomain(email))return;
        const {data,error}=await supabase.auth.signUp({
          email:email.trim(),
          password,
          options:{
            data:{registration_type:'worker'},
            emailRedirectTo:`${window.location.origin}/worker/account`
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
        const {data,error}=await supabase.auth.signInWithPassword({
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
            skills:profile.skills || []
          },
          personal
        })
      });

      const result=await response.json();
      if(!response.ok)throw Error(result.error);

      setSaved(true);
      if(pendingInvite){
        const inviteResponse=await fetch('/api/direct-worker-invites',{
          method:'POST',cache:'no-store',
          headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},
          body:JSON.stringify({action:'accept',code:pendingInvite})
        });
        const inviteResult=await inviteResponse.json();
        if(!inviteResponse.ok)throw Error('프로필은 저장됐지만 업체 연결에 실패했습니다: '+(inviteResult.error||'다시 시도해주세요.'));
        setPendingInvite('');
        setMessage((inviteResult.companyName||'초대 업체')+'에 연결되었습니다. 시공자 홈에서 현장을 확인하세요.');
        window.history.replaceState(null,'','/worker/account');
      }else{
        setMessage('개인설정을 저장했습니다. 구직 공고는 구직하기에서 등록해주세요.');
      }
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
      if(file.size>2097152)throw Error('사진은 2MB 이하로 올려주세요.');

      const {data}=await supabase.auth.getSession();
      if(!data.session)throw Error('다시 로그인해주세요.');

      const form=new FormData();
      form.append('photo',file);

      const response=await fetch('/api/labor-market',{
        method:'POST',
        headers:{
          'X-Labor-View':'worker',
          Authorization:`Bearer ${data.session.access_token}`
        },
        body:form
      });

      const result=await response.json();
      if(!response.ok)throw Error(result.error);

      const me=await fetch('/api/labor-market?mode=me',{
        headers:{
          'X-Labor-View':'worker',
          Authorization:`Bearer ${data.session.access_token}`
        },
        cache:'no-store'
      });

      const info=await me.json();
      if(!me.ok)throw Error(info.error);

      setProfile(p=>({...p,photo_url:info.profile?.photo_url}));
      setMessage('프로필 사진을 등록했습니다.');
    }catch(e){
      setMessage(e.message);
    }finally{
      setBusy(false);
      e.target.value='';
    }
  }

  const field=(label,key,type='text',secret=false)=>
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
          key==='departure_address'
            ?300
            :key==='name'?60:100
        }
        min={type==='number'?0:undefined}
      />
    </label>;

  return <main className='labor-shell labor-account'>
    <nav className='labor-navigation' aria-label='개인설정 화면 이동'>
      <HomeReturnButton />
      <Link className='labor-nav-button' href='/jobs?view=worker'><span className='labor-nav-icon' aria-hidden='true'>▦</span><span>구인·구직</span><span className='labor-nav-arrow' aria-hidden='true'>›</span></Link>
    </nav>

    {pendingInvite && <aside role='status' style={{padding:14,border:'1px solid #bfdbfe',borderRadius:12,background:'#eff6ff',marginBottom:14}}><strong>업체 연결 마지막 단계</strong><p style={{margin:'8px 0 0'}}>이름·연락처·일당만 확인하고 아래 버튼을 누르세요. 프로필 저장 후 초대 수락과 업체 연결을 자동으로 이어서 처리합니다.</p></aside>}
    {!pendingInvite && <span className='eyebrow'>나를 소개하고 좋은 현장을 찾아요</span>}
    <h1>{session?'내 프로필 · 구직':'시공자 계정'}</h1>

    {!ready
      ?<p>계정을 확인하는 중…</p>
      :!session
        ?<form onSubmit={login}>
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

          <button disabled={busy}>
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
        :<>
          {!loaded
            ?<p>개인설정을 불러오는 중입니다. 오류가 있으면 새로고침해주세요.</p>
            :<form onSubmit={save}>
              <fieldset disabled={busy}>
                {!pendingInvite && <div className='tabs'>
                  {[
                    ['profile','기본 프로필'],
                    ['seeking','구직 공고'],
                    ['private','계좌·주소']
                  ].map(([id,label])=>
                    <button
                      key={id}
                      type='button'
                      aria-pressed={section===id}
                      onClick={()=>setSection(id)}
                    >
                      {label}
                    </button>
                  )}
                </div>}

                {!pendingInvite && <p className='muted'>기본정보를 한 번 저장하면 구직 공고에 그대로 사용됩니다.</p>}

                <div hidden={section!=='profile'}>
                  <h2>내 프로필</h2>

                  {!pendingInvite && <div className='profile-heading'>
                    {profile.photo_url
                      ?<img
                        src={profile.photo_url}
                        alt='내 프로필 사진'
                        width={80}
                        height={80}
                      />
                      :<div className='avatar-placeholder'>
                        {profile.name?.slice(0,1)||'나'}
                      </div>
                    }

                    <div>
                      <strong>{profile.name||'프로필 사진'}</strong>

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
                  </div>}

                  {!pendingInvite && !saved && <small>프로필을 먼저 저장하면 사진을 올릴 수 있습니다.</small>}

                  {field('이름','name')}
                  {field('연락처','phone','tel',true)}

                  <small>지원할 때 동의한 업체에만 연락처를 공유합니다.</small>

                  {!pendingInvite && <div className='pair'>
                    {field('나이 (선택)','age','number')}
                    {field('경력 (년)','experience_years','number')}
                  </div>}

                  {!pendingInvite && <label>성별 (선택)
                    <select value={profile.gender || ''} onChange={event=>setProfile(p=>({...p,gender:event.target.value}))}>
                      <option value=''>선택하지 않음</option>
                      <option value='male'>남성</option>
                      <option value='female'>여성</option>
                      <option value='prefer_not_to_say'>응답하지 않음</option>
                    </select>
                  </label>}

                  {field('등록 일당 (원)','daily_wage','number')}

                  {!pendingInvite && field('활동 지역 (예: 인천 서구)','region')}

                  {!pendingInvite && <label>
                    자기소개
                    <textarea
                      value={profile.introduction}
                      maxLength={1500}
                      onChange={e=>setProfile(p=>({
                        ...p,introduction:e.target.value
                      }))}
                    />
                  </label>}
                </div>

                {!pendingInvite && <div hidden={section!=='seeking'}>
                  <h2>내 구직 공고</h2>

                  <p>
                    저장한 프로필이 구직 공고가 됩니다.
                    새로 작성할 필요 없이 공개 여부와 가능한 날짜만 선택하세요.
                  </p>

                  <article>
                    <strong>{profile.name || '이름을 입력해주세요'}</strong>
                    <p>
                      {profile.region || '활동 지역 미입력'}
                      {' '}· 등록 일당 {Number(profile.daily_wage).toLocaleString()}원
                      {' '}· 경력 {profile.experience_years}년
                    </p>
                  </article>

                  <p>
                    구직하기에서 일할 수 있는 날짜를 선택하고
                    현장 배정 동의를 하면 관리자에게 공개됩니다.
                  </p>

                  <Link
                    className='site-link'
                    href='/jobs?view=worker&tab=seeking'
                  >
                    일할 날짜 선택 · 구직하기 ›
                  </Link>
                </div>}

                {!pendingInvite && <div hidden={section!=='private'}>
                  <h2>연락처·입금 정보</h2>

                  <p>
                    전화번호는 지원한 업체에 동의 후 공유됩니다.
                    계좌와 상세 주소는 구인·구직에 공개되지 않습니다.
                  </p>

                  {field('은행명','bank_name','text',true)}
                  {field('계좌번호','account_number','text',true)}
                  {field('예금주','account_holder','text',true)}
                  {field('출발 상세 주소 (길찾기용)','departure_address','text',true)}

                  <small>
                    저장하면 현재 연결된 활성 소속 업체의 계좌·출발 주소에도 반영됩니다.
                    등록 일당은 기존 업체의 계약 일당을 변경하지 않습니다.
                  </small>
                </div>}

                <div className='save-row'>
                  <button className='primary' disabled={busy}>
                    {busy
                      ?'저장 중…'
                      :pendingInvite ? '저장하고 업체 연결 완료' : section==='seeking'
                        ?'구직 공고 저장'
                        :section==='private'
                          ?'계좌·주소 저장'
                          :'프로필 저장'
                    }
                  </button>
                </div>
              </fieldset>
            </form>
          }

          <button disabled={busy} onClick={async()=>{
            await supabase.auth.signOut();
            setProfile(blank);
            setPersonal(privateBlank);
            setMessage('로그아웃했습니다.');
          }}>
            로그아웃
          </button>
        </>
    }

    {pendingInvite&&session&&<p role='status' style={{padding:12,background:'#eff6ff',borderRadius:10}}>업체 초대 수락 진행 중입니다. 프로필을 저장하면 업체 연결을 자동으로 완료합니다. 연결 오류가 발생하면 이 화면에서 다시 저장할 수 있습니다.</p>}
    {message&&<p role='status'>{message}</p>}
  </main>;
                      }
