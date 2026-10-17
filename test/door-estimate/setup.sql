begin;
create table if not exists public.door_test_uploads (
 company_id uuid not null references public.companies(id),
 slot smallint not null check (slot between 1 and 10),
 photo_id uuid not null,
 image_hash text not null,
 storage_path text not null,
 version text not null,
 analysis jsonb not null,
 scope text not null check (scope in ('leaf_one','leaf_both','leaf_frame')),
 unit_price integer not null check(unit_price between 1 and 10000000),
 confirmed_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(company_id,slot), unique(company_id,photo_id), unique(company_id,image_hash)
);
alter table public.door_test_uploads enable row level security;
revoke all on public.door_test_uploads from public, anon, authenticated;
grant select,insert,update,delete on public.door_test_uploads to service_role;
notify pgrst, 'reload schema';
commit;
