-- Isolated TEST database only. Every fixture and deletion is rolled back.
do $test$
declare co uuid:=gen_random_uuid(); otherco uuid:=gen_random_uuid(); usr uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); othersite uuid:=gen_random_uuid(); req uuid; lease uuid:=gen_random_uuid(); p text; own text;
begin
 begin
 p:='sites/'||co::text||'/probe.jpg';own:='sites/'||otherco::text||'/control.jpg';
 insert into auth.users(id,email) values(usr,usr::text||'@example.invalid');
 insert into public.companies(id,company_name) values(co,'quote probe'),(otherco,'quote control');
 insert into public.profiles(id,company_id,role) values(usr,co,'owner') on conflict(id) do update set company_id=co,role='owner';
 insert into public.sites(id,company_id) values(site,co),(othersite,otherco);
 insert into public.site_completion_estimates(site_id,company_id,document) values(site,co,'{"items":[],"note":"target"}'),(othersite,otherco,'{"items":[],"note":"control"}');
 insert into public.site_consultation_quotes(site_id,company_id,document) values(site,co,'{"items":[]}'),(othersite,otherco,'{"items":[]}');
 insert into public.standalone_quotes(id,company_id,area_document,cost_document) values(co,co,'{"items":[]}','{"items":[]}'),(otherco,otherco,'{"items":[]}','{"items":[]}');
 set constraints all immediate;
 select id into req from public.submit_account_deletion_request(usr);
 update public.account_deletion_requests set status='processing',lease_token=lease,lease_until=clock_timestamp()+interval '5 minutes' where id=req;
 perform public.freeze_company_storage_writes(req,lease);
 delete from app_private.company_cleanup_context where company_id=co;
 if public.delete_frozen_company_business_records(req,lease) is distinct from true then raise exception 'cleanup failed';end if;
 if exists(select 1 from public.site_completion_estimates where company_id=co) or exists(select 1 from public.site_consultation_quotes where company_id=co) or exists(select 1 from public.standalone_quotes where company_id=co) then raise exception 'quote records remain';end if;
 if not exists(select 1 from public.site_completion_estimates where company_id=otherco and document->>'note'='control') or not exists(select 1 from public.site_consultation_quotes where company_id=otherco) or not exists(select 1 from public.standalone_quotes where company_id=otherco) then raise exception 'control quotes lost';end if;
 if not exists(select 1 from public.sites where id=site) or not exists(select 1 from auth.users where id=usr) then raise exception 'parent evidence lost';end if;
 if public.delete_frozen_company_business_records(req,lease) is distinct from true then raise exception 'retry failed';end if;
 raise exception using errcode='ZX001',message='rollback probe';
 exception when sqlstate 'ZX001' then null;
 end;
end;$test$;
select true as quote_cleanup_verified,true as foreign_quotes_preserved,true as retry_verified;
