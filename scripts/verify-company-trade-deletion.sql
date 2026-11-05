-- TEST PROJECT ONLY: run on the isolated deletion test database.
-- All fixtures and deletion effects are rolled back by the inner exception.
do $test$
declare co uuid:=gen_random_uuid(); otherco uuid:=gen_random_uuid(); usr uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); othersite uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); otherworker uuid:=gen_random_uuid(); alert uuid:=gen_random_uuid(); otheralert uuid:=gen_random_uuid(); req uuid; lease uuid:=gen_random_uuid(); failed boolean:=false;
begin
 begin
 insert into auth.users(id,email) values(usr,usr::text||'@example.invalid');
 insert into public.companies(id,company_name) values(co,'business deletion probe'),(otherco,'business control probe');
 insert into public.profiles(id,company_id,role) values(usr,co,'owner') on conflict(id) do update set company_id=co,role='owner';
 insert into public.sites(id,company_id,work_dates) values(site,co,array[current_date]),(othersite,otherco,array[current_date]);
 insert into public.workers(id,company_id,name) values(worker,co,'probe'),(otherworker,otherco,'control');
 insert into public.site_workers(company_id,site_id,worker_id,role) values(co,site,worker,'member'),(otherco,othersite,otherworker,'member');
 insert into public.site_daily_assignments(company_id,site_id,work_date,worker_id,role) values(co,site,current_date,worker,'member'),(otherco,othersite,current_date,otherworker,'member');
 insert into public.work_reports(company_id,site_id) values(co,site),(otherco,othersite);
 insert into public.site_materials(company_id,site_id,quantity) values(co,site,10),(otherco,othersite,20);
 insert into public.site_payment_accounts(site_id,company_id,opening_paid,opening_date,initial_request_id) values(site,co,100,current_date,gen_random_uuid()),(othersite,otherco,200,current_date,gen_random_uuid());
 insert into public.customer_site_portals(company_id,site_id) values(co,site),(otherco,othersite);
 insert into public.customer_schedule_alerts(id,company_id,site_id,old_dates,new_dates) values(alert,co,site,array[current_date],array[current_date+1]),(otheralert,otherco,othersite,array[current_date],array[current_date+1]);
 insert into public.alimtalk_deliveries(id,company_id,site_id,customer_schedule_alert_id,kind,recipient_mask,template_code,status,accounting) values(gen_random_uuid(),co,site,alert,'probe','***','probe','success','charged'),(gen_random_uuid(),otherco,othersite,otheralert,'probe','***','probe','success','charged');
 insert into public.consultation_registration_requests(company_id,request_id,user_id,payload_hash,site_id) values(co,gen_random_uuid(),usr,'probe',site);
 insert into public.site_photos(company_id,site_id,photo_type,storage_path) values(co,site,'before','probe/'||co::text||'/original.jpg');
 insert into public.trade_clients(id,company_id,name) values(co,co,'probe client'),(otherco,otherco,'control client');
 insert into public.trade_contacts(id,company_id,client_id,name) values(co,co,co,'probe contact'),(otherco,otherco,otherco,'control contact');
 insert into public.trade_site_links(site_id,company_id,client_id,contact_id) values(site,co,co,co),(othersite,otherco,otherco,otherco);
 insert into public.trade_requests(id,company_id,actor,action,payload,result) values(gen_random_uuid(),co,usr,'probe','{}','{}');
 set constraints all immediate;
 select id into req from public.submit_account_deletion_request(usr);
 update public.account_deletion_requests set status='processing',lease_token=lease,lease_until=clock_timestamp()+interval '5 minutes' where id=req;
 perform public.freeze_company_direct_writes(req,lease);
 -- Simulate a later ordinary transaction with no authorized cleanup context.
 delete from app_private.company_cleanup_context where company_id=co;
 begin
 insert into public.sites(company_id) values(co);
 raise exception 'frozen write unexpectedly succeeded';
 exception when check_violation then
 if sqlerrm<>'Company writes are frozen for deletion' then raise;end if;
 end;
 update public.sites set updated_at=clock_timestamp() where id=othersite;
 insert into app_private.company_assignment_deletions(company_id,request_id) values(co,gen_random_uuid());
 begin
 perform public.delete_frozen_company_business_records(req,lease);
 exception when others then
 if sqlerrm<>'Company deletion request mismatch' then raise;end if;
 failed:=true;
 end;
 if not failed then raise exception 'expected late-stage failure';end if;
 if not exists(select 1 from public.customer_site_portals where company_id=co) or not exists(select 1 from public.alimtalk_deliveries where company_id=co) or exists(select 1 from app_private.company_site_link_deletions where company_id=co) then raise exception 'site links did not roll back';end if;
 if not exists(select 1 from public.work_reports where company_id=co) or not exists(select 1 from public.site_materials where company_id=co and quantity=10) or not exists(select 1 from public.site_payment_accounts where company_id=co and opening_paid=100) then raise exception 'earlier stages were not rolled back';end if;
 if exists(select 1 from app_private.company_work_record_deletions where company_id=co) or exists(select 1 from app_private.company_material_deletions where company_id=co) or exists(select 1 from app_private.company_receivable_deletions where company_id=co) then raise exception 'rollback left markers';end if;
 delete from app_private.company_assignment_deletions where company_id=co;
 if public.delete_frozen_company_business_records(req,lease) is distinct from true then raise exception 'cleanup failed';end if;
 if exists(select 1 from public.work_reports where company_id=co) or exists(select 1 from public.site_materials where company_id=co) or exists(select 1 from public.site_payment_accounts where company_id=co) or exists(select 1 from public.site_daily_assignments where company_id=co) then raise exception 'remaining business records';end if;
 if not exists(select 1 from public.work_reports where company_id=otherco) or not exists(select 1 from public.site_materials where company_id=otherco and quantity=20) or not exists(select 1 from public.site_payment_accounts where company_id=otherco and opening_paid=200) or not exists(select 1 from public.site_daily_assignments where company_id=otherco) then raise exception 'control modified';end if;
 if exists(select 1 from public.customer_site_portals where company_id=co) or exists(select 1 from public.customer_schedule_alerts where company_id=co) or exists(select 1 from public.alimtalk_deliveries where company_id=co) or exists(select 1 from public.consultation_registration_requests where company_id=co) then raise exception 'site links remain';end if;
 if not exists(select 1 from public.customer_site_portals where company_id=otherco) or not exists(select 1 from public.alimtalk_deliveries where company_id=otherco) then raise exception 'control links deleted';end if;
 if public.delete_frozen_company_business_records(req,lease) is distinct from true then raise exception 'retry failed';end if;
 if not exists(select 1 from public.site_photos where company_id=co and storage_path='probe/'||co::text||'/original.jpg') then raise exception 'photo evidence lost';end if;
 if exists(select 1 from public.trade_clients where company_id=co) or exists(select 1 from public.trade_contacts where company_id=co) or exists(select 1 from public.trade_requests where company_id=co) then raise exception 'trade records remain';end if;
 if not exists(select 1 from public.trade_clients where company_id=otherco and name='control client') or not exists(select 1 from public.trade_contacts where company_id=otherco and name='control contact') then raise exception 'control trade records lost';end if;
 if not exists(select 1 from auth.users where id=usr) or not exists(select 1 from public.sites where id=site) then raise exception 'out of scope cleanup';end if;
 raise exception using errcode='ZX001',message='rollback probe';
 exception when sqlstate 'ZX001' then null;
 end;
end;$test$;
select true as business_cleanup_passed,true as late_failure_rollback_passed,true as other_company_preserved;
