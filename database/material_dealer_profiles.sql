begin;
-- Existing pilot only. No Auth users, live payments or production stock are created.
alter table public.material_pilot_dealers alter column user_id drop not null;
alter table public.material_pilot_dealers add column if not exists profile jsonb not null default '{}'::jsonb;
alter table public.material_pilot_dealers add column if not exists is_test boolean not null default false;
alter table public.material_pilot_dealers drop constraint if exists material_dealer_account_guard;
alter table public.material_pilot_dealers add constraint material_dealer_account_guard
 check ((is_test and user_id is null) or (not is_test and user_id is not null));
alter table public.material_pilot_dealers drop constraint if exists material_dealer_profile_object;
alter table public.material_pilot_dealers add constraint material_dealer_profile_object
 check(jsonb_typeof(profile)='object');
create unique index if not exists material_dealer_business_number
 on public.material_pilot_dealers ((profile->>'business_number'))
 where status<>'deleted' and coalesce(profile->>'business_number','')<>'';
create unique index if not exists material_dealer_test_name
 on public.material_pilot_dealers(name) where is_test and status<>'deleted';
create table if not exists public.material_pilot_brand_dealers (
 brand text primary key check(length(brand) between 1 and 80),
 dealer_id uuid not null references public.material_pilot_dealers(id),
 enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.material_pilot_brand_dealers enable row level security;
revoke all on public.material_pilot_brand_dealers from public,anon,authenticated;
grant select,insert,update,delete on public.material_pilot_brand_dealers to service_role;
-- Preserve routing history on cancellation/deletion; a disabled supplier blocks new orders.
create or replace function public.material_dealer_brand_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.enabled and not exists(select 1 from public.material_pilot_dealers where id=new.dealer_id and status='active' for share) then
  raise exception '활성 대리점만 브랜드 출고처로 연결할 수 있습니다.';
 end if;
 return new;
end $$;
revoke all on function public.material_dealer_brand_guard() from public,anon,authenticated;
grant execute on function public.material_dealer_brand_guard() to service_role;
drop trigger if exists material_dealer_brand_guard on public.material_pilot_brand_dealers;
create trigger material_dealer_brand_guard before insert or update on public.material_pilot_brand_dealers
for each row execute function public.material_dealer_brand_guard();
commit;
select '대리점 상세정보·테스트 대리점·브랜드 출고처 설정 완료' as result;
