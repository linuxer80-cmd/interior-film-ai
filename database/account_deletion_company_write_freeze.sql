begin;
create table if not exists app_private.company_write_freezes(company_id uuid primary key,request_id uuid not null,created_at timestamptz not null default clock_timestamp());
create table if not exists app_private.company_cleanup_context(company_id uuid primary key,request_id uuid not null,lease_token uuid not null,transaction_id bigint not null,backend_id integer not null);
alter table app_private.company_write_freezes enable row level security;
alter table app_private.company_cleanup_context enable row level security;
revoke all on app_private.company_write_freezes,app_private.company_cleanup_context from public,anon,authenticated,service_role;
create or replace function app_private.authorize_company_cleanup(p_request uuid,p_lease uuid)
returns void language plpgsql security definer set search_path=''
as $f$ declare co uuid;
begin
 select company_deletion_id into co from public.account_deletion_requests where id=p_request
 and identity_verified=true and scope='personal_account' and status in('processing','failed')
 and user_id is not null and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null then raise exception 'Verified company deletion lease required';end if;
 if exists(select 1 from app_private.company_write_freezes where company_id=co and request_id<>p_request) then raise exception 'Company freeze request mismatch';end if;
 insert into app_private.company_cleanup_context values(co,p_request,p_lease,txid_current(),pg_backend_pid())
 on conflict(company_id) do update set request_id=excluded.request_id,lease_token=excluded.lease_token,transaction_id=excluded.transaction_id,backend_id=excluded.backend_id;
