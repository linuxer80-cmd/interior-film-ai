begin;
create or replace function public.register_admin_photo_hierarchy(p_user uuid,p_photo uuid,p_item uuid,p_path text,p_hash text,p_stage text,p_targets jsonb,p_memo text)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare co uuid; prior public.photo_case_classifications%rowtype; saved public.photo_case_classifications%rowtype; total numeric; category text;
begin
 select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id
 where p.id=p_user and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
 if co is null then raise exception '활성 업체 관리자만 등록할 수 있습니다.' using errcode='42501'; end if;
 if p_stage not in ('before','after','unknown') or jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) not between 1 and 20 then
 raise exception '사진 상태와 분류를 확인해주세요.' using errcode='22023'; end if;
 if p_path is distinct from 'hierarchy/'||co::text||'/'||p_photo::text||'.jpg' then raise exception '사진 경로를 확인해주세요.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_photo::text,0));
 select c.* into prior from public.photo_case_classifications c where c.photo_id=p_photo;
 if found then
  if prior.company_id=co and prior.targets=p_targets and prior.photo_stage=p_stage and exists(select 1 from public.work_photos where id=p_photo and image_hash=p_hash) then
   return jsonb_build_object('photoId',p_photo,'reused',true);
  end if;
  raise exception '이미 등록된 사진입니다. 시공 DB를 확인해주세요.' using errcode='40001';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='work-photos' and name=p_path) then raise exception '사진 업로드를 확인해주세요.' using errcode='22023'; end if;
 select case when count(*) filter(where t->>'price' is null)>0 then null else sum((t->>'price')::numeric) end into total from jsonb_array_elements(p_targets)t;
 select string_agg(distinct t->>'part',' · ') into category from jsonb_array_elements(p_targets)t;
 insert into public.work_items(id,company_id,project_id,category,sub_category,actual_cost,case_profile,memo)
 values(p_item,co,'d9a21463-1f8f-452a-9dd0-cdc69ebfa27f',category,category,total,jsonb_build_object('hierarchy_version',1,'targets',p_targets),left(p_memo,2000));
 insert into public.work_photos(id,company_id,project_id,work_item_id,storage_path,photo_type,category,sub_category,image_hash)
 values(p_photo,co,'d9a21463-1f8f-452a-9dd0-cdc69ebfa27f',p_item,p_path,case when p_stage='unknown' then 'history' else p_stage end,category,category,p_hash);
 insert into public.photo_case_classifications(photo_id,company_id,photo_stage,targets,review_status,updated_by)
 values(p_photo,co,p_stage,p_targets,'reviewed',p_user) returning * into saved;
 insert into public.photo_case_classification_history(photo_id,actor,next_value) values(p_photo,p_user,to_jsonb(saved));
 return jsonb_build_object('photoId',p_photo,'targets',jsonb_array_length(p_targets),'reused',false);
end $function$;
revoke all on function public.register_admin_photo_hierarchy(uuid,uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.register_admin_photo_hierarchy(uuid,uuid,uuid,text,text,text,jsonb,text) to service_role;
commit;
