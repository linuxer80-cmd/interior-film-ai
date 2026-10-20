begin;
create table if not exists public.site_extra_work (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 site_id uuid not null references public.sites(id),
 requested_by uuid not null references auth.users(id),
 request_id uuid not null,
 description text not null check (length(description) between 1 and 3000),
 photo_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(photo_paths)='array' and jsonb_array_length(photo_paths)<=5),
 requested_amount numeric(14,0) check (requested_amount between 0 and 1000000000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 approved_amount numeric(14,0) check (approved_amount between 0 and 1000000000),
 review_note text not null default '' check(length(review_note)<=1000),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(company_id,site_id,requested_by,request_id)
);
create index if not exists site_extra_work_site_idx on public.site_extra_work(company_id,site_id,created_at desc,id);
create index if not exists site_extra_work_pending_idx on public.site_extra_work(company_id,created_at desc) where status='pending';
alter table public.site_extra_work enable row level security;
revoke all on public.site_extra_work from public,anon,authenticated;
grant select,insert,update on public.site_extra_work to service_role;

-- Invoker function; API verifies the token and passes its verified user ID.
-- Only service_role can execute. Lock site first, then request for atomic, once-only billing.
create or replace function public.review_site_extra_work(p_user uuid,p_site uuid,p_id uuid,p_action text,p_amount numeric default null,p_note text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.sites%rowtype; r public.site_extra_work%rowtype; base numeric; total numeric;
begin
 if p_action not in ('approve','reject','cancel') then raise exception '요청을 확인해주세요.' using errcode='22023'; end if;
 if length(coalesce(p_note,''))>1000 then raise exception '검토 메모는 1000자 이하입니다.' using errcode='22023'; end if;
 select * into s from public.sites where id=p_site for update;
 if not found or not exists(select 1 from public.companies where id=s.company_id and is_active=true)
 then raise exception '현장을 확인해주세요.' using errcode='42501'; end if;
 if p_action<>'cancel' and not exists(select 1 from public.profiles where id=p_user and company_id=s.company_id and role='owner' and is_active is distinct from false)
 then raise exception '본인 업체 관리자만 승인할 수 있습니다.' using errcode='42501'; end if;
 select * into r from public.site_extra_work where id=p_id and site_id=s.id and company_id=s.company_id for update;
 if not found then raise exception '추가 작업을 확인해주세요.' using errcode='42501'; end if;
 if p_action='cancel' and r.requested_by<>p_user then raise exception '본인 요청만 취소할 수 있습니다.' using errcode='42501'; end if;
 if r.status<>'pending' then raise exception '이미 처리된 요청입니다. 새로고침해주세요.' using errcode='40001'; end if;
 if p_action='approve' then
  if s.status='cancelled' then raise exception '취소된 현장은 승인할 수 없습니다.' using errcode='22023'; end if;
  if p_amount is null or p_amount<0 or p_amount>1000000000 or p_amount<>trunc(p_amount) then raise exception '승인 금액을 원 단위로 입력해주세요.' using errcode='22023'; end if;
  base:=s.contract_amount;
  if base is null or base<=0 then
   select case when review_status='approved' then approved_amount else null end into base from public.work_reports where site_id=s.id and company_id=s.company_id order by updated_at desc,id asc limit 1;
  end if;
  if base is null or base<0 then raise exception '기존 계약금액을 먼저 확정해주세요. 추가 금액만으로 전체 계약금액을 만들지 않습니다.' using errcode='22023'; end if;
  total:=base+p_amount;
  if total>1000000000 then raise exception '전체 계약금액 범위를 확인해주세요.' using errcode='22023'; end if;
  update public.sites set contract_amount=total where id=s.id and company_id=s.company_id;
 elsif p_action='reject' and btrim(coalesce(p_note,''))='' then
  raise exception '반려 사유를 입력해주세요.' using errcode='22023';
 end if;
 update public.site_extra_work set status=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'cancelled' end,
 approved_amount=case when p_action='approve' then p_amount else null end, review_note=coalesce(p_note,''),reviewed_by=p_user,reviewed_at=now() where id=r.id;
 return jsonb_build_object('success',true,'contractAmount',total);
end $$;
revoke all on function public.review_site_extra_work(uuid,uuid,uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.review_site_extra_work(uuid,uuid,uuid,text,numeric,text) to service_role;
commit;
select '추가 작업 승인·중복 정산 방지 설정 완료' as result;

-- 설치 후 권한 확인: rls=true, anon_select=false, authenticated_select=false여야 합니다.
select c.relname as table_name,c.relrowsecurity as rls,
 has_table_privilege('anon',c.oid,'select') as anon_select,
 has_table_privilege('authenticated',c.oid,'select') as authenticated_select
from pg_class c where c.oid='public.site_extra_work'::regclass;
