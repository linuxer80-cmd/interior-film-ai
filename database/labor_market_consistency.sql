-- Run after labor_market_workflow.sql. Safe to rerun. No site/worker is deleted.
begin;
alter table public.labor_applications drop constraint if exists labor_applications_status_check;
alter table public.labor_applications add constraint labor_applications_status_check
 check (status in ('invited','applied','accepted','rejected','withdrawn','expired','unassigned'));
-- Patch only the known overlapping-date check; refuse unfamiliar live definitions.
do $$
declare definition text;
 old_check text := E'join public.workers w on w.id=d.worker_id\n      where w.user_id=target';
 new_check text := E'join public.workers w on w.id=d.worker_id\n      join public.sites assigned_site on assigned_site.id=d.site_id and assigned_site.company_id=d.company_id\n      where assigned_site.status not in (''cancelled'',''completed'')\n        and (assigned_site.work_dates is null or d.work_date=any(assigned_site.work_dates))\n        and w.user_id=target';
begin
 definition := pg_get_functiondef('public.labor_action(uuid,uuid,text,uuid)'::regprocedure);
 if position(old_check in definition)>0 then
   definition := replace(definition,old_check,new_check);
 elsif position(new_check in definition)=0 then
   raise exception 'labor_action definition differs. Review the deployed function before applying this repair.';
 end if;
 definition := replace(definition,
   'a.status not in (''invited'',''withdrawn'')',
   'a.status not in (''invited'',''withdrawn'',''unassigned'')');
 execute definition;
end $$;

-- Deferred evaluation observes the final state of a delete-and-reinsert assignment save.
-- Keep accepted history for partial assignments, and expire only fully removed/cancelled ones.
create or replace function public.reconcile_labor_assignment(p_site uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.labor_applications a
 set status='unassigned',share_phone=false,updated_at=now()
 from public.labor_jobs j
 where a.job_id=j.id and j.site_id=p_site and a.status='accepted'
 and not exists (
   select 1 from public.site_daily_assignments d
   join public.workers w on w.id=d.worker_id and w.company_id=d.company_id
   join public.sites s on s.id=d.site_id and s.company_id=d.company_id
   where d.site_id=p_site and d.company_id=j.company_id and w.user_id=a.user_id
     and w.is_active is true and s.status<>'cancelled'
     and d.work_date=any(j.work_dates)
     and (s.work_dates is null or d.work_date=any(s.work_dates))
 );
end $$;
revoke all on function public.reconcile_labor_assignment(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_labor_assignment(uuid) to service_role;

-- Internal trigger only: source table RLS still checks the user's edit.
-- Synchronizing server-only recruitment rows requires a private owner context.
create schema if not exists labor_internal;
revoke all on schema labor_internal from public, anon, authenticated;

create or replace function labor_internal.reconcile_labor_assignment_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 if TG_TABLE_SCHEMA <> 'public'
    or TG_TABLE_NAME not in ('sites','site_daily_assignments') then
   raise exception 'Unsupported assignment trigger';
 end if;
 if current_setting('role',true) in ('authenticated','anon') then
   actor := auth.uid();
   if actor is null then raise exception 'Authentication required'; end if;
   if TG_OP <> 'INSERT' and not exists (
     select 1 from public.profiles p join public.companies c on c.id=p.company_id
     where p.id=actor and p.role='owner' and p.is_active is true
       and c.is_active is true and p.company_id=old.company_id
   ) then raise exception 'Company access denied'; end if;
   if TG_OP <> 'DELETE' and not exists (
     select 1 from public.profiles p join public.companies c on c.id=p.company_id
     where p.id=actor and p.role='owner' and p.is_active is true
       and c.is_active is true and p.company_id=new.company_id
   ) then raise exception 'Company access denied'; end if;
 end if;
 if TG_TABLE_NAME='sites' then
   perform public.reconcile_labor_assignment(new.id);
 else
   if TG_OP<>'INSERT' then perform public.reconcile_labor_assignment(old.site_id); end if;
   if TG_OP<>'DELETE' then perform public.reconcile_labor_assignment(new.site_id); end if;
 end if;
 return null;
end $$;
revoke all on function labor_internal.reconcile_labor_assignment_trigger()
 from public,anon,authenticated;

drop trigger if exists labor_assignment_reconcile on public.site_daily_assignments;
create constraint trigger labor_assignment_reconcile
 after insert or update or delete on public.site_daily_assignments
 deferrable initially deferred for each row execute function labor_internal.reconcile_labor_assignment_trigger();
drop trigger if exists labor_site_reconcile on public.sites;
create constraint trigger labor_site_reconcile
 after update on public.sites
 deferrable initially deferred for each row execute function labor_internal.reconcile_labor_assignment_trigger();
drop function if exists public.reconcile_labor_assignment_trigger();
commit;
