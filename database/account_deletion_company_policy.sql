begin;
-- Snapshot the company selected by the server; never accept a client company ID.
alter table public.account_deletion_requests add column if not exists company_deletion_id uuid;
alter table public.account_deletion_requests add column if not exists company_deletion_requested_at timestamptz;
create or replace function public.submit_account_deletion_request(p_user uuid)
returns setof public.account_deletion_requests language plpgsql security definer set search_path=''
as $f$ declare co uuid;
begin
 select c.id into co from public.companies c join public.profiles p on p.company_id=c.id
 where p.id=p_user and p.role='owner' for update of c;
 if co is not null and exists(select 1 from public.profiles where company_id=co and id<>p_user and role='owner' and is_active=true) then co:=null; end if;
 return query insert into public.account_deletion_requests(user_id,identity_verified,identity_verified_at,scope,company_deletion_id,company_deletion_requested_at)
 values(p_user,true,now(),'personal_account',co,case when co is not null then now() end)
 on conflict(user_id) do update set identity_verified=true,identity_verified_at=now(),updated_at=now(),
 company_deletion_id=case when account_deletion_requests.status='review_required' then excluded.company_deletion_id else account_deletion_requests.company_deletion_id end,
 company_deletion_requested_at=case when account_deletion_requests.status='review_required' then excluded.company_deletion_requested_at else account_deletion_requests.company_deletion_requested_at end
 returning *;
end;$f$;
revoke all on function public.submit_account_deletion_request(uuid) from public,anon,authenticated;
grant execute on function public.submit_account_deletion_request(uuid) to service_role;
create or replace function public.inspect_company_deletion_scope(p_request uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$ declare co uuid; u uuid; r record; n bigint; rows jsonb:='[]'; dependencies jsonb;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account' and status in ('review_required','processing','failed');
 if co is null or u is null then raise exception 'Company deletion request required';end if;
 if not exists(select 1 from public.profiles where id=u and company_id=co and role='owner') then raise exception 'Company ownership changed';end if;
 if exists(select 1 from public.profiles where company_id=co and id<>u and role='owner' and is_active=true) then raise exception 'Another active owner remains';end if;
 for r in select ns.nspname,c.relname,a.attname,a.atttypid
 from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
 where ns.nspname in ('public','app_private') and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
 and ((a.attname='company_id' and a.atttypid='uuid'::regtype)
 or (a.attname='subject_key' and a.atttypid in ('text'::regtype,'character varying'::regtype))) loop
 if r.attname='company_id' then execute format('select count(*) from %I.%I where %I=$1',r.nspname,r.relname,r.attname) into n using co;
 else execute format('select count(*) from %I.%I where %I=$1',r.nspname,r.relname,r.attname) into n using 'company:'||co::text;end if;
 if n>0 then rows:=rows||jsonb_build_array(jsonb_build_object('schema',r.nspname,'table',r.relname,'column',r.attname,'rows',n,'action',case when r.nspname='public' and r.relname='profiles' then 'detach_company' else 'delete_company_records' end));end if;
 end loop;
 with recursive related(oid) as (
 select 'public.companies'::regclass::oid
 union select fk.conrelid from pg_catalog.pg_constraint fk join related parent on fk.confrelid=parent.oid where fk.contype='f'
 ) select coalesce(jsonb_agg(jsonb_build_object('table',fk.conrelid::regclass::text,'parent',fk.confrelid::regclass::text,'constraint',fk.conname,'delete_action',fk.confdeltype) order by fk.conname),'[]') into dependencies
 from pg_catalog.pg_constraint fk where fk.contype='f' and fk.confrelid in(select oid from related);
 return jsonb_build_object('company_id',co,'direct_records',rows,'dependencies',dependencies,'scope_complete',false,'storage_review_required',true,'preserve_other_auth_accounts',true);
end;$f$;
revoke all on function public.inspect_company_deletion_scope(uuid) from public,anon,authenticated;
grant execute on function public.inspect_company_deletion_scope(uuid) to service_role;
commit;
