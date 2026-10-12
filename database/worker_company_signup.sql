begin;
create schema if not exists app_private;

-- Same login can own a company while retaining existing worker memberships.
create or replace function app_private.create_my_company(
 p_company_name text, p_slug text default null,
 p_owner_name text default null, p_phone text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
 uid uuid := auth.uid();
 prior public.profiles%rowtype;
 cid uuid;
 company_slug text;
begin
 if uid is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if nullif(btrim(p_company_name),'') is null or length(p_company_name)>100
   or length(coalesce(p_owner_name,''))>100 or length(coalesce(p_phone,''))>100 then
   raise exception '업체명·대표자명·전화번호를 확인해주세요.' using errcode='22023';
 end if;
 -- Serialize double clicks and retries even when a profile does not exist yet.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,731));
 select * into prior from public.profiles where id=uid for update;
 if found then
   if prior.is_active is false then
     raise exception '사용이 중지된 계정입니다.' using errcode='42501';
   end if;
   if prior.role='owner' and prior.company_id is not null then
     if not exists(select 1 from public.companies where id=prior.company_id and is_active=true) then
       raise exception '사용이 중지된 업체입니다.' using errcode='42501';
     end if;
     return prior.company_id;
   end if;
   if prior.role is not null and prior.role not in ('worker','owner') then
     raise exception '이 계정은 업체 등록을 진행할 수 없습니다.' using errcode='42501';
   end if;
 end if;
 company_slug:=lower(btrim(coalesce(p_slug,'')));
 if company_slug<>'' then
   if length(company_slug)>100 or company_slug !~ '^[a-z0-9-]+$' then
     raise exception '회사 주소는 영문 소문자·숫자·하이픈으로 입력해주세요.';
   end if;
   if exists(select 1 from public.companies where lower(slug)=company_slug) then
     raise exception '이미 사용 중인 회사 주소입니다.';
   end if;
 else
   loop
     company_slug:='company-'||replace(pg_catalog.gen_random_uuid()::text,'-','');
     exit when not exists(select 1 from public.companies where slug=company_slug);
   end loop;
 end if;
 insert into public.companies(company_name,slug,representative_name,phone,subscription_plan,is_active)
 values(btrim(p_company_name),company_slug,nullif(btrim(p_owner_name),''),nullif(btrim(p_phone),''),'trial',true)
 returning id into cid;
 -- workers, worker_relationships and assignments are deliberately untouched.
 insert into public.profiles(id,company_id,name,role,is_active)
 values(uid,cid,coalesce(nullif(btrim(p_owner_name),''),prior.name),'owner',true)
 on conflict(id) do update set company_id=excluded.company_id,name=excluded.name,
 role='owner',updated_at=now();
 insert into public.company_settings(company_id,estimate_enabled,ai_estimate_enabled,
 virtual_install_enabled,film_samples_enabled,minimum_estimate,similarity_threshold,
 estimate_title,estimate_description,customer_phone)
 values(cid,true,true,true,true,0,0.650,'AI 인테리어필름 견적',
 '시공할 곳의 사진을 올려주시면 예상견적을 확인할 수 있습니다.',nullif(btrim(p_phone),''));
 insert into public.notifications(company_id,recipient_type,recipient_user_id,recipient_worker_id,
 type,priority,title,message,link,reference_type,reference_id,dedupe_key,is_read,push_sent)
 values(cid,'super_admin',null,null,'company_signup','success','신규 업체 가입',
 btrim(p_company_name)||' 업체가 새로 가입했습니다.'||
 case when nullif(btrim(p_owner_name),'') is not null then ' 대표자: '||btrim(p_owner_name) else '' end,
 '/super-admin/company/'||cid::text,'company',cid::text,'company_signup:'||cid::text,false,false)
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
 return cid;
end;
$$;
revoke all on function app_private.create_my_company(text,text,text,text) from public,anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.create_my_company(text,text,text,text) to authenticated;

create or replace function public.create_my_company(
 p_company_name text,p_slug text default null,p_owner_name text default null,p_phone text default null
) returns uuid language sql security invoker set search_path = ''
as $$ select app_private.create_my_company(p_company_name,p_slug,p_owner_name,p_phone); $$;
revoke all on function public.create_my_company(text,text,text,text) from public,anon;
grant execute on function public.create_my_company(text,text,text,text) to authenticated;
commit;
