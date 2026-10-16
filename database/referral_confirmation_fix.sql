begin;
create or replace function public.referral_metrics(p_subject text,p_scope text)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(p_scope||'_referral_shared',count(*) filter(where recipient is not null),p_scope||'_referral_joined',count(*) filter(where joined_at is not null))
 from public.app_referrals where subject_key=p_subject;
$$;
create or replace function public.referral_action(p_actor uuid,p_action text,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare subject text; r public.app_referrals%rowtype; joined timestamptz; result jsonb;
begin
 subject:=public.referral_subject(p_actor,coalesce(p_body->>'scope','worker'));
 perform pg_advisory_xact_lock(hashtextextended('referral-user:'||p_actor::text,0));
 if p_action='create' then
  -- Reuse an unshared link after a retry. Link generation itself earns nothing.
  select * into r from public.app_referrals where inviter=p_actor and subject_key=subject and shared_at is null and recipient is null and expires_at>now() order by created_at desc limit 1;
  if r.id is null then
   if (select count(*) from public.app_referrals where inviter=p_actor and created_at>=now()-interval '1 day')>=20 then raise exception '초대 링크는 하루 20개까지 만들 수 있습니다.' using errcode='22023'; end if;
   insert into public.app_referrals(inviter,subject_key) values(p_actor,subject) returning * into r;
  end if;
  return jsonb_build_object('token',r.token,'expires_at',r.expires_at);
 elsif p_action='shared' then
  update public.app_referrals set shared_at=coalesce(shared_at,now()) where token=p_body->>'token' and inviter=p_actor and subject_key=subject and expires_at>now() returning * into r;
  if r.id is null then raise exception '초대 링크를 다시 만들어주세요.' using errcode='22023'; end if;
 elsif p_action='claim' then
  select * into r from public.app_referrals where token=p_body->>'token' for update;
  if r.id is null then raise exception '유효하지 않은 초대 링크입니다.' using errcode='22023'; end if;
  if r.recipient=p_actor then return jsonb_build_object('ok',true,'message','이미 초대 확인이 인정되었습니다.'); end if;
  select created_at into joined from auth.users where id=p_actor;
  if r.inviter=p_actor or r.recipient is not null or r.expires_at<=now() then
   raise exception '본인 초대이거나 이미 사용되었거나 만료된 링크입니다.' using errcode='22023';
  end if;
  if exists(select 1 from public.app_referrals where recipient=p_actor) then raise exception '이미 초대가 인정된 계정입니다. 같은 계정은 한 번만 인정됩니다.' using errcode='22023'; end if;
  update public.app_referrals set recipient=p_actor,joined_at=case when joined>=r.created_at then now() else null end,shared_at=coalesce(shared_at,now()) where id=r.id;
 elsif p_action<>'get' then raise exception '지원하지 않는 초대 요청입니다.' using errcode='22023'; end if;
 return jsonb_build_object('ok',true,'confirmation_version',2,'metrics',public.referral_metrics(subject,coalesce(p_body->>'scope','worker')),
 'links',coalesce((select jsonb_agg(to_jsonb(x)) from (select token,created_at,expires_at,shared_at,joined_at,(recipient is not null) as confirmed from public.app_referrals where inviter=p_actor and subject_key=subject order by created_at desc limit 10)x),'[]'::jsonb));
end $$;


update public.achievement_definitions
set description='서로 다른 계정의 로그인·이메일 인증 후 초대 확인 '||target||'명'
where metric in ('worker_referral_shared','owner_referral_shared');
revoke all on function public.referral_metrics(text,text), public.referral_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.referral_metrics(text,text), public.referral_action(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
select '중복 초대 방지·받는 사람 확인 기준 적용 완료' as result;
