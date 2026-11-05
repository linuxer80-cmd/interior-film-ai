begin;
-- Closed support contract. Unknown tables and embedded file references are
-- blockers, never permission to cascade-delete arbitrary application data.
create or replace function public.inspect_supported_company_deletion(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare u uuid;co uuid;plan jsonb;manifest jsonb;refs jsonb;r record;rowdoc jsonb;v text;n bigint;
 codes text[]:='{}';
 supported text[]:=array['public.profiles','public.sites','public.site_completion_estimates','public.site_consultation_quotes','public.standalone_quotes',
 'public.site_payment_accounts','public.site_payment_entries','public.site_materials','public.site_material_issues','public.site_material_returns','public.site_material_return_history',
 'public.film_stock_trips','public.film_stock_rolls','public.film_stock_events','public.film_roll_purchases','app_private.film_trip_costs','app_private.actual_material_manual_prices',
 'public.work_report_history','public.work_reports','public.attendance_corrections','public.worker_badge_commutes','public.attendance_records','public.attendance_locations','public.site_expenses',
 'public.labor_jobs','public.site_daily_assignments','public.site_workers','public.worker_assignment_wages','public.worker_assignment_alerts','public.worker_schedule_reminders','public.worker_commute_cache',
 'public.owner_work_days','public.owner_site_participation','public.worker_team_messages','public.site_change_events','app_private.worker_alert_snapshots',
 'public.alimtalk_deliveries','public.customer_schedule_alerts','public.customer_site_portals','public.consultation_registration_requests','public.trade_site_links',
 'public.trade_requests','public.trade_contacts','public.trade_clients','public.site_photos','public.site_extra_work','public.customer_photo_submissions',
 'public.estimate_result_cache','public.estimate_cache_revisions',
 'app_private.company_deleted_photo_paths','app_private.company_receivable_deletions','app_private.company_material_deletions','app_private.company_work_record_deletions',
 'app_private.company_assignment_deletions','app_private.company_site_link_deletions','app_private.company_write_freezes','app_private.company_cleanup_context',
 'app_private.company_frozen_chat_threads','app_private.company_frozen_calendar_users'];
begin
 select coalesce(user_id,subject_id),company_deletion_id into u,co from public.account_deletion_requests where id=p_request;
 if u is null or co is null or public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then raise exception 'Company deletion lease required';end if;
 plan:=public.inspect_company_deletion_scope(p_request);
 if (plan->>'company_id')::uuid is distinct from co then raise exception 'Company scope mismatch';end if;
 if public.account_deletion_shared_auth_check(u) then codes:=array_append(codes,'shared_auth');end if;
 for rowdoc in select value from jsonb_array_elements(plan->'direct_records') loop
  if not ((rowdoc->>'schema')||'.'||(rowdoc->>'table'))=any(supported) then codes:=array_append(codes,'unsupported_company_records');end if;
 end loop;
 manifest:=public.inspect_company_deletion_files(p_request);
 -- A path segment identifying this company in any other bucket/prefix must not
 -- disappear from the inventory merely because the prefix is unfamiliar.
 if exists(select 1 from storage.objects o where co::text=any(string_to_array(o.name,'/'))
 and not exists(select 1 from jsonb_array_elements(manifest->'files') f where f->>'bucket'=o.bucket_id and f->>'path'=o.name)) then codes:=array_append(codes,'unsupported_company_files');end if;
 -- Inspect every company-owned row, including arbitrary nested JSON. This first
 -- automatic contract accepts canonical raw work-photo paths only; URL aliases,
 -- legacy paths, embedded links and other attachment formats require review.
 for r in select ns.nspname,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
 join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='company_id' and a.atttypid='uuid'::regtype and not a.attisdropped
 where ns.nspname in('public','app_private') and c.relkind in('r','p') and c.relname<>'profiles' loop
  for rowdoc in execute format('select to_jsonb(t) from %I.%I t where company_id=$1',r.nspname,r.relname) using co loop
   for v in select value#>>'{}' from jsonb_path_query(rowdoc,'strict $.** ? (@.type() == "string")') as strings(value) loop
    if v ~ '[/\\%]' and not (v ~ ('^(sites|history|hierarchy|door-test|estimate-usage|extra-work)/'||co::text||'/[^%\\[:cntrl:]]+$')
     and not exists(select 1 from unnest(string_to_array(v,'/')) part where part in('','.', '..'))) then codes:=array_append(codes,'embedded_company_files_require_review');end if;
   end loop;
  end loop;
 end loop;
 if exists(select 1 from public.companies c where id=co and to_jsonb(c)::text ~ '(https?://|storage/v1|customer/|leads/)')
 or exists(select 1 from public.profiles p where id=u and to_jsonb(p)::text ~ '(https?://|storage/v1|work-photos|customer/|leads/)') then codes:=array_append(codes,'profile_scope_requires_review');end if;
 -- A different tenant's row pointing into this company's sites is not owned by
 -- this request. Also detect dependent tables with no company_id of their own.
 for r in select ns.nspname,c.relname,a.attname from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
 join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace where ns.nspname in('public','app_private') and c.relkind in('r','p')
 and a.attname in('site_id','linked_site_id') and a.atttypid='uuid'::regtype and not a.attisdropped loop
  execute format('select count(*) from %I.%I t join public.sites s on s.id=t.%I where s.company_id=$1 and (not ($2) or to_jsonb(t)->>''company_id'' is distinct from $1::text)',r.nspname,r.relname,r.attname)
  into n using co,(r.nspname||'.'||r.relname)=any(supported);
  if n>0 then codes:=array_append(codes,'unsupported_company_dependencies');end if;
 end loop;
 if exists(select 1 from public.site_completion_estimates where company_id=co and not app_private.deletion_quote_document_safe(document,'cost'))
 or exists(select 1 from public.site_consultation_quotes where company_id=co and not app_private.deletion_quote_document_safe(document,'area'))
 or exists(select 1 from public.standalone_quotes where company_id=co and (not app_private.deletion_quote_document_safe(area_document,'area') or not app_private.deletion_quote_document_safe(cost_document,'cost'))) then codes:=array_append(codes,'unsupported_quote_document');end if;
 refs:=public.inspect_account_deletion_references(u);
 for rowdoc in select value from jsonb_array_elements(refs) loop
  if rowdoc->>'schema'='public' and rowdoc->>'table' in('profiles','account_deletion_requests','account_deletion_blocks') then continue;end if;
  if not ((rowdoc->>'schema')||'.'||(rowdoc->>'table'))=any(supported) then codes:=array_append(codes,'linked_records_require_review');continue;end if;
  execute format('select count(*) from %I.%I t where %I=$1 and to_jsonb(t)->>''company_id'' is distinct from $2::text',rowdoc->>'schema',rowdoc->>'table',rowdoc->>'column') into n using u,co;
  if n>0 then codes:=array_append(codes,'foreign_personal_records_require_review');end if;
 end loop;
 if exists(select 1 from storage.objects o where position(u::text in to_jsonb(o)::text)>0
 and not(o.bucket_id='labor-avatars' and o.name ~ ('^'||u::text||'/[0-9a-fA-F-]{36}\.(jpg|png|webp)$'))
 and not exists(select 1 from jsonb_array_elements(manifest->'files') f where f->>'bucket'=o.bucket_id and f->>'path'=o.name)) then codes:=array_append(codes,'unsupported_personal_files');end if;
 select coalesce(array_agg(distinct code),'{}') into codes from unnest(codes) code;
 return jsonb_build_object('subjectId',u,'companyId',co,'eligible',cardinality(codes)=0,'codes',codes,
 'manifest',manifest||jsonb_build_object('complete',cardinality(codes)=0));
end;$f$;
revoke all on function public.inspect_supported_company_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inspect_supported_company_deletion(uuid,uuid) to service_role;
commit;
