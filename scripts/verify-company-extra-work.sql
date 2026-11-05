-- Isolated TEST database only. Every fixture and deletion is rolled back.
do $test$
declare co uuid:=gen_random_uuid(); otherco uuid:=gen_random_uuid(); usr uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); othersite uuid:=gen_random_uuid(); req uuid; lease uuid:=gen_random_uuid(); p text; own text;
begin
 begin
 p:='sites/'||co::text||'/probe.jpg';own:='sites/'||otherco::text||'/control.jpg';
 insert into auth.users(id,email) values(usr,usr::text||'@example.invalid');
 insert into public.companies(id,company_name) values(co,'extra work probe'),(otherco,'extra work control');
 insert into public.profiles(id,company_id,role) values(usr,co,'owner') on conflict(id) do update set company_id=co,role='owner';
 insert into public.sites(id,company_id) values(site,co),(othersite,otherco);
 insert into public.site_extra_work(company_id,site_id,request_id,description,photo_paths,approved_amount) values(co,site,gen_random_uuid(),'target',jsonb_build_array(p),100),(otherco,othersite,gen_random_uuid(),'preserve',jsonb_build_array(p,own),999);
 set constraints all immediate;
 select id into req from public.submit_account_deletion_request(usr);
 update public.account_deletion_requests set status='processing',lease_token=lease,lease_until=clock_timestamp()+interval '5 minutes' where id=req;
 perform public.freeze_company_storage_writes(req,lease);
 delete from app_private.company_cleanup_context where company_id=co;
 if public.delete_company_extra_work_records(req,lease) is distinct from true then raise exception 'cleanup failed';end if;
 if exists(select 1 from public.site_extra_work where photo_paths ? p or company_id=co) then raise exception 'shared references remain';end if;
 if not exists(select 1 from public.site_extra_work where photo_paths=jsonb_build_array(own) and company_id=otherco and approved_amount=999 and description='preserve') then raise exception 'independent original lost';end if;
 if not exists(select 1 from public.sites where id=site) or not exists(select 1 from auth.users where id=usr) then raise exception 'parent evidence lost';end if;
 if public.delete_company_extra_work_records(req,lease) is distinct from true then raise exception 'retry failed';end if;
 begin
 update public.site_extra_work set photo_paths=jsonb_build_array(p) where company_id=otherco;
 raise exception 'shared reference recreated';
 exception when check_violation then if sqlerrm<>'Photo is pending permanent deletion' then raise;end if;
 end;
 raise exception using errcode='ZX001',message='rollback probe';
 exception when sqlstate 'ZX001' then null;
 end;
end;$test$;
select true as shared_reference_cleanup_verified,true as independent_original_preserved,true as resurrection_blocked;
