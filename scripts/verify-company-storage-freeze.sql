-- Isolated TEST database only. Every fixture and effect is rolled back.
do $test$
declare co uuid:=gen_random_uuid();otherco uuid:=gen_random_uuid();u uuid:=gen_random_uuid();t uuid:=gen_random_uuid();ot uuid:=gen_random_uuid();m uuid:=gen_random_uuid();req uuid;l uuid:=gen_random_uuid();blocked integer:=0;
begin
 begin
 insert into auth.users(id,email) values(u,u::text||'@example.invalid');
 insert into public.companies(id,company_name) values(co,'indirect freeze probe'),(otherco,'indirect control probe');
 insert into public.profiles(id,company_id,role) values(u,co,'owner') on conflict(id) do update set company_id=co,role='owner';
 insert into public.customer_chat_threads(id,company_id,visitor_hash,customer_name) values(t,co,encode(sha256(convert_to(t::text,'UTF8')),'hex'),'probe'),(ot,otherco,encode(sha256(convert_to(ot::text,'UTF8')),'hex'),'control');
 insert into public.customer_chat_messages(id,thread_id,sender,body) values(m,t,'owner','probe');
 select id into req from public.submit_account_deletion_request(u);
 update public.account_deletion_requests set status='processing',lease_token=l,lease_until=clock_timestamp()+interval '5 minutes' where id=req;
 perform public.freeze_company_storage_writes(req,l);
 delete from app_private.company_cleanup_context where company_id=co;
 begin insert into public.customer_chat_messages(id,thread_id,sender,body) values(gen_random_uuid(),t,'owner','blocked');
 exception when check_violation then if sqlerrm<>'Company writes are frozen for deletion' then raise;end if;blocked:=blocked+1;end;
 begin update public.customer_chat_messages set body='blocked' where id=m;
 exception when check_violation then if sqlerrm<>'Company writes are frozen for deletion' then raise;end if;blocked:=blocked+1;end;
 begin update public.customer_chat_messages set thread_id=ot where id=m;
 exception when check_violation then if sqlerrm<>'Company writes are frozen for deletion' then raise;end if;blocked:=blocked+1;end;
 begin delete from public.customer_chat_messages where id=m;
 exception when check_violation then if sqlerrm<>'Company writes are frozen for deletion' then raise;end if;blocked:=blocked+1;end;
 if blocked<>4 then raise exception 'indirect mutation escaped freeze';end if;
 insert into public.customer_chat_messages(id,thread_id,sender,body) values(gen_random_uuid(),ot,'owner','allowed');
 perform app_private.authorize_company_cleanup(req,l);
 delete from public.customer_chat_threads where id=t;
 if exists(select 1 from public.customer_chat_messages where thread_id=t) then raise exception 'authorized cascade failed';end if;
 begin
 insert into storage.objects(bucket_id,name) values('work-photos','sites/'||co::text||'/blocked.jpg');
 raise exception 'company upload escaped freeze';
 exception when insufficient_privilege then
 if sqlerrm<>'Company uploads are frozen for deletion' then raise;end if;
 end;
 begin
 insert into storage.objects(bucket_id,name) values('customer-chat',t::text||'/late.jpg');
 raise exception 'deleted chat upload escaped freeze';
 exception when insufficient_privilege then
 if sqlerrm<>'Company uploads are frozen for deletion' then raise;end if;
 end;
 if not exists(select 1 from public.customer_chat_messages where thread_id=ot and body='allowed') then raise exception 'control lost';end if;
 raise exception using errcode='ZX001',message='rollback probe';
 exception when sqlstate 'ZX001' then null;
 end;
end;$test$;
select true as storage_metadata_guard_verified;
