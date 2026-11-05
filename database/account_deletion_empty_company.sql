begin;
alter table public.account_deletion_requests add column if not exists company_record_deleted_at timestamptz;
-- Final DB phase only, not a declaration that all personal data/files are gone.
-- The full executor must first establish a complete file inventory and freeze.
create or replace function public.delete_empty_company_record(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid; u uuid; r record; n bigint; company_exists boolean;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account'
 and status in('processing','failed') and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform 1 from public.companies where id=co for update;
 company_exists:=found;
 -- Lock participating tables in stable order before the final inventory, so
 -- concurrent writes cannot land between its count and this transaction's delete.
 for r in select distinct ns.nspname,c.relname
 from pg_catalog.pg_class c join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
 join pg_catalog.pg_attribute a on a.attrelid=c.oid
 where ns.nspname in('public','app_private') and c.relkind in('r','p') and a.attnum>0 and not a.attisdropped
 and ((a.attname='company_id' and a.atttypid='uuid'::regtype) or (a.attname='subject_key' and a.atttypid in('text'::regtype,'character varying'::regtype)))
 order by ns.nspname,c.relname loop
 execute format('lock table %I.%I in share row exclusive mode',r.nspname,r.relname);
 end loop;
 if company_exists then
 if not exists(select 1 from public.profiles where id=u and company_id=co and role='owner') then raise exception 'Company ownership changed';end if;
 if exists(select 1 from public.profiles where company_id=co and id<>u and role='owner' and is_active=true) then raise exception 'Another active owner remains';end if;
 end if;
 -- Photo/work-item DELETE triggers create a final revision; remove these derived caches only after all writers are locked.
 delete from public.estimate_result_cache where company_id=co;
 delete from public.estimate_cache_revisions where company_id=co;
 for r in select ns.nspname,c.relname,a.attname
 from pg_catalog.pg_class c join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace join pg_catalog.pg_attribute a on a.attrelid=c.oid
 where ns.nspname in('public','app_private') and c.relkind in('r','p') and a.attnum>0 and not a.attisdropped
 and not(ns.nspname='public' and c.relname='profiles')
 and not(ns.nspname='app_private' and c.relname in('company_deleted_photo_paths','company_receivable_deletions','company_material_deletions','company_work_record_deletions','company_assignment_deletions','company_site_link_deletions','company_write_freezes','company_cleanup_context','company_frozen_chat_threads','company_frozen_calendar_users'))
 and ((a.attname='company_id' and a.atttypid='uuid'::regtype) or (a.attname='subject_key' and a.atttypid in('text'::regtype,'character varying'::regtype))) loop
 if r.attname='company_id' then execute format('select count(*) from %I.%I where %I=$1',r.nspname,r.relname,r.attname) into n using co;
 else execute format('select count(*) from %I.%I where %I=$1',r.nspname,r.relname,r.attname) into n using 'company:'||co::text;end if;
 if n>0 then raise exception 'Company records remain';end if;
 end loop;
 if exists(select 1 from pg_catalog.pg_constraint where contype='f' and confrelid='public.companies'::regclass and cardinality(conkey)<>1) then raise exception 'Composite company reference requires review';end if;
 -- Also detect foreign keys named differently from company_id. Do not rely on
 -- cascade behavior to quietly remove unreviewed rows.
 for r in select ns.nspname,c.relname,a.attname from pg_catalog.pg_constraint fk
 join pg_catalog.pg_class c on c.oid=fk.conrelid join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
 join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum=fk.conkey[1]
 where fk.contype='f' and fk.confrelid='public.companies'::regclass and cardinality(fk.conkey)=1
 and fk.conrelid<>'public.profiles'::regclass loop
 execute format('lock table %I.%I in share row exclusive mode',r.nspname,r.relname);
 execute format('select count(*) from %I.%I where %I=$1',r.nspname,r.relname,r.attname) into n using co;
 if n>0 then raise exception 'Company references remain';end if;
 end loop;
 if exists(select 1 from storage.objects where co::text=any(string_to_array(name,'/'))) then raise exception 'Company files remain';end if;
 if not public.assert_account_deletion_lease(p_request,p_lease,u) then raise exception 'Deletion lease expired';end if;
 -- profiles.company_id is ON DELETE SET NULL; retain every personal profile/Auth.
 if company_exists then
 update public.profiles set company_id=null where company_id=co;
 delete from public.companies where id=co;
 end if;
 if exists(select 1 from public.companies where id=co) or exists(select 1 from public.profiles where company_id=co) then raise exception 'Company deletion not verified';end if;
 if not public.assert_account_deletion_lease(p_request,p_lease,u) then raise exception 'Deletion lease expired';end if;
 update public.account_deletion_requests set company_record_deleted_at=coalesce(company_record_deleted_at,clock_timestamp()) where id=p_request;
 return true;
end;$f$;
revoke all on function public.delete_empty_company_record(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_empty_company_record(uuid,uuid) to service_role;
commit;
