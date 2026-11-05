-- Isolated TEST database only. Dummy credentials; no external API calls.
do $test$
declare co uuid:=gen_random_uuid();u uuid:=gen_random_uuid();otheru uuid:=gen_random_uuid();req uuid;l uuid:=gen_random_uuid();blocked boolean:=false;n integer;
begin
 begin
 insert into auth.users(id,email) values(u,u::text||'@example.invalid'),(otheru,otheru::text||'@example.invalid');
 insert into public.companies(id,company_name) values(co,'calendar job freeze probe');
 insert into public.profiles(id,company_id,role) values(u,co,'owner') on conflict(id) do update set company_id=co,role='owner';
 insert into public.calendar_auto_connections(user_id,refresh_cipher,lease_id,lease_until) values(u,'probe-not-a-token',gen_random_uuid(),now()-interval '1 hour'),(otheru,'probe-not-a-token',null,null);
 select id into req from public.submit_account_deletion_request(u);
 update public.account_deletion_requests set status='processing',lease_token=l,lease_until=clock_timestamp()+interval '5 minutes' where id=req;
 begin perform public.freeze_company_calendar_jobs(req,l);
 exception when others then if sqlerrm<>'Calendar execution must stop before company freeze' then raise;end if;blocked:=true;end;
 if not blocked or exists(select 1 from app_private.company_write_freezes where company_id=co) then raise exception 'active job freeze was not rolled back';end if;
 update public.calendar_auto_connections set lease_id=null,lease_until=null where user_id=u;
 perform public.freeze_company_calendar_jobs(req,l);
 if public.calendar_company_sync_allowed(u) or not public.calendar_company_sync_allowed(otheru) then raise exception 'calendar user scope mismatch';end if;
 select count(*) into n from public.calendar_auto_claim(u);if n<>0 then raise exception 'frozen user claimed';end if;
 select count(*) into n from public.calendar_auto_claim(otheru);if n<>1 then raise exception 'control user blocked';end if;
 raise exception using errcode='ZX001',message='rollback probe';
 exception when sqlstate 'ZX001' then null;
 end;
end;$test$;
select true as calendar_job_freeze_verified;
