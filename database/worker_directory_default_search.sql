begin;
do $repair$
declare
 definition text;
 old_predicate text := $old$and (q='' or strpos(lower(case when exists(select 1 from public.workers w where w.company_id=co and w.user_id=lp.user_id and w.is_active is distinct from false) then lp.name else left(lp.name,1)||repeat('○',greatest(char_length(lp.name)-2,1))||case when char_length(lp.name)>2 then right(lp.name,1) else '' end end),lower(q))>0)$old$;
 new_predicate text := $new$and (q='' or strpos(lower(lp.name),lower(q))>0 or strpos(lower(left(lp.name,1)||repeat('○',greatest(char_length(lp.name)-2,1))||case when char_length(lp.name)>2 then right(lp.name,1) else '' end),lower(q))>0)$new$;
begin
 select pg_get_functiondef('public.worker_directory_action(uuid,text,jsonb)'::regprocedure) into definition;
 if strpos(definition,old_predicate)>0 then
  execute replace(definition,old_predicate,new_predicate);
 elsif strpos(definition,new_predicate)=0 then
  raise exception '검색 함수가 예상 버전과 다릅니다. 함수 정의를 확인해주세요.';
 end if;
end $repair$;
do $settings$
declare definition text;
begin
 select pg_get_functiondef('public.worker_directory_action(uuid,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,$old$'visible',coalesce((select visible from public.worker_directory_consent where user_id=p_actor),false)$old$,$new$'visible',coalesce((select visible from public.worker_directory_consent where user_id=p_actor),true)$new$);
 definition:=replace(definition,$old$'needs_review',not exists(select 1 from public.worker_directory_consent where user_id=p_actor and reviewed_at is not null)$old$,$new$'needs_review',false$new$);
 execute definition;
end $settings$;

-- No prior choice: searchable by default. Preserve every saved exclusion.
alter table public.worker_directory_consent alter column visible set default true;
insert into public.worker_directory_consent(user_id,visible,reviewed_at)
 select user_id,true,now() from public.labor_profiles on conflict(user_id) do nothing;
update public.worker_directory_consent set reviewed_at=now() where reviewed_at is null;
create or replace function public.initialize_worker_directory()
returns trigger language plpgsql security invoker set search_path='' as $init$
begin
 insert into public.worker_directory_consent(user_id,visible,reviewed_at)
 values(new.user_id,true,now()) on conflict(user_id) do nothing;
 return new;
end $init$;
revoke all on function public.initialize_worker_directory() from public,anon,authenticated;
drop trigger if exists initialize_worker_directory on public.labor_profiles;
create trigger initialize_worker_directory after insert on public.labor_profiles
 for each row execute function public.initialize_worker_directory();

select '기본 검색 허용·개인설정 숨기기·실제 이름 검색 설정 완료' as result;
commit;
