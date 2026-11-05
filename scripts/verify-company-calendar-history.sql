-- TEST only. All synthetic records and mutations roll back.
do $test$
declare co uuid:=gen_random_uuid(); usr uuid:=gen_random_uuid(); former uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); req uuid; lease uuid:=gen_random_uuid(); event text; plan jsonb;
begin
 begin
 insert into auth.users(id,email) values(usr,usr::text||'@example.invalid'),(former,former::text||'@example.invalid');
 insert into public.companies(id,company_name) values(co,'Synthetic calendar history');
 insert into public.profiles(id,company_id,role) values(usr,co,'owner') on conflict(id) do update set company_id=co,role='owner';
 insert into public.sites(id,company_id) values(site,co);
 event:='fm'||encode(sha256(convert_to('filmjang-v1:'||former::text||':'||site::text||':2026-11-05','UTF8')),'hex');
 insert into public.calendar_auto_events(user_id,event_id,work_date,site_id,company_id) values(former,event,'2026-11-05',site,co);
 delete from public.calendar_auto_events where company_id=co;
 select id into req from public.submit_account_deletion_request(usr);
 update public.account_deletion_requests set status='processing',lease_token=lease,lease_until=clock_timestamp()+interval '5 minutes' where id=req;
 perform public.freeze_company_calendar_jobs(req,lease);
 plan:=public.inspect_frozen_company_calendar_scope(req,lease);
 if not (plan->'userIds' @> jsonb_build_array(former)) or not(plan->'siteIds' @> jsonb_build_array(site)) then raise exception 'Former scope lost';end if;
 if plan->>'policy'<>'verified_app_events_only' or (plan->>'knownScopeVerified')::boolean is distinct from true then raise exception 'Approved policy missing';end if;
 if (plan->>'usersComplete')::boolean or (plan->>'sitesComplete')::boolean then raise exception 'History overcertified';end if;
 plan:=public.inspect_company_calendar_deletion_ledger(req,lease);
 if jsonb_array_length(plan)<>1 or plan->0->>'event_id'<>event then raise exception 'Historical event identity lost';end if;
 begin
 perform public.clear_verified_company_calendar_ledger(req,lease,'[]');
 raise exception 'Unverified history cleared';
 exception when raise_exception then if sqlerrm<>'Calendar receipt incomplete' then raise;end if;end;
 -- Synthetic ledger only: no real Google event exists for this fixture.
 if public.clear_verified_company_calendar_ledger(req,lease,plan) is distinct from true then raise exception 'Historical receipt failed';end if;
 if exists(select 1 from app_private.company_calendar_scope_history where company_id=co) then raise exception 'Verified historical evidence remains';end if;
 raise exception using errcode='ZX001',message='rollback fixture';
 exception when sqlstate 'ZX001' then null;
 end;
end $test$;
select true as former_member_frozen_after_ledger_removal,true as scope_preserved,true as historical_event_verified_before_local_cleanup,true as fixture_rolled_back;
