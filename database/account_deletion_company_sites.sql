begin;
-- Final site metadata phase. Server orchestration must first verify complete
-- file/remote-event removal. Local ledger absence is not remote deletion proof.
create or replace function public.delete_empty_company_sites(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid;u uuid;r record;n bigint;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account' and status in('processing','failed')
 and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 if not exists(select 1 from app_private.company_write_freezes where company_id=co and request_id=p_request)
 or not exists(select 1 from app_private.company_frozen_calendar_users where company_id=co and request_id=p_request and user_id=u) then raise exception 'Company calendar freeze required';end if;
 perform public.inspect_company_deletion_scope(p_request);
 lock table public.sites in share row exclusive mode;
 if exists(select 1 from public.calendar_auto_events where company_id=co or site_id in(select id from public.sites where company_id=co) or company_id is null or site_id is null) then raise exception 'Calendar history remains unresolved';end if;
 if exists(select 1 from public.calendar_auto_connections c join app_private.company_frozen_calendar_users f on f.user_id=c.user_id where f.company_id=co and c.lease_id is not null) then raise exception 'Calendar execution remains';end if;
 if exists(select 1 from storage.objects where co::text=any(string_to_array(name,'/'))) then raise exception 'Company files remain';end if;
 -- Check every declared FK, including CASCADE/SET NULL, composite keys and
 -- unconventional column names. Never silently erase children through CASCADE.
 for r in select fk.conrelid::regclass child,fk.conname,
 (select string_agg(format('c.%I=s.%I',ca.attname,pa.attname),' and ' order by k.ord)
 from unnest(fk.conkey,fk.confkey) with ordinality k(cnum,pnum,ord)
 join pg_catalog.pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=k.cnum
 join pg_catalog.pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=k.pnum) cond
 from pg_catalog.pg_constraint fk where fk.contype='f' and fk.confrelid='public.sites'::regclass order by fk.conrelid,fk.conname loop
 execute format('lock table %s in share row exclusive mode',r.child);
 execute format('select count(*) from %s c join public.sites s on %s where s.company_id=$1',r.child,r.cond) into n using co;
 if n>0 then raise exception 'Site dependent records remain: %',r.conname;end if;
 end loop;
 delete from public.sites where company_id=co;
 if exists(select 1 from public.sites where company_id=co) then raise exception 'Company sites remain';end if;
 if public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.delete_empty_company_sites(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_empty_company_sites(uuid,uuid) to service_role;
-- Only current authorized company cleanup may suppress site-delete sync effects.
do $patch$ declare original text;changed text;
 guard text:=E'\n if tg_op=''DELETE'' and tg_table_schema=''public'' and tg_table_name=''sites'' and exists(select 1 from app_private.company_cleanup_context x join app_private.company_write_freezes f on f.company_id=x.company_id and f.request_id=x.request_id join public.account_deletion_requests q on q.id=x.request_id and q.lease_token=x.lease_token where x.company_id=(to_jsonb(old)->>''company_id'')::uuid and x.transaction_id=txid_current() and x.backend_id=pg_backend_pid() and q.identity_verified=true and q.status in (''processing'',''failed'') and q.lease_until>clock_timestamp()) then return old;end if;\n';
 begin
 original:=pg_get_functiondef('app_private.calendar_auto_changed()'::regprocedure);
 changed:=replace(original,'x.company_id=old.company_id','x.company_id=(to_jsonb(old)->>''company_id'')::uuid');
 if changed<>original then execute changed;original:=changed;end if;
 if position('x.transaction_id=txid_current()' in original)=0 then
 changed:=regexp_replace(original,E'\nbegin\n',E'\nbegin\n'||guard,'i');
 if changed=original then raise exception 'Unrecognized calendar trigger body';end if;execute changed;
 end if;
 end;$patch$;
commit;
