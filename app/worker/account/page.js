"use client";
import GuidedForm, {InputStep, InputFinal} from "../../components/GuidedForm";
import HomeReturnButton from '../../components/HomeReturnButton';
import WorkerConnectionPanel from '../../components/WorkerDirectoryClient';
import { useEffect, useRef, useState } from 'react';
import {prepareProfilePhoto} from '../../../lib/profilePhoto.mjs';
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

  const [photoMessage,setPhotoMessage]=useState('');
  const [photoBusy,setPhotoBusy]=useState(false);
  const actor=useRef(null);actor.current=session?.user?.id||null;
  const photoVersion=useRef(0);

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
    const version=photoVersion.current;
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
          setProfile(current=>({
            ...blank,
            ...data.defaults,
            ...data.profile,
            age:data.profile?.age??'',
            photo_url:version===photoVersion.current?data.profile?.photo_url:current.photo_url
          }));
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
      if(!pendingInvite && new URLSearchParams(window.location.search).get('required')==='1'){
        window.location.replace('/worker');
        return;
      }
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
    const input=e.target;
    const file=input.files?.[0];
    input.value='';
    if(!file||busy)return;
    const expected=actor.current;
    setBusy(true);setPhotoBusy(true);
    setPhotoMessage('사진 크기를 조정하는 중…');
    setMessage('');
    photoVersion.current++;
    try{
      const prepared=await prepareProfilePhoto(file);
      const {data}=await supabase.auth.getSession();
      if(!expected||data.session?.user?.id!==expected||actor.current!==expected)throw Error('계정이 변경되었습니다. 다시 로그인해주세요.');
      const form=new FormData();
      form.append('photo',prepared);
      setPhotoMessage('프로필 사진을 저장하는 중…');
      const response=await fetch('/api/labor-market',{
        method:'POST',
        headers:{'X-Labor-View':'worker',Authorization:`Bearer ${data.session.access_token}`},
        body:form
      });
      const result=await response.json().catch(()=>({error:'사진 업로드 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.'}));
      if(!response.ok)throw Error(result.error||'사진을 저장하지 못했습니다.');
      if(actor.current!==expected)return;
      photoVersion.current++;
      if(result.photo_url){
        setProfile(p=>({...p,photo_url:result.photo_url}));
        setPhotoMessage('프로필 사진을 변경했습니다. 별도로 프로필 저장을 누르지 않아도 됩니다.');
      }else{
        setPhotoMessage('사진은 저장했지만 미리보기를 불러오지 못했습니다. 새로고침해서 확인해주세요.');
      }
    }catch(e){
      if(actor.current===expected)setPhotoMessage(e.message||'사진을 변경하지 못했습니다. 다시 시도해주세요.');
    }finally{
      setBusy(false);setPhotoBusy(false);
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

    {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('required')==='1' && <aside role='status' style={{padding:14,border:'1px solid #fbbf24',borderRadius:12,background:'#fffbeb',marginBottom:14}}><strong>필수 프로필 작성</strong><p>이름과 연락처를 확인해주세요. 프리랜서는 정확한 일당 확인을 위해 개인 일당도 입력해주세요. 현장 배정은 프로필 등록 전에도 가능합니다.</p></aside>}
    {pendingInvite && <aside role='status' style={{padding:14,border:'1px solid #bfdbfe',borderRadius:12,background:'#eff6ff',marginBottom:14}}><strong>업체 연결 마지막 단계</strong><p style={{margin:'8px 0 0'}}>이름·연락처·일당만 확인하고 아래 버튼을 누르세요. 프로필 저장 후 초대 수락과 업체 연결을 자동으로 이어서 처리합니다.</p></aside>}
    {!pendingInvite && <span className='eyebrow'>나를 소개하고 좋은 현장을 찾아요</span>}
    <p>저장한 기본 프로필은 로그인한 업체 관리자 검색에 기본 표시됩니다. 연결 전 이름은 가리며 사진·일당·연락처는 공개하지 않습니다. 원치 않으면 개인설정에서 ‘업체 검색에서 내 프로필 숨기기’를 체크해주세요.</p><h1>{session?'내 프로필 · 구직':'시공자 계정'}</h1>
    {session && <p><Link href='/account/google' data-ui-link="action">구글 계정 연결 · 연결 상태 확인</Link></p>}
    {session && <p><Link href='/account/kakao' data-ui-link="action">카카오 계정 연결 · 연결 상태 확인</Link></p>}
    {session && !pendingInvite && <WorkerConnectionPanel key={session.user.id} />}

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

          <Link href='/worker/login' data-ui-link="action">기존 소속 시공자 로그인</Link>
        </form>
        :<>
          {!loaded
            ?<p>개인설정을 불러오는 중입니다. 오류가 있으면 새로고침해주세요.</p>
            :<GuidedForm key={section} initialStep={section==='private'?3:0} titles={["이름·연락처","경력·일당·지역","사진·소개","입금 계좌","출발 주소"]} busy={busy} validateStep={index=>index===0&&(!profile.name?.trim()||!personal.phone?.trim())?"이름과 연락처를 입력해주세요.":""} onSubmit={save}>
              <fieldset disabled={busy}>
                {!pendingInvite && <p className='muted'>기본정보를 한 번 저장하면 구직 공고에 그대로 사용됩니다.</p>}

                <InputStep index={0}>
                  <h2>내 프로필</h2>

                  {field('이름','name')}
                  {field('연락처','phone','tel',true)}

                  <small>지원할 때 동의한 업체에만 연락처를 공유합니다.</small>

                  </InputStep><InputStep index={1}>
                  {!pendingInvite && field('경력 (년)','experience_years','number')}
                  {field('등록 일당 (원)','daily_wage','number')}

                  {!pendingInvite && field('활동 지역 (예: 인천 서구)','region')}

                  </InputStep><InputStep index={2}>
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
                        {photoBusy?'사진 처리 중…':'사진 변경'}
                        <input
                          className='visually-hidden'
                          type='file'
                          accept='image/*'
                          disabled={!saved}
                          onChange={photo}
                        />
                      </label>

                      <small>원본 20MB 이하 · 업로드 전 자동으로 크기를 줄입니다.</small>
                      {photoMessage&&<p role='status' style={{margin:'8px 0',fontWeight:700}}>{photoMessage}</p>}
                    </div>
                  </div>}

                  {!pendingInvite && !saved && <small>프로필을 먼저 저장하면 사진을 올릴 수 있습니다.</small>}

                  {!pendingInvite && <div className='pair'>
                    {field('나이 (선택)','age','number')}
                  </div>}

                  {!pendingInvite && <label>성별 (선택)
                    <select value={profile.gender || ''} onChange={event=>setProfile(p=>({...p,gender:event.target.value}))}>
                      <option value=''>선택하지 않음</option>
                      <option value='male'>남성</option>
                      <option value='female'>여성</option>
                      <option value='prefer_not_to_say'>응답하지 않음</option>
                    </select>
                  </label>}

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
                </InputStep><InputStep index={3}>
                  <p>계좌는 구인·구직에 공개되지 않습니다. 나중에 입력해도 됩니다.</p>
                  {field('은행명','bank_name','text',true)}
                  {field('계좌번호','account_number','text',true)}
                  {field('예금주','account_holder','text',true)}
                  </InputStep><InputStep index={4}><p>내 현장까지 이동시간을 계산할 출발 주소입니다. 나중에 입력해도 됩니다.</p>
                  {field('출발 상세 주소 (길찾기용)','departure_address','text',true)}

                  <small>
                    저장하면 현재 연결된 활성 소속 업체의 계좌·출발 주소에도 반영됩니다.
                    등록 일당은 기존 업체의 계약 일당을 변경하지 않습니다.
                  </small>
                </InputStep>

                <InputFinal><div className='save-row'>
                  <button className='primary' disabled={busy}>
                    {busy
                      ?'저장 중…'
                      :pendingInvite ? '저장하고 업체 연결 완료' : '확인 완료 · 개인설정 저장'
                    }
                  </button>
                </div></InputFinal>
              </fieldset>
            </GuidedForm>
          }

          <Link
            href='/jobs?view=worker&tab=seeking'
            className='work-date-link'
            aria-label='일할 날짜 등록하기 · 구직 등록 화면으로 이동'
          >
            <span className='work-date-icon' aria-hidden='true'>
              <svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                <rect x='3' y='5' width='18' height='16' rx='3'/>
                <path d='M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2'/>
              </svg>
            </span>
            <span className='work-date-copy'>
              <strong>일할 날짜 등록하기</strong>
              <span>일할 수 있는 날짜를 선택하고<br/>구직 공고를 관리하세요.</span>
              <span className='work-date-action'>날짜 선택하기 <span aria-hidden='true'>→</span></span>
            </span>
          </Link>
          <style jsx>{`
            :global(.work-date-link) {
              display: flex; align-items: flex-start; gap: 14px;
              margin: 20px 0 16px; padding: 18px;
              border: 1px solid #bfdbfe; border-radius: 16px;
              background: #eff6ff; color: #163153;
              text-decoration: none; box-sizing: border-box;
            }
            :global(.work-date-link:hover) { background: #e0edff; }
            :global(.work-date-link:focus-visible) {
              outline: 3px solid #2563eb; outline-offset: 3px;
            }
            .work-date-icon {
              display: flex; align-items: center; justify-content: center;
              flex-shrink: 0; width: 44px; height: 44px;
              border-radius: 12px; background: white; color: #2563eb;
            }
            .work-date-copy { display: grid; gap: 7px; min-width: 0; }
            .work-date-copy strong { font-size: 17px; line-height: 1.4; }
            .work-date-copy > span { font-size: 13px; line-height: 1.6; color: #475569; }
            .work-date-copy .work-date-action {
              margin-top: 3px; color: #1d4ed8; font-size: 14px; font-weight: 700;
            }
          `}</style>
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

