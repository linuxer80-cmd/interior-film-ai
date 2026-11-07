alter table public.consultation_follow_ups add column site_id uuid references public.sites(id) on delete set null;
create index consultation_follow_ups_site on public.consultation_follow_ups(site_id) where site_id is not null;
