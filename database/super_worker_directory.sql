begin;
-- Service-only RPC: the API checks the authenticated user, and this function
-- independently checks their active super-admin membership. No auth secrets returned.
create schema if not exists app_private;
create or replace function app_private.super_worker_directory(p_actor uuid,p_kind text default 'account',p_query text default '',p_status text default 'all',p_company uuid default null,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.super_admins where user_id=p_actor and is_active=true) then
  raise exception '슈퍼관리자 권한이 필요합니다.' using errcode='42501';
 end if;
 if p_kind not in ('account','unlinked','pending') or p_status not in ('all','seeking','published','private','incomplete','inactive') or p_page<1 or p_page>2500 or length(p_query)>100 then
  raise exception '조회 조건을 확인해주세요.' using errcode='22023';
 end if;
 with memberships as (
  select w.user_id,jsonb_agg(jsonb_build_object(
   'workerId',w.id,'companyId',w.company_id,'companyName',coalesce(c.company_name,'업체명 확인 필요'),
   'companyActive',c.is_active is distinct from false,'active',w.is_active is distinct from false,
   'relationship',case when r.user_id=w.user_id and r.ended_at is null then r.relationship_type else 'unspecified' end
  ) order by w.id) entries,
  array_agg(distinct w.phone) filter(where nullif(w.phone,'') is not null) phones,
  string_agg(coalesce(c.company_name,''),' ') company_names,
  array_agg(w.company_id) company_ids,min(w.name) worker_name
  from public.workers w left join public.companies c on c.id=w.company_id
  left join public.worker_relationships r on r.worker_id=w.id
  where w.user_id is not null group by w.user_id
 ), accounts as (
  select u.id, case when l.user_id is not null or m.user_id is not null or p.role='worker'
    or (u.raw_user_meta_data->>'registration_type'='worker' and p.company_id is null) then 'account' else 'pending' end kind,
   coalesce(l.name,p.name,m.worker_name,'프로필 미등록') name,u.email,u.created_at,
   u.last_sign_in_at,u.email_confirmed_at is not null confirmed,p.is_active is distinct from false active,
   l.user_id is not null has_profile,l.daily_wage,l.region,l.skills,l.experience_years,l.introduction,l.published,l.seeking,l.updated_at,
   array(select distinct x from unnest(coalesce(m.phones,'{}'::text[])||array[d.phone]) x where nullif(x,'') is not null) phones,
   coalesce(m.entries,'[]'::jsonb) entries,coalesce(m.company_names,'') company_names,m.company_ids
  from auth.users u left join public.profiles p on p.id=u.id
  left join public.labor_profiles l on l.user_id=u.id
  left join public.labor_personal_details d on d.user_id=u.id
  left join memberships m on m.user_id=u.id
  where l.user_id is not null or m.user_id is not null or p.role='worker'
    or (p.company_id is null and p.role is distinct from 'owner' and not exists(select 1 from public.super_admins sa where sa.user_id=u.id))
 ), rows as (
  select a.id,a.kind,a.name,a.email,a.created_at,a.active,a.has_profile,a.confirmed,a.published,a.seeking,a.phones,a.company_names,a.company_ids,
   jsonb_build_object('id',a.id,'kind',a.kind,'name',a.name,'email',coalesce(a.email,''),'createdAt',a.created_at,
    'lastSignIn',a.last_sign_in_at,'emailConfirmed',a.confirmed,'active',a.active,'hasProfile',a.has_profile,
    'dailyWage',a.daily_wage,'region',coalesce(a.region,''),'skills',coalesce(a.skills,'{}'::text[]),
    'experience',a.experience_years,'introduction',coalesce(a.introduction,''),'published',coalesce(a.published,false),
    'seeking',coalesce(a.seeking,false),'profileRevision',a.updated_at,'phones',a.phones,'memberships',a.entries) item,
   coalesce(a.region,'') region
  from accounts a
  union all
  select w.id,'unlinked',coalesce(w.name,'이름 미등록'),'',w.created_at,w.is_active is distinct from false,false,false,false,false,
   array_remove(array[w.phone],null),coalesce(c.company_name,''),array[w.company_id],
   jsonb_build_object('id',w.id,'kind','unlinked','name',coalesce(w.name,'이름 미등록'),'active',w.is_active is distinct from false,
    'createdAt',w.created_at,'phones',array_remove(array[w.phone],null),'memberships',jsonb_build_array(jsonb_build_object(
     'workerId',w.id,'companyId',w.company_id,'companyName',coalesce(c.company_name,'업체명 확인 필요'),
     'companyActive',c.is_active is distinct from false,'active',w.is_active is distinct from false,'relationship','unspecified'))),''
  from public.workers w left join public.companies c on c.id=w.company_id where w.user_id is null
 ), filtered as (
  select * from rows r where kind=p_kind and (p_company is null or p_company=any(company_ids))
  and (btrim(p_query)='' or strpos(lower(concat_ws(' ',name,email,region,company_names,array_to_string(phones,' '))),lower(btrim(p_query)))>0
   or (length(regexp_replace(p_query,'[^0-9]','','g'))>=4 and exists(select 1 from unnest(phones) ph where strpos(regexp_replace(ph,'[^0-9]','','g'),regexp_replace(p_query,'[^0-9]','','g'))>0)))
  and (p_status='all' or p_status='seeking' and seeking or p_status='published' and published
   or p_status='private' and has_profile and not coalesce(published,false)
   or p_status='incomplete' and kind='account' and (not has_profile or not confirmed)
   or p_status='inactive' and not active)
 ), counts as (select count(*) total,least(p_page,greatest(1,ceil(count(*)/20.0)::integer)) page from filtered),
 paged as (select item,created_at,id from filtered order by created_at desc nulls last,id limit 20 offset (select (page-1)*20 from counts))
 select jsonb_build_object('items',coalesce((select jsonb_agg(item order by created_at desc nulls last,id) from paged),'[]'::jsonb),
  'total',counts.total,'page',counts.page,'pageSize',20,'relationshipsAvailable',true,
  'summary',(select jsonb_build_object('accounts',count(*) filter(where kind='account'),'pending',count(*) filter(where kind='pending'),
    'unlinked',count(*) filter(where kind='unlinked'),'seeking',count(*) filter(where kind='account' and seeking)) from rows),
  'companies',coalesce((select jsonb_agg(jsonb_build_object('id',id,'company_name',company_name,'is_active',is_active) order by company_name,id) from public.companies),'[]'::jsonb))
 into result from counts;
 return result;
end $$;
revoke all on function app_private.super_worker_directory(uuid,text,text,text,uuid,integer) from public,anon,authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.super_worker_directory(uuid,text,text,text,uuid,integer) to service_role;
create or replace function public.super_worker_directory(p_actor uuid,p_kind text default 'account',p_query text default '',p_status text default 'all',p_company uuid default null,p_page integer default 1)
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.super_worker_directory(p_actor,p_kind,p_query,p_status,p_company,p_page);
$$;
revoke all on function public.super_worker_directory(uuid,text,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.super_worker_directory(uuid,text,text,text,uuid,integer) to service_role;
commit;
