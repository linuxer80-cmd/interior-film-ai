begin;
-- 기존 공지(1번)는 업체 공지로 보존하고 시공자 공지는 별도로 시작합니다.
alter table public.app_announcement
  drop constraint if exists app_announcement_id_check;
alter table public.app_announcement
  add constraint app_announcement_id_check check (id in (1, 2));
insert into public.app_announcement (id, message, enabled)
values (2, '', false)
on conflict (id) do nothing;
commit;
select '업체·시공자 공지 분리 완료' as result;
