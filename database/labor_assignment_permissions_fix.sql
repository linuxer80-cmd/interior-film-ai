begin;
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
