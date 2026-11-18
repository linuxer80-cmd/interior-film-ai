create or replace function public.review_site_extra_work(p_user uuid,p_site uuid,p_id uuid,p_action text,p_amount numeric default null,p_note text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.sites%rowtype; r public.site_extra_work%rowtype; base numeric; total numeric; report public.work_reports%rowtype;
begin
 if p_action is null or p_action not in ('approve','reject','cancel') then raise exception '요청을 확인해주세요.' using errcode='22023'; end if;
 if length(coalesce(p_note,''))>1000 then raise exception '검토 메모는 1000자 이하입니다.' using errcode='22023'; end if;
 select * into s from public.sites where id=p_site for update;
 if not found or not exists(select 1 from public.companies where id=s.company_id and is_active=true)
 then raise exception '현장을 확인해주세요.' using errcode='42501'; end if;
 if p_action<>'cancel' and not exists(select 1 from public.profiles where id=p_user and company_id=s.company_id and role='owner' and is_active is distinct from false)
 then raise exception '본인 업체 관리자만 승인할 수 있습니다.' using errcode='42501'; end if;
 select * into r from public.site_extra_work where id=p_id and site_id=s.id and company_id=s.company_id for update;
 if not found then raise exception '추가 작업을 확인해주세요.' using errcode='42501'; end if;
 if p_action='cancel' and r.requested_by is distinct from p_user then raise exception '본인 요청만 취소할 수 있습니다.' using errcode='42501'; end if;
 if r.status<>'pending' then raise exception '이미 처리된 요청입니다. 새로고침해주세요.' using errcode='40001'; end if;
 if p_action='approve' then
  if s.status='cancelled' then raise exception '취소된 현장은 승인할 수 없습니다.' using errcode='22023'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<0 or p_amount>1000000000 or p_amount<>trunc(p_amount) then raise exception '승인 금액을 원 단위로 입력해주세요.' using errcode='22023'; end if;
  select * into report from public.work_reports where site_id=s.id and company_id=s.company_id order by updated_at desc,id asc limit 1 for update;
  base:=case when report.review_status='approved' and report.approved_amount>0 then report.approved_amount else s.contract_amount end;
  if base is null or base<0 then raise exception '기존 계약금액을 먼저 확정해주세요. 추가 금액만으로 전체 계약금액을 만들지 않습니다.' using errcode='22023'; end if;
  total:=base+p_amount;
  if total>1000000000 then raise exception '전체 계약금액 범위를 확인해주세요.' using errcode='22023'; end if;
  if report.review_status='approved' and report.approved_amount>0 then
   update public.work_reports set approved_amount=total,reviewed_by=p_user,updated_at=clock_timestamp() where id=report.id and company_id=s.company_id;
  else
   update public.sites set contract_amount=total where id=s.id and company_id=s.company_id;
  end if;
  update public.site_payment_accounts set revision=revision+1,updated_at=now(),updated_by=p_user where site_id=s.id and company_id=s.company_id;
 elsif p_action='reject' and btrim(coalesce(p_note,''))='' then
  raise exception '반려 사유를 입력해주세요.' using errcode='22023';
 end if;
 update public.site_extra_work set status=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'cancelled' end,
 approved_amount=case when p_action='approve' then p_amount else null end, review_note=coalesce(p_note,''),reviewed_by=p_user,reviewed_at=now() where id=r.id;
 return jsonb_build_object('success',true,'contractAmount',case when report.review_status='approved' and report.approved_amount>0 then s.contract_amount else total end,'settlementAmount',total);
end $$;
revoke all on function public.review_site_extra_work(uuid,uuid,uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.review_site_extra_work(uuid,uuid,uuid,text,numeric,text) to service_role;
