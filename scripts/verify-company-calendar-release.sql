-- Isolated TEST database only. Dummy credentials, no remote calendar calls.
do $test$
declare co uuid:=gen_random_uuid();u uuid:=gen_random_uuid();member uuid:=gen_random_uuid();req uuid;l uuid:=gen_random_uuid();
begin
 begin
 insert into auth.users(id,email) values(u,u::text||'@example.invalid'),(member,member::text||'@example.invalid');
 insert into public.companies(id,company_name) values(co,'calendar release probe');
 insert into public.profiles(id,company_id,role) values(u,co,'owner'),(member,co,'worker') on conflict(id) do update set company_id=excluded.company_id,role=excluded.role;
 insert into public.calendar_auto_connections(user_id,refresh_cipher,next_run_at) values(member,'probe-not-a-token','2100-01-01');
 select id into req from public.submit_account_deletion_request(u);
 update public.account_deletion_requests set status='processing',lease_token=l,lease_until=clock_timestamp()+interval '5 minutes' where id=req;
 perform public.freeze_company_calendar_jobs(req,l);
 if public.calendar_company_sync_allowed(member) then raise exception 'member not paused';end if;
 perform public.finalize_frozen_empty_company(req,l);
 insert into public.account_deletion_blocks(user_id) values(u);
 if public.release_company_calendar_jobs(req,l) is distinct from true then raise exception 'release failed';end if;
 if public.release_company_calendar_jobs(req,l) is distinct from true then raise exception 'retry failed';end if;
 if not public.calendar_company_sync_allowed(member) then raise exception 'member pause remains';end if;
 if not exists(select 1 from public.calendar_auto_connections where user_id=member and enabled and next_run_at<clock_timestamp()+interval '1 minute') then raise exception 'member was not queued';end if;
 if not exists(select 1 from auth.users where id=member) then raise exception 'member account lost';end if;
 raise exception using errcode='ZX001',message='rollback probe';
 exception when sqlstate 'ZX001' then null;
 end;
end;$test$;
select true as calendar_release_verified;
