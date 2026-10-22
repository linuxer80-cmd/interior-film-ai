begin;
create table if not exists public.photo_case_classifications (
 photo_id uuid primary key references public.work_photos(id) on delete restrict,
 company_id uuid not null references public.companies(id),
 version integer not null default 1 check(version=1),
 photo_stage text not null default 'unknown' check(photo_stage in ('before','after','unknown')),
 targets jsonb not null default '[]'::jsonb check(jsonb_typeof(targets)='array' and jsonb_array_length(targets)<=20),
 review_status text not null default 'draft' check(review_status in ('draft','reviewed','excluded')),
 revision integer not null default 1 check(revision>0),
 updated_by uuid not null,
 updated_at timestamptz not null default now()
);
create index if not exists photo_case_classifications_company_status on public.photo_case_classifications(company_id,review_status);
create table if not exists public.photo_case_classification_history (
 id bigint generated always as identity primary key,
 photo_id uuid not null references public.work_photos(id) on delete restrict,
 actor uuid not null,
 previous_value jsonb,
 next_value jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.photo_case_classifications enable row level security;
alter table public.photo_case_classification_history enable row level security;
revoke all on public.photo_case_classifications,public.photo_case_classification_history from public,anon,authenticated;
grant select,insert,update on public.photo_case_classifications to service_role;
grant select,insert on public.photo_case_classification_history to service_role;
grant usage,select on sequence public.photo_case_classification_history_id_seq to service_role;
create or replace view public.photo_case_management with (security_invoker=true) as
select p.id,p.company_id,p.work_item_id,p.storage_path,p.photo_url,p.photo_type,p.category,p.sub_category,p.created_at,
 w.actual_cost as legacy_price,w.sub_category as legacy_price_label,
 coalesce(c.photo_stage,case when p.photo_type in ('before','after') then p.photo_type else 'unknown' end) as photo_stage,
 coalesce(c.targets,'[]'::jsonb) as targets,coalesce(c.review_status,'unclassified') as review_status,
 coalesce(c.revision,0) as revision,c.updated_at as classified_at,
 (select count(*)::integer from jsonb_array_elements(coalesce(c.targets,'[]'::jsonb)) t where t->>'price' is null) as missing_prices
from public.work_photos p
left join public.work_items w on w.id=p.work_item_id and w.company_id=p.company_id
left join public.photo_case_classifications c on c.photo_id=p.id and c.company_id=p.company_id;
revoke all on public.photo_case_management from public,anon,authenticated;
grant select on public.photo_case_management to service_role;
create or replace function public.save_photo_case_classification(p_user uuid,p_photo uuid,p_revision integer,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare oldrow public.photo_case_classifications%rowtype; saved public.photo_case_classifications%rowtype; co uuid; before_value jsonb;
begin
 if not exists(select 1 from public.super_admins where user_id=p_user and is_active=true) then
  raise exception '슈퍼관리자 권한이 필요합니다.' using errcode='42501';
 end if;
 select company_id into co from public.work_photos where id=p_photo for update;
 if not found then raise exception '사진을 찾을 수 없습니다.' using errcode='22023'; end if;
 select * into oldrow from public.photo_case_classifications where photo_id=p_photo for update;
 if coalesce(oldrow.revision,0) is distinct from p_revision then
  raise exception '다른 작업에서 변경되었습니다. 최신 내용을 다시 불러와주세요.' using errcode='40001';
 end if;
 if jsonb_typeof(p_body->'targets') is distinct from 'array' then raise exception '대상 목록을 확인해주세요.' using errcode='22023'; end if;
 if p_body->>'status'='reviewed' and jsonb_array_length(p_body->'targets')=0 then raise exception '검토할 대상이 없습니다.' using errcode='22023'; end if;
 if oldrow.photo_id is not null then before_value:=to_jsonb(oldrow); end if;
 insert into public.photo_case_classifications(photo_id,company_id,photo_stage,targets,review_status,revision,updated_by)
 values(p_photo,co,p_body->>'photoStage',p_body->'targets',p_body->>'status',p_revision+1,p_user)
 on conflict(photo_id) do update set photo_stage=excluded.photo_stage,targets=excluded.targets,review_status=excluded.review_status,
 revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now()
 returning * into saved;
 insert into public.photo_case_classification_history(photo_id,actor,previous_value,next_value)
 values(p_photo,p_user,before_value,to_jsonb(saved));
 return to_jsonb(saved);
end $function$;
revoke all on function public.save_photo_case_classification(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_photo_case_classification(uuid,uuid,integer,jsonb) to service_role;
commit;
select '6단계 사진 분류·대상별 가격 관리 설정 완료' as result;
