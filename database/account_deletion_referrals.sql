begin;
alter table public.app_referrals alter column inviter drop not null;
alter table public.app_referrals add column if not exists recipient_deleted boolean not null default false;
create or replace function public.scrub_account_referrals(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 update public.app_referrals set
 inviter=case when inviter=u then null else inviter end,
 recipient_deleted=recipient_deleted or coalesce(recipient=u,false),
 recipient=case when recipient=u then null else recipient end,
 subject_key=case when subject_key='user:'||u::text then 'deleted:'||id::text else subject_key end,
 token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
 expires_at=least(expires_at,now())
 where inviter=u or recipient=u or subject_key='user:'||u::text;
 if exists(select 1 from public.app_referrals where inviter=u or recipient=u or subject_key='user:'||u::text) then raise exception 'Referral cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_referrals(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_referrals(uuid,uuid) to service_role;
create or replace function public.referral_metrics(p_subject text,p_scope text)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(p_scope||'_referral_shared',count(*) filter(where (recipient is not null or recipient_deleted)),p_scope||'_referral_joined',count(*) filter(where joined_at is not null))
 from public.app_referrals where subject_key=p_subject;
$$;
create or replace function public.referral_action(p_actor uuid,p_action text,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare subject text; r public.app_referrals%rowtype; joined timestamptz; result jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text,812437));
 if exists(select 1 from public.account_deletion_blocks where user_id=p_actor) then raise exception 'Account deletion in progress' using errcode='42501'; end if;
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
  if r.inviter is null or r.inviter=p_actor or (r.recipient is not null or r.recipient_deleted) or r.expires_at<=now() then
   raise exception '본인 초대이거나 이미 사용되었거나 만료된 링크입니다.' using errcode='22023';
  end if;
  if exists(select 1 from public.app_referrals where recipient=p_actor) then raise exception '이미 초대가 인정된 계정입니다. 같은 계정은 한 번만 인정됩니다.' using errcode='22023'; end if;
  update public.app_referrals set recipient=p_actor,joined_at=case when joined>=r.created_at then now() else null end,shared_at=coalesce(shared_at,now()) where id=r.id;
 elsif p_action<>'get' then raise exception '지원하지 않는 초대 요청입니다.' using errcode='22023'; end if;
 return jsonb_build_object('ok',true,'confirmation_version',2,'metrics',public.referral_metrics(subject,coalesce(p_body->>'scope','worker')),
 'links',coalesce((select jsonb_agg(to_jsonb(x)) from (select token,created_at,expires_at,shared_at,joined_at,((recipient is not null or recipient_deleted)) as confirmed from public.app_referrals where inviter=p_actor and subject_key=subject order by created_at desc limit 10)x),'[]'::jsonb));
end $$;
revoke all on function public.referral_metrics(text,text),public.referral_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.referral_metrics(text,text),public.referral_action(uuid,text,jsonb) to service_role;
commit;
