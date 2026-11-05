begin;
alter table public.account_deletion_requests add column if not exists identity_verified boolean not null default false;
alter table public.account_deletion_requests add column if not exists identity_verified_at timestamptz;
alter table public.account_deletion_requests add column if not exists scope text not null default 'personal_account' check(scope='personal_account');
create or replace function public.submit_account_deletion_request(p_user uuid)
returns setof public.account_deletion_requests language sql security definer set search_path=''
as $f$
 insert into public.account_deletion_requests(user_id,identity_verified,identity_verified_at,scope)
 values(p_user,true,now(),'personal_account')
 on conflict(user_id) do update set
 identity_verified=true,identity_verified_at=now(),updated_at=now()
 returning *;
$f$;
revoke all on function public.submit_account_deletion_request(uuid) from public,anon,authenticated;
grant execute on function public.submit_account_deletion_request(uuid) to service_role;
commit;