end;$f$;
revoke all on function app_private.authorize_company_cleanup(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function app_private.company_freeze_row_owners(p_relation oid,p_row jsonb,p_seen oid[] default '{}'::oid[])
returns uuid[] language plpgsql security definer set search_path=''
as $f$ declare keys uuid[]:='{}';value text;r record;parent_row jsonb;
begin
 if p_row is null then return keys;end if;
 if p_relation=any(p_seen) then return keys;end if;
 if cardinality(p_seen)>=16 then raise exception 'Company reference depth requires review';end if;
 if p_relation='public.companies'::regclass then return array[(p_row->>'id')::uuid];end if;
 if p_row ? 'company_id' or p_row ? 'subject_key' then
  value:=p_row->>'company_id';if value is not null then keys:=array_append(keys,value::uuid);end if;
  value:=p_row->>'subject_key';if value ~ '^company:[0-9a-fA-F-]{36}$' then keys:=array_append(keys,substring(value from 9)::uuid);end if;
  return keys;
 end if;
 for r in select fk.confrelid parent,
 (select string_agg(format('p.%I=(jsonb_populate_record(null::%s,$1)).%I',pa.attname,p_relation::regclass,ca.attname),' and ' order by k.ord)
 from unnest(fk.conkey,fk.confkey) with ordinality k(cnum,pnum,ord)
 join pg_catalog.pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=k.cnum
 join pg_catalog.pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=k.pnum) condition
 from pg_catalog.pg_constraint fk where fk.contype='f' and fk.conrelid=p_relation
 and fk.confrelid in(select oid from app_private.company_freeze_relations) order by fk.confrelid,fk.oid loop
  for parent_row in execute format('select to_jsonb(p) from %s p where %s for share',r.parent::regclass,r.condition) using p_row loop
   keys:=keys||app_private.company_freeze_row_owners(r.parent,parent_row,array_append(p_seen,p_relation));
  end loop;
 end loop;
 return keys;
end;$f$;
revoke all on function app_private.company_freeze_row_owners(oid,jsonb,oid[]) from public,anon,authenticated,service_role;
create or replace function app_private.guard_company_write_freeze()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare rowdata jsonb; keys uuid[]:='{}';co uuid;value text;
begin
 for rowdata in select x from unnest(array[case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end]) x where x is not null loop
  keys:=keys||app_private.company_freeze_row_owners(tg_relid,rowdata);
 end loop;
 for co in select distinct x from unnest(keys) x order by x loop
  -- The freeze updates this locked row, so stale repeatable-read writers
  -- cannot pass using a snapshot from before the freeze.
  perform 1 from public.companies where id=co for share;
  if exists(select 1 from app_private.company_write_freezes where company_id=co) and not exists(
   select 1 from app_private.company_cleanup_context ctx join public.account_deletion_requests q on q.id=ctx.request_id
   join app_private.company_write_freezes f on f.company_id=ctx.company_id and f.request_id=ctx.request_id
   where ctx.company_id=co and ctx.transaction_id=txid_current() and ctx.backend_id=pg_backend_pid()
   and q.company_deletion_id=co and q.identity_verified=true and q.scope='personal_account' and q.status in('processing','failed')
   and q.lease_token=ctx.lease_token and q.lease_until>clock_timestamp()
  ) then raise exception 'Company writes are frozen for deletion' using errcode='23514';end if;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end;$f$;
revoke all on function app_private.guard_company_write_freeze() from public,anon,authenticated,service_role;
-- Materialized install list is checked again by the freeze entry point. A new
-- table without this guard prevents freezing instead of silently claiming coverage.
create or replace view app_private.company_freeze_relations as
with recursive reachable(oid) as (
 select base.oid from (select distinct c.oid,n.nspname,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
join pg_catalog.pg_attribute a on a.attrelid=c.oid
where n.nspname in('public','app_private') and c.relkind in('r','p') and a.attnum>0 and not a.attisdropped
and not(n.nspname='app_private' and c.relname in('company_write_freezes','company_cleanup_context','company_frozen_chat_threads','company_frozen_calendar_users','company_deleted_photo_paths','company_assignment_deletions','company_work_record_deletions','company_site_link_deletions','company_material_deletions','company_receivable_deletions'))
and ((a.attname='company_id' and a.atttypid='uuid'::regtype) or (a.attname='subject_key' and a.atttypid in('text'::regtype,'character varying'::regtype)) or (n.nspname='public' and c.relname='companies' and a.attname='id'))) base
 union
 select fk.conrelid from pg_catalog.pg_constraint fk join reachable parent on parent.oid=fk.confrelid
 join pg_catalog.pg_class c on c.oid=fk.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where fk.contype='f' and n.nspname in('public','app_private') and c.relkind in('r','p')
)
select c.oid,n.nspname,c.relname from reachable r join pg_catalog.pg_class c on c.oid=r.oid join pg_catalog.pg_namespace n on n.oid=c.relnamespace;
revoke all on app_private.company_freeze_relations from public,anon,authenticated,service_role;
do $f$ declare r record;begin
 for r in select * from app_private.company_freeze_relations order by nspname,relname loop
 execute format('drop trigger if exists aaa_company_write_freeze on %I.%I',r.nspname,r.relname);
 execute format('create trigger aaa_company_write_freeze before insert or update or delete on %I.%I for each row execute function app_private.guard_company_write_freeze()',r.nspname,r.relname);
 execute format('drop trigger if exists zzz_company_write_freeze on %I.%I',r.nspname,r.relname);
 execute format('create trigger zzz_company_write_freeze after insert or update or delete on %I.%I for each row execute function app_private.guard_company_write_freeze()',r.nspname,r.relname);
 end loop;
end;$f$;
create or replace function public.freeze_company_direct_writes(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$ declare co uuid;r record;n integer:=0;
begin
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 select company_deletion_id into co from public.account_deletion_requests where id=p_request;
 perform 1 from public.companies where id=co for update;
 perform public.inspect_company_deletion_scope(p_request);
 for r in select * from app_private.company_freeze_relations order by nspname,relname loop
 execute format('lock table %I.%I in share row exclusive mode',r.nspname,r.relname);
 if (select count(*) from pg_catalog.pg_trigger where tgrelid=r.oid and ((tgname='aaa_company_write_freeze' and tgtype=31) or (tgname='zzz_company_write_freeze' and tgtype=29)) and tgenabled='O' and tgfoid='app_private.guard_company_write_freeze()'::regprocedure)<>2 then raise exception 'Company freeze coverage changed';end if;n:=n+1;
 end loop;
 update public.companies set updated_at=clock_timestamp() where id=co;
 insert into app_private.company_write_freezes(company_id,request_id) values(co,p_request) on conflict(company_id) do nothing;
 return jsonb_build_object('companyId',co,'directWritesFrozen',true,'guardedTables',n,'complete',false,'remaining','storage_external_jobs_and_undeclared_references');
end;$f$;
revoke all on function public.freeze_company_direct_writes(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freeze_company_direct_writes(uuid,uuid) to service_role;
commit;
