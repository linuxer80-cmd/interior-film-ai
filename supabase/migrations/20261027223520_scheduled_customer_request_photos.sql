-- Allow customer request photos while consulting or scheduled. Keep existing token, tenant, quota and atomic notification checks.
create or replace function public.reserve_customer_photo_submission(p_token uuid,p_id uuid,p_fingerprint text,p_note text,p_count integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.customer_site_portals%rowtype; s public.sites%rowtype; b public.customer_photo_submissions%rowtype;
  daily_count integer; total_count integer; recent_batches integer;
begin
  if p_id is null or p_token is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_note is null or char_length(p_note)>500 or p_count is null or p_count not between 1 and 10 then
    raise exception 'Invalid photo submission' using errcode='22023';
  end if;
  select * into p from public.customer_site_portals where token_id=p_token;
  if not found then raise exception 'Invalid portal' using errcode='42501'; end if;
  -- Serialize quotas and status transitions for this site; a rotation is checked again below.
  select * into s from public.sites where id=p.site_id and company_id=p.company_id for update;
  if not found then raise exception 'Invalid site' using errcode='42501'; end if;
  select * into p from public.customer_site_portals where token_id=p_token and site_id=s.id and company_id=s.company_id and expires_at>clock_timestamp() for share;
  if not found then raise exception 'Expired portal' using errcode='42501'; end if;
  perform 1 from public.companies where id=p.company_id and is_active=true for share;
  if not found then raise exception 'Inactive company' using errcode='42501'; end if;
  select * into b from public.customer_photo_submissions where id=p_id;
  if found then
    if b.company_id<>p.company_id or b.site_id<>p.site_id or b.portal_token_id<>p_token or b.fingerprint<>p_fingerprint or b.note<>p_note or b.photo_count<>p_count then
      raise exception 'Submission conflict' using errcode='23505';
    end if;
    if b.status='completed' then return jsonb_build_object('status',b.status,'site_id',b.site_id,'company_id',b.company_id,'photo_count',b.photo_count); end if;
    if b.created_at<clock_timestamp()-interval '1 day' then raise exception 'Expired submission' using errcode='42501'; end if;
  end if;
  if (s.status is null or s.status not in ('consulting','scheduled')) then raise exception 'Pre-construction photos only' using errcode='42501'; end if;
  if b.id is null then
    select coalesce(sum(photo_count) filter(where created_at>clock_timestamp()-interval '1 day'),0),
      coalesce(sum(photo_count),0),count(*) filter(where created_at>clock_timestamp()-interval '1 minute')
      into daily_count,total_count,recent_batches
      from public.customer_photo_submissions where company_id=p.company_id and site_id=p.site_id;
    if daily_count+p_count>100 or total_count+p_count>500 or recent_batches>=6 then
      raise exception 'Photo submission limit' using errcode='P0001';
    end if;
    insert into public.customer_photo_submissions(id,company_id,site_id,portal_token_id,fingerprint,note,photo_count)
      values(p_id,p.company_id,p.site_id,p_token,p_fingerprint,p_note,p_count) returning * into b;
  end if;
  return jsonb_build_object('status',b.status,'site_id',b.site_id,'company_id',b.company_id,'photo_count',b.photo_count);
end;
$$;
revoke all on function public.reserve_customer_photo_submission(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_customer_photo_submission(uuid,uuid,text,text,integer) to service_role;

create or replace function public.complete_customer_photo_submission(p_token uuid,p_id uuid,p_fingerprint text,p_photos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.customer_site_portals%rowtype; s public.sites%rowtype; b public.customer_photo_submissions%rowtype;
  item record; photo_id uuid; expected_path text; ids uuid[]:='{}';
begin
  select * into p from public.customer_site_portals where token_id=p_token;
  if not found then raise exception 'Invalid portal' using errcode='42501'; end if;
  select * into s from public.sites where id=p.site_id and company_id=p.company_id for share;
  if not found then raise exception 'Invalid site' using errcode='42501'; end if;
  select * into p from public.customer_site_portals where token_id=p_token and site_id=s.id and company_id=s.company_id and expires_at>clock_timestamp() for share;
  if not found then raise exception 'Expired portal' using errcode='42501'; end if;
  perform 1 from public.companies where id=p.company_id and is_active=true for share;
  if not found then raise exception 'Inactive company' using errcode='42501'; end if;
  select * into b from public.customer_photo_submissions where id=p_id and company_id=p.company_id and site_id=p.site_id and portal_token_id=p_token for update;
  if not found or p_fingerprint is null or b.fingerprint<>p_fingerprint then raise exception 'Invalid submission' using errcode='42501'; end if;
  if b.status='completed' then return jsonb_build_object('photo_count',b.photo_count,'duplicate',true); end if;
  if (s.status is null or s.status not in ('consulting','scheduled')) or b.created_at<clock_timestamp()-interval '1 day' then raise exception 'Pre-construction photos only' using errcode='42501'; end if;
  if jsonb_typeof(p_photos) is distinct from 'array' then raise exception 'Invalid photos' using errcode='22023'; end if;
  if jsonb_array_length(p_photos)<>b.photo_count then raise exception 'Missing photos' using errcode='22023'; end if;
  for item in select value,ordinality from jsonb_array_elements(p_photos) with ordinality loop
    expected_path:='sites/'||p.company_id||'/'||p.site_id||'/request/customer-'||p_id||'-'||(item.ordinality-1)||'.jpg';
    photo_id:=(item.value->>'id')::uuid;
    if photo_id is null or (item.value->>'storage_path') is distinct from expected_path or not exists(
      select 1 from storage.objects where bucket_id='work-photos' and name=expected_path
    ) then raise exception 'Photo not uploaded to this site' using errcode='22023'; end if;
    insert into public.site_photos(id,company_id,site_id,photo_type,storage_path,photo_url,description)
      values(photo_id,p.company_id,p.site_id,'request',expected_path,null,
        '고객 상담 사진'||case when b.note<>'' then E'\n'||b.note else '' end);
    ids:=array_append(ids,photo_id);
  end loop;
  update public.customer_photo_submissions set status='completed',photo_ids=ids,completed_at=clock_timestamp() where id=p_id;
  -- The existing notification trigger dispatches the app push after this transaction commits.
  insert into public.notifications(company_id,recipient_type,type,priority,title,message,link,reference_type,reference_id,dedupe_key)
    values(p.company_id,'company_admin','customer_request_photos','info','고객 요청사진 도착',
      coalesce(nullif(s.site_name,''),'상담 현장')||' · 고객이 시공할 부위 사진 '||b.photo_count||'장을 보냈습니다.',
      '/admin?tab=sites&site='||p.site_id||'&section=photos','site',p.site_id::text,'customer-request-photos:'||p_id);
  return jsonb_build_object('photo_count',b.photo_count,'duplicate',false);
end;
$$;
revoke all on function public.complete_customer_photo_submission(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_customer_photo_submission(uuid,uuid,text,jsonb) to service_role;
