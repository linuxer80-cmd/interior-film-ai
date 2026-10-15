-- Uses an eligible existing roll inside a rolled-back transaction.
begin;
do $test$
declare t public.film_stock_trips%rowtype; r public.film_stock_rolls%rowtype; u uuid; b jsonb; v jsonb; q numeric; n int;
begin
 select tr.* into t from public.film_stock_trips tr
 join public.film_stock_rolls rr on rr.id=tr.roll_id
 join public.sites s on s.id=tr.site_id
 where tr.returned is not null and rr.remaining=tr.returned and rr.status in ('available','used_up')
 and tr.issued>0 and s.status<>'cancelled'
 and not exists(select 1 from public.work_reports w where w.site_id=s.id and w.review_status in ('pending','approved'))
 and not exists(select 1 from public.film_stock_trips newer where newer.roll_id=rr.id and newer.id<>tr.id and newer.issued_at>=tr.issued_at)
 and not exists(select 1 from public.film_stock_events e where e.roll_id=rr.id and e.created_at>=tr.returned_at and e.action not in ('return','correct_return'))
 limit 1;
 if t.id is null then raise exception 'test fixture missing'; end if;
 select id into u from public.profiles where company_id=t.company_id and role='owner' and is_active is distinct from false limit 1;
 select * into r from public.film_stock_rolls where id=t.roll_id;
 q:=case when t.returned=0 then least(t.issued,1) else 0 end;
 b:=jsonb_build_object('action','correct_return','siteId',t.site_id,'rollId',t.roll_id,'tripId',t.id,'revision',r.revision,'expectedReturned',t.returned,'remaining',q,'requestId',gen_random_uuid());
 v:=public.film_stock(u,t.site_id,'correct_return',b);
 if (select returned from public.film_stock_trips where id=t.id)<>q or (select remaining from public.film_stock_rolls where id=r.id)<>q then raise exception 'quantity mismatch'; end if;
 if not exists(select 1 from public.film_stock_trips where material_id=t.material_id and returned is null) and
 (select quantity from public.site_material_returns where material_id=t.material_id) is distinct from
 (select sum(returned) from public.film_stock_trips where material_id=t.material_id) then raise exception 'aggregate mismatch'; end if;
 v:=public.film_stock(u,t.site_id,'correct_return',b);
 if (select revision from public.film_stock_rolls where id=r.id)<>r.revision+1 then raise exception 'retry mutated twice'; end if;
 begin
 perform public.film_stock(u,t.site_id,'correct_return',b||jsonb_build_object('requestId',gen_random_uuid()));
 raise exception 'stale request accepted';
 exception when serialization_failure then null;
 end;
 select revision into n from public.film_stock_rolls where id=r.id;
 begin
 perform public.film_stock(u,t.site_id,'correct_return',b||jsonb_build_object('requestId',gen_random_uuid(),'revision',n,'expectedReturned',q,'remaining',t.issued+1));
 raise exception 'oversize accepted';
 exception when invalid_parameter_value then null;
 end;
 begin
 perform public.film_stock(gen_random_uuid(),t.site_id,'correct_return',b);
 raise exception 'unauthorized accepted';
 exception when insufficient_privilege then null;
 end;
 update public.film_stock_rolls set status='on_site' where id=r.id;
 begin
 perform public.film_stock(u,t.site_id,'correct_return',b||jsonb_build_object('requestId',gen_random_uuid(),'revision',n,'expectedReturned',q));
 raise exception 'moved roll accepted';
 exception when serialization_failure then null;
 end;
end $test$;
rollback;
