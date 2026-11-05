begin;
create table if not exists app_private.company_material_deletions(company_id uuid primary key,request_id uuid not null,created_at timestamptz not null default now());
alter table app_private.company_material_deletions enable row level security;
revoke all on app_private.company_material_deletions from public,anon,authenticated,service_role;
create or replace function app_private.guard_deleted_company_materials()
returns trigger language plpgsql security definer set search_path=''
as $f$ begin
 if exists(select 1 from app_private.company_material_deletions where company_id=new.company_id)
 or (tg_op='UPDATE' and exists(select 1 from app_private.company_material_deletions where company_id=old.company_id)) then
 raise exception 'Company materials are being deleted' using errcode='23514';end if;return new;
end;$f$;
revoke all on function app_private.guard_deleted_company_materials() from public,anon,authenticated;
do $f$ declare t text;begin foreach t in array array['public.site_materials','public.site_material_issues','public.site_material_returns','public.site_material_return_history','public.film_stock_trips','public.film_stock_rolls','public.film_stock_events','public.film_roll_purchases','app_private.film_trip_costs','app_private.actual_material_manual_prices'] loop
 execute format('drop trigger if exists guard_deleted_company_materials on %s',t);
 execute format('create trigger guard_deleted_company_materials before insert or update on %s for each row execute function app_private.guard_deleted_company_materials()',t);
end loop;end;$f$;
create or replace function public.delete_company_materials(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid; u uuid; r record; n bigint; t text;
 targets text[]:=array['app_private.film_trip_costs','public.film_stock_trips','public.site_material_return_history','public.site_material_returns','public.site_material_issues','app_private.actual_material_manual_prices','public.site_materials','public.film_roll_purchases','public.film_stock_events','public.film_stock_rolls'];
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account' and status in('processing','failed')
 and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform 1 from public.companies where id=co for update;
 perform public.inspect_company_deletion_scope(p_request);
 lock table public.sites in share row exclusive mode;
 for t in select x from unnest(targets) x order by x loop execute format('lock table %s in share row exclusive mode',t);end loop;
 -- Validate tenant ownership across both ends of every declared FK involving
 -- these records, including composite FKs. Never consume another company's roll.
 for r in select fk.conrelid::regclass child,fk.confrelid::regclass parent,
 (select string_agg(format('c.%I=p.%I',ca.attname,pa.attname),' and ' order by keys.ord)
 from unnest(fk.conkey,fk.confkey) with ordinality keys(cnum,pnum,ord)
 join pg_catalog.pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=keys.cnum
 join pg_catalog.pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=keys.pnum) cond
 from pg_catalog.pg_constraint fk where fk.contype='f'
 and (fk.conrelid=any(array(select x::regclass from unnest(targets) x)) or fk.confrelid=any(array(select x::regclass from unnest(targets) x)))
 and exists(select 1 from pg_catalog.pg_attribute where attrelid=fk.conrelid and attname='company_id' and not attisdropped)
 and exists(select 1 from pg_catalog.pg_attribute where attrelid=fk.confrelid and attname='company_id' and not attisdropped) loop
 execute format('select count(*) from %s c join %s p on %s where (c.company_id=$1 or p.company_id=$1) and c.company_id is distinct from p.company_id',r.child,r.parent,r.cond) into n using co;
 if n>0 then raise exception 'Cross-company material reference requires review';end if;
 end loop;
 insert into app_private.company_material_deletions(company_id,request_id) values(co,p_request) on conflict(company_id) do nothing;
 if not exists(select 1 from app_private.company_material_deletions where company_id=co and request_id=p_request) then raise exception 'Company deletion request mismatch';end if;
 foreach t in array targets loop execute format('delete from %s where company_id=$1',t) using co;end loop;
 foreach t in array targets loop execute format('select count(*) from %s where company_id=$1',t) into n using co;if n>0 then raise exception 'Material cleanup not verified';end if;end loop;
 if not public.assert_account_deletion_lease(p_request,p_lease,u) then raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.delete_company_materials(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_company_materials(uuid,uuid) to service_role;
commit;
