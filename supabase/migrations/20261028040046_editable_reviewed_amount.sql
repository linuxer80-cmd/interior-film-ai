-- Keep the existing owner authorization and site/payment locks for every action.
create or replace function public.manage_site_settlement(
 p_user uuid, p_site uuid, p_action text, p_body jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 result jsonb;
 r public.work_reports%rowtype;
 amount numeric;
 company uuid;
begin
 result := public.manage_site_receivables_quick(p_user,p_site,
   case when p_action='revise_approved_amount' then 'get' else p_action end,p_body);
 if p_action in ('list','completed_list') then return result; end if;
 company := (result->'site'->>'company_id')::uuid;
 if company is null then raise exception '현장 정보를 확인해주세요.' using errcode='42501'; end if;
 select * into r from public.work_reports
 where site_id=p_site and company_id=company
 order by updated_at desc,id asc limit 1 for update;
 if p_action='revise_approved_amount' then
   if r.id is null or r.review_status is distinct from 'approved' then
     raise exception '검수 승인된 완료보고의 금액만 수정할 수 있습니다.' using errcode='22023';
   end if;
   if result->'site'->>'status'='cancelled' then
     raise exception '취소된 현장의 금액은 수정할 수 없습니다.' using errcode='22023';
   end if;
   amount := (p_body->>'amount')::numeric;
   if amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<>trunc(amount)
      or amount<1 or amount>1000000000000 then
     raise exception '검수금액은 1원 이상, 원 단위로 입력해주세요.' using errcode='22023';
   end if;
   if r.id is distinct from (p_body->>'reportId')::uuid then
     raise exception '완료보고가 변경되었습니다. 다시 확인해주세요.' using errcode='40001';
   end if;
   -- An identical retry is read-only, even if the original response was lost.
   if r.approved_amount is distinct from amount then
     if r.updated_at is distinct from (p_body->>'reportUpdatedAt')::timestamptz
        or (result->'site'->>'revision')::integer is distinct from (p_body->>'revision')::integer then
       raise exception '검수금액 또는 입금 내역이 변경되었습니다. 다시 확인해주세요.' using errcode='40001';
     end if;
     update public.work_reports set approved_amount=amount,reviewed_by=p_user,updated_at=clock_timestamp()
       where id=r.id and company_id=company returning * into r;
     -- Never initialize an unknown payment as zero. Existing ledger amounts stay intact.
     update public.site_payment_accounts set revision=revision+1,updated_at=now(),updated_by=p_user
       where site_id=p_site and company_id=company;
     result := public.manage_site_receivables_quick(p_user,p_site,'get','{}'::jsonb);
   end if;
 end if;
 return result || jsonb_build_object('approvedReport',case when r.review_status='approved' then
   jsonb_build_object('id',r.id,'amount',r.approved_amount,'updatedAt',r.updated_at) else null end);
end $$;
revoke all on function public.manage_site_settlement(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_site_settlement(uuid,uuid,text,jsonb) to service_role;

-- Record exact old/new reviewed amounts in the existing report history.
create or replace function app_private.audit_work_report()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; previous_cost jsonb; kind text; who text; amount_edit boolean;
begin
 if tg_op='UPDATE' and (new.review_status,new.work_summary,new.memo,new.approved_amount,new.completed_at,new.review_memo)
  is not distinct from (old.review_status,old.work_summary,old.memo,old.approved_amount,old.completed_at,old.review_memo) then return new; end if;
 actor:=case when new.review_status in ('approved','rejected') then new.reviewed_by else new.created_by end;
 select coalesce((select name from public.profiles where id=actor and company_id=new.company_id),
   (select name from public.workers where user_id=actor and company_id=new.company_id limit 1),'담당자') into who;
 select after_cost into previous_cost from public.work_report_history where report_id=new.id order by created_at desc,id desc limit 1;
 amount_edit:=tg_op='UPDATE' and old.review_status='approved' and new.review_status='approved'
   and old.approved_amount is distinct from new.approved_amount;
 kind:=case when tg_op='INSERT' then 'submit' when amount_edit then 'edit' when new.review_status='approved' then 'approve'
   when new.review_status='rejected' then 'reject' when old.review_status='rejected' then 'resubmit' else 'edit' end;
 insert into public.work_report_history(company_id,site_id,report_id,event,actor_id,actor_name,before_status,after_status,before_cost,after_cost,reason)
 values(new.company_id,new.site_id,new.id,kind,actor,who,case when tg_op='UPDATE' then old.review_status end,new.review_status,
 case when tg_op='UPDATE' then coalesce(previous_cost,'{}'::jsonb)||jsonb_build_object('approved_amount',old.approved_amount) else previous_cost end,
 app_private.report_cost_snapshot(new.site_id)||jsonb_build_object('approved_amount',new.approved_amount),
 case when amount_edit then format('검수금액 수정: %s원 → %s원',old.approved_amount,new.approved_amount)
   when new.review_status in ('approved','rejected') then new.review_memo else new.work_summary end);
 return new;
end $$;
