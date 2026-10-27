create or replace function public.supplement_consultation_text(old_value text,new_value text)
returns text language sql immutable set search_path='' as $$
 select case when nullif(btrim(new_value),'') is null then coalesce(old_value,'')
 when nullif(btrim(old_value),'') is null then btrim(new_value)
 when position(btrim(new_value) in old_value)>0 then old_value
 else old_value || E'\n' || btrim(new_value) end;
$$;
revoke all on function public.supplement_consultation_text(text,text) from public,anon,authenticated;
grant execute on function public.supplement_consultation_text(text,text) to service_role;

create or replace function public.supplement_consultation_items(old_items jsonb,new_items jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 result jsonb:=coalesce(nullif(old_items,'null'::jsonb),'[]'::jsonb);
 item jsonb; previous jsonb; idx int; matching int; field text; note text;
begin
 if jsonb_typeof(result)<>'array' or jsonb_typeof(new_items)<>'array' then
  raise exception '견적 항목을 확인해주세요.' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(new_items) loop
  if jsonb_typeof(item)<>'object' or nullif(btrim(item->>'name'),'') is null then continue; end if;
  item:=item || jsonb_build_object('unit_price','');
  matching:=null; idx:=0;
  for previous in select value from jsonb_array_elements(result) loop
   if public.consultation_match_key(previous->>'name')=public.consultation_match_key(item->>'name')
    and (coalesce(previous->>'film_no','')='' or coalesce(item->>'film_no','')=''
      or public.consultation_match_key(previous->>'film_no')=public.consultation_match_key(item->>'film_no')) then
     matching:=idx;exit;
   end if;
   idx:=idx+1;
  end loop;
  if matching is null then result:=result || jsonb_build_array(item);
  else
   note:=public.supplement_consultation_text(previous->>'note',item->>'note');
   foreach field in array array['quantity','unit','film_no'] loop
    if coalesce(previous->>field,'')='' then
     previous:=previous || jsonb_build_object(field,coalesce(item->>field,''));
    elsif coalesce(item->>field,'')<>'' and previous->>field<>item->>field then
     note:=public.supplement_consultation_text(note,'추가 상담 확인: ' ||
       case field when 'quantity' then '수량' when 'unit' then '단위' else '필름' end || ' ' || (item->>field) || ' (기존 값 유지)');
    end if;
   end loop;
   previous:=previous || jsonb_build_object('detail',public.supplement_consultation_text(previous->>'detail',item->>'detail'),'note',note);
   result:=jsonb_set(result,array[matching::text],previous);
  end if;
 end loop;
 if jsonb_array_length(result)>60 then raise exception '견적 항목은 60개까지 저장할 수 있습니다.' using errcode='22023';end if;
 return result;
end $$;
revoke all on function public.supplement_consultation_items(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.supplement_consultation_items(jsonb,jsonb) to service_role;

-- API-authenticated, atomic supplementation. Never change workflow status or stock quantities.
create or replace function public.supplement_site_consultation(
 p_user uuid,p_site uuid,p_request uuid,p_expected timestamptz,
 p_patch jsonb,p_materials jsonb,p_fingerprint text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 co uuid;
 s public.sites%rowtype;
 updated public.sites%rowtype;
 cached public.consultation_registration_requests%rowtype;
 quote public.site_consultation_quotes%rowtype;
 patch jsonb:=p_patch;
 seed jsonb;
 material jsonb;
 was_cached boolean:=false;
begin
 select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id
 where p.id=p_user and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
 if co is null then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if p_request is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(patch) is distinct from 'object' or octet_length(patch::text)>200000
 or jsonb_typeof(p_materials) is distinct from 'array' or jsonb_array_length(p_materials)>60 then
  raise exception '상담 저장 요청을 확인해주세요.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_object_keys(patch) k where k not in (
  'customer_name','customer_phone','site_name','address','address_detail','region',
  'contract_amount','deposit_amount','work_type','work_description','memo',
  'work_dates','schedule_date','schedule_start','schedule_end','consultation_quote_seed')) then
  raise exception '추가 상담으로 변경할 수 없는 항목입니다.' using errcode='22023';
 end if;
 select * into s from public.sites where id=p_site and company_id=co for update;
 if not found then raise exception '소속 현장을 확인해주세요.' using errcode='42501'; end if;
 select * into cached from public.consultation_registration_requests where company_id=co and request_id=p_request;
 if found then
  if cached.user_id<>p_user or cached.site_id<>p_site or cached.payload_hash<>p_fingerprint then
   raise exception '저장 요청이 다른 내용으로 사용되었습니다. 입력 내용을 다시 확인해주세요.' using errcode='23505';
  end if;
  was_cached:=true;
 else
  if s.updated_at is distinct from p_expected then
   raise exception '다른 화면에서 현장이 변경됐습니다. 다시 저장하면 최신 내용에 추가합니다.' using errcode='40001';
  end if;
  if patch ? 'consultation_quote_seed' then
   seed:=coalesce(s.consultation_quote_seed,'{}'::jsonb) || jsonb_build_object(
    'items',public.supplement_consultation_items(s.consultation_quote_seed->'items',patch->'consultation_quote_seed'->'items'),
    'other_schedule',public.supplement_consultation_text(s.consultation_quote_seed->>'other_schedule',patch->'consultation_quote_seed'->>'other_schedule'));
   patch:=jsonb_set(patch,'{consultation_quote_seed}',seed);
  end if;
  updated:=jsonb_populate_record(s,patch);
  if patch<>'{}'::jsonb then
   update public.sites set customer_name=updated.customer_name,customer_phone=updated.customer_phone,
    site_name=updated.site_name,address=updated.address,address_detail=updated.address_detail,region=updated.region,
    work_type=updated.work_type,work_description=updated.work_description,memo=updated.memo,
    contract_amount=updated.contract_amount,deposit_amount=updated.deposit_amount,
    work_dates=updated.work_dates,schedule_date=updated.schedule_date,schedule_start=updated.schedule_start,schedule_end=updated.schedule_end,
    consultation_quote_seed=updated.consultation_quote_seed,updated_at=clock_timestamp()
   where id=p_site and company_id=co returning * into s;
  end if;
  if seed is not null then
   select * into quote from public.site_consultation_quotes where site_id=p_site and company_id=co for update;
   if found then
    update public.site_consultation_quotes set
     document=jsonb_set(document,'{items}',public.supplement_consultation_items(document->'items',seed->'items')),
     revision=revision+1,updated_at=clock_timestamp() where site_id=p_site and company_id=co;
   end if;
  end if;
  for material in select value from jsonb_array_elements(p_materials) loop
   perform public.add_planned_material_once(p_user,p_site,material || jsonb_build_object('id',gen_random_uuid()));
  end loop;
  insert into public.consultation_registration_requests(company_id,request_id,user_id,payload_hash,site_id,merged)
   values(co,p_request,p_user,p_fingerprint,p_site,true);
 end if;
 return jsonb_build_object('success',true,'merged',true,'cached',was_cached,'site',to_jsonb(s),
  'materials',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from public.site_materials m
   where m.company_id=co and m.site_id=p_site and m.removed_at is null),'[]'::jsonb));
end $$;
revoke all on function public.supplement_site_consultation(uuid,uuid,uuid,timestamptz,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.supplement_site_consultation(uuid,uuid,uuid,timestamptz,jsonb,jsonb,text) to service_role;
