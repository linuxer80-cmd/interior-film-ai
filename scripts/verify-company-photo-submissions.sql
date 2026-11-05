-- Isolated TEST database only. Every fixture and deletion is rolled back.
do $test$
declare co uuid:=gen_random_uuid(); otherco uuid:=gen_random_uuid(); usr uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); othersite uuid:=gen_random_uuid(); req uuid; lease uuid:=gen_random_uuid(); p text; own text;
begin
 begin
 p:='sites/'||co::text||'/probe.jpg';own:='sites/'||otherco::text||'/control.jpg';
 insert into auth.users(id,email) values(usr,usr::text||'@example.invalid');
 insert into public.companies(id,company_name) values(co,'submission probe'),(otherco,'submission control');
 insert into public.profiles(id,company_id,role) values(usr,co,'owner') on conflict(id) do update set company_id=co,role='owner';
 insert into public.sites(id,company_id) values(site,co),(othersite,otherco);
 insert into public.customer_photo_submissions(id,company_id,site_id,portal_token_id,fingerprint,note,photo_count,status,photo_ids) values(co,co,site,gen_random_uuid(),repeat('a',64),'pending target',1,'pending','{}'),(otherco,otherco,othersite,gen_random_uuid(),repeat('b',64),'control',1,'pending','{}');
 insert into public.site_photos(company_id,site_id,photo_type,storage_path) values(co,site,'before',p);
 insert into public.site_extra_work(company_id,site_id,request_id,description,photo_paths) values(co,site,gen_random_uuid(),'probe',jsonb_build_array(p));
 set constraints all immediate;
 select id into req from public.submit_account_deletion_request(usr);
 update public.account_deletion_requests set status='processing',lease_token=lease,lease_until=clock_timestamp()+interval '5 minutes' where id=req;
 perform public.freeze_company_storage_writes(req,lease);
 delete from app_private.company_cleanup_context where company_id=co;
 if public.delete_frozen_company_media_records(req,lease) is distinct from true then raise exception 'cleanup failed';end if;
 if exists(select 1 from public.site_photos where company_id=co) or exists(select 1 from public.site_extra_work where company_id=co) then raise exception 'media metadata remains';end if;
 if exists(select 1 from public.customer_photo_submissions where company_id=co) then raise exception 'submissions remain';end if;
 if not exists(select 1 from public.customer_photo_submissions where company_id=otherco and note='control') then raise exception 'control lost';end if;
 if not exists(select 1 from app_private.company_deleted_photo_paths where company_id=co and path='sites/'||co::text||'/'||site::text||'/request/customer-'||co::text||'-0.jpg') then raise exception 'interrupted upload path lost';end if;
 if not exists(select 1 from public.sites where id=site) or not exists(select 1 from auth.users where id=usr) then raise exception 'parent evidence lost';end if;
 if public.delete_frozen_company_media_records(req,lease) is distinct from true then raise exception 'retry failed';end if;
 raise exception using errcode='ZX001',message='rollback probe';
 exception when sqlstate 'ZX001' then null;
 end;
end;$test$;
select true as pending_submission_cleanup_verified,true as foreign_submission_preserved,true as path_evidence_preserved;
