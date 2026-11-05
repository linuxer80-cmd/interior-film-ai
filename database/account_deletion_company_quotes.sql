begin;
-- Conservative closed schema for documents emitted by the current quote APIs.
-- Unknown keys, nested values and path/URL syntax require review before deletion.
create or replace function app_private.deletion_quote_document_safe(doc jsonb,kind text)
returns boolean language plpgsql immutable set search_path=''
as $f$ declare allowed text[];kv record;item jsonb;child text;
begin
 if doc is null or doc='null'::jsonb then return true;end if;
 if jsonb_typeof(doc)<>'object' then return false;end if;
 allowed:=case kind
 when 'area' then array['title','company_name','business_number','company_phone','customer_name','customer_phone','address','work_date','duration','customer_note','other_schedule','footer','vat','items']
 when 'cost' then array['items','pending_items','header','vat','useDefaultNote','note']
 when 'header' then array['company_name','representative','company_phone','business_number','customer_name','site_name','address','work_date','issued_date','crew_count','person_days','bank_account']
 when 'area_item' then array['name','detail','unit','film_no','note','quantity','unit_price']
 when 'cost_item' then array['unit_price','category','name','quantity','unit','amount']
 when 'pending_item' then array['unit_price','category','name','quantity','unit','amount','_position']
 else null end;
 if allowed is null then return false;end if;
 for kv in select key,value from jsonb_each(doc) loop
  if not kv.key=any(allowed) then return false;end if;
  if kind='cost' and kv.key='header' then
   if jsonb_typeof(kv.value)<>'object' or not app_private.deletion_quote_document_safe(kv.value,'header') then return false;end if;
  elsif kind in('area','cost') and kv.key in('items','pending_items') then
   if jsonb_typeof(kv.value)<>'array' then return false;end if;
   child:=case when kind='area' then 'area_item' when kv.key='pending_items' then 'pending_item' else 'cost_item' end;
   for item in select value from jsonb_array_elements(kv.value) loop
    if jsonb_typeof(item)<>'object' or not app_private.deletion_quote_document_safe(item,child) then return false;end if;
   end loop;
  else
   if jsonb_typeof(kv.value) not in('string','number','boolean','null') then return false;end if;
   if jsonb_typeof(kv.value)='string' and (kv.value#>>'{}') ~ '[/\\:%]' then return false;end if;
  end if;
 end loop;
 return true;
end;$f$;
revoke all on function app_private.deletion_quote_document_safe(jsonb,text) from public,anon,authenticated,service_role;
create or replace function public.delete_company_quote_records(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid;u uuid;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account' and status in('processing','failed')
 and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 if not exists(select 1 from app_private.company_write_freezes where company_id=co and request_id=p_request) then raise exception 'Company write freeze required';end if;
 perform public.inspect_company_deletion_scope(p_request);
 lock table public.sites,public.site_completion_estimates,public.site_consultation_quotes,public.standalone_quotes in share row exclusive mode;
 if exists(select 1 from (
  select company_id,site_id from public.site_completion_estimates union all
  select company_id,site_id from public.site_consultation_quotes union all
  select company_id,linked_site_id from public.standalone_quotes
 ) q left join public.sites s on s.id=q.site_id
 where q.site_id is not null and (q.company_id=co or s.company_id=co) and q.company_id is distinct from s.company_id) then raise exception 'Cross-company quote site reference';end if;
 if exists(select 1 from public.site_completion_estimates where company_id=co and not app_private.deletion_quote_document_safe(document,'cost'))
 or exists(select 1 from public.site_consultation_quotes where company_id=co and not app_private.deletion_quote_document_safe(document,'area'))
 or exists(select 1 from public.standalone_quotes where company_id=co and (not app_private.deletion_quote_document_safe(area_document,'area') or not app_private.deletion_quote_document_safe(cost_document,'cost'))) then raise exception 'Unresolved quote document requires review';end if;
 delete from public.site_completion_estimates where company_id=co;
 delete from public.site_consultation_quotes where company_id=co;
 delete from public.standalone_quotes where company_id=co;
 if exists(select 1 from public.site_completion_estimates where company_id=co) or exists(select 1 from public.site_consultation_quotes where company_id=co) or exists(select 1 from public.standalone_quotes where company_id=co) then raise exception 'Quote records remain';end if;
 if public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.delete_company_quote_records(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_company_quote_records(uuid,uuid) to service_role;
commit;
