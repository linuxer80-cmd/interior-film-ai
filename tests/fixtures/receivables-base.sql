-- Read-only snapshot of existing production receivables functions, 2026-10-28.
-- Used only in isolated PostgreSQL tests of the new settlement wrapper.
CREATE OR REPLACE FUNCTION public.manage_site_receivables(p_user uuid, p_site uuid, p_action text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  c uuid;
  a public.site_payment_accounts%rowtype;
  e public.site_payment_entries%rowtype;
  result jsonb;
  amt numeric;
  net numeric;
  today date:=(now() at time zone 'Asia/Seoul')::date;
  req uuid;
  event_date date;
  due date;
  rev integer;
  skip integer;
  filter_name text;
  q text;
  replay boolean:=false;
begin
  select p.company_id into c
  from public.profiles p
  join public.companies co on co.id=p.company_id
  where p.id=p_user
    and p.role='owner'
    and p.is_active is distinct from false
    and co.is_active=true;

  if c is null then
    raise exception '활성 업체 관리자만 이용할 수 있습니다.'
      using errcode='42501';
  end if;

  if jsonb_typeof(p_body) is distinct from 'object' then
    raise exception '입력 형식을 확인해주세요.'
      using errcode='22023';
  end if;

  if p_action='list' then
    skip:=greatest(
      0,
      least(coalesce((p_body->>'page')::integer,0),100000)
    )*20;

    filter_name:=coalesce(p_body->>'filter','outstanding');
    q:=left(btrim(coalesce(p_body->>'q','')),100);

    if filter_name not in (
      'all','outstanding','overdue',
      'unconfirmed','settled','cancelled'
    ) then
      raise exception '조회 조건을 확인해주세요.'
        using errcode='22023';
    end if;

    with all_rows as materialized (
      select
        b.*,
        (b.outstanding>0 and b.due_date<today) overdue
      from public.site_receivable_balances b
      where b.company_id=c
    ),
    filtered as (
      select *
      from all_rows b
      where (
        case
          when filter_name='cancelled'
            then b.status='cancelled'
          else b.status is distinct from 'cancelled'
        end
      )
      and (
        q=''
        or strpos(
          lower(coalesce(b.site_name,'')||' '||coalesce(b.customer_name,'')),
          lower(q)
        )>0
      )
      and (
        filter_name in ('all','cancelled')
        or (filter_name='unconfirmed' and not b.confirmed)
        or (filter_name='outstanding' and b.outstanding>0)
        or (filter_name='overdue' and b.overdue)
        or (
          filter_name='settled'
          and b.confirmed
          and b.outstanding=0
        )
      )
    )
    select jsonb_build_object(
      'items',
      coalesce((
        select jsonb_agg(to_jsonb(t))
        from (
          select *
          from filtered
          order by
            overdue desc nulls last,
            due_date asc nulls last,
            id
          limit 20 offset skip
        ) t
      ),'[]'::jsonb),
      'count',(select count(*) from filtered),
      'summary',(
        select jsonb_build_object(
          'outstanding',coalesce(sum(outstanding),0),
          'overdue',coalesce(sum(outstanding) filter(where overdue),0),
          'unconfirmed',count(*) filter(where not confirmed),
          'unknownContract',count(*) filter(where contract_amount is null)
        )
        from all_rows
        where status is distinct from 'cancelled'
      )
    ) into result;

    return result;
  end if;

  if p_action not in ('get','initialize','add','void','due') then
    raise exception '지원하지 않는 요청입니다.'
      using errcode='22023';
  end if;

  perform 1
  from public.sites
  where id=p_site and company_id=c
  for update;

  if not found then
    raise exception '본인 업체의 현장만 이용할 수 있습니다.'
      using errcode='42501';
  end if;

  select * into a
  from public.site_payment_accounts
  where site_id=p_site and company_id=c
  for update;

  if p_action<>'get' then
    rev:=(p_body->>'revision')::integer;

    if p_action in ('initialize','add') then
      req:=(p_body->>'requestId')::uuid;
      amt:=(p_body->>'amount')::numeric;

      if req is null
        or amt is null
        or amt::text in ('NaN','Infinity','-Infinity')
        or amt<>trunc(amt)
        or amt<0
        or amt>1000000000000
        or (p_action='add' and amt=0)
      then
        raise exception '금액은 원 단위 정수로 입력해주세요.'
          using errcode='22023';
      end if;

      event_date:=(p_body->>'paidOn')::date;

      if event_date is null
        or event_date>today
        or event_date<date '1900-01-01'
      then
        raise exception '실제 입금일은 오늘 이전 날짜로 입력해주세요.'
          using errcode='22023';
      end if;
    end if;

    if p_action in ('initialize','due') then
      due:=nullif(p_body->>'dueDate','')::date;

      if due is not null
        and (due<date '1900-01-01' or due>date '2100-12-31')
      then
        raise exception '잔금 예정일을 확인해주세요.'
          using errcode='22023';
      end if;
    end if;

    if p_action='initialize'
      and a.site_id is not null
      and a.initial_request_id=req
    then
      if a.opening_paid<>amt or a.opening_date<>event_date then
        raise exception '같은 요청 번호로 다른 금액을 저장할 수 없습니다.'
          using errcode='22023';
      end if;

      replay:=true;

    elsif p_action='add' then
      select * into e
      from public.site_payment_entries
      where id=req;

      if found then
        if e.site_id<>p_site
          or e.company_id<>c
          or e.amount<>amt
          or e.paid_on<>event_date
          or e.direction is distinct from p_body->>'direction'
          or e.phase is distinct from p_body->>'phase'
          or e.method is distinct from p_body->>'method'
          or e.memo<>coalesce(btrim(p_body->>'memo'),'')
        then
          raise exception '같은 요청 번호로 다른 내역을 저장할 수 없습니다.'
            using errcode='22023';
        end if;

        replay:=true;
      end if;
    end if;

    if not replay then
      if rev is distinct from coalesce(a.revision,0) then
        raise exception '입금 내역이 변경되었습니다. 새로고침 후 확인해주세요.'
          using errcode='40001';
      end if;

      if p_action='initialize' then
        if a.site_id is not null then
          raise exception '이미 입금 관리를 시작한 현장입니다.'
            using errcode='22023';
        end if;

        insert into public.site_payment_accounts(
          site_id,company_id,opening_paid,opening_date,
          due_date,initial_request_id,created_by,updated_by
        )
        values(
          p_site,c,amt,event_date,due,req,p_user,p_user
        );
      else
        if a.site_id is null then
          raise exception '기존 입금액을 먼저 확인해주세요.'
            using errcode='22023';
        end if;

        if p_action='add' then
          if coalesce(p_body->>'direction','')
              not in ('payment','refund')
            or coalesce(p_body->>'phase','')
              not in ('deposit','interim','balance','other')
            or coalesce(p_body->>'method','')
              not in ('bank','cash','card','other')
            or length(coalesce(p_body->>'memo',''))>500
            or event_date<a.opening_date
          then
            raise exception '입금 구분·방법·날짜·메모를 확인해주세요. 시작일 전 내역은 추가할 수 없습니다.'
              using errcode='22023';
          end if;

          insert into public.site_payment_entries(
            id,site_id,company_id,direction,phase,
            amount,paid_on,method,memo,created_by
          )
          values(
            req,p_site,c,p_body->>'direction',
            p_body->>'phase',amt,event_date,
            p_body->>'method',
            coalesce(btrim(p_body->>'memo'),''),
            p_user
          );

        elsif p_action='void' then
          if nullif(btrim(p_body->>'reason'),'') is null
            or length(p_body->>'reason')>300
          then
            raise exception '취소 사유를 300자 이내로 입력해주세요.'
              using errcode='22023';
          end if;

          update public.site_payment_entries
          set
            voided_at=now(),
            voided_by=p_user,
            void_reason=btrim(p_body->>'reason')
          where id=(p_body->>'entryId')::uuid
            and site_id=p_site
            and company_id=c
            and voided_at is null;

          if not found then
            raise exception '이미 취소되었거나 없는 내역입니다.'
              using errcode='40001';
          end if;

        elsif p_action='due' then
          update public.site_payment_accounts
          set due_date=due
          where site_id=p_site and company_id=c;
        end if;

        select
          a.opening_paid+coalesce(sum(
            case when direction='payment'
              then amount else -amount
            end
          ),0)
        into net
        from public.site_payment_entries
        where site_id=p_site
          and company_id=c
          and voided_at is null;

        if net<0 or net>1000000000000 then
          raise exception '순입금액이 0원 미만이거나 허용 범위를 초과합니다. 환불·취소 내역을 확인해주세요.'
            using errcode='22023';
        end if;

        update public.site_payment_accounts
        set
          revision=revision+1,
          updated_at=now(),
          updated_by=p_user
        where site_id=p_site and company_id=c;
      end if;
    end if;
  end if;

  select jsonb_build_object(
    'site',to_jsonb(b),
    'entries',coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id)
      from public.site_payment_entries t
      where t.site_id=p_site and t.company_id=c
    ),'[]'::jsonb)
  )
  into result
  from public.site_receivable_balances b
  where b.id=p_site and b.company_id=c;

  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.manage_site_receivables_quick(p_user uuid, p_site uuid, p_action text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  c uuid;
  result jsonb;
  s jsonb;
  req uuid;
  amount_left numeric;
  paid numeric;
  e public.site_payment_entries%rowtype;
  today date := (now() at time zone 'Asia/Seoul')::date;
  f text;
  q text;
  skip integer;
begin
  select p.company_id into c
  from public.profiles p
  join public.companies co on co.id = p.company_id
  where p.id = p_user
    and p.role = 'owner'
    and p.is_active is distinct from false
    and co.is_active = true;

  if c is null then
    raise exception '관리자 권한이 필요합니다.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_body) is distinct from 'object' then
    raise exception '입력 형식을 확인해주세요.'
      using errcode = '22023';
  end if;

  if p_action = 'completed_list' then
    f := coalesce(p_body->>'filter', 'unpaid');
    q := left(btrim(coalesce(p_body->>'q', '')), 100);
    skip := greatest(
      0,
      least(coalesce((p_body->>'page')::integer, 0), 100000)
    ) * 10;

    if f not in ('unpaid', 'settled', 'all') then
      raise exception '조회 조건을 확인해주세요.'
        using errcode = '22023';
    end if;

    with base as materialized (
      select *
      from public.site_receivable_balances
      where company_id = c
        and status = 'completed'
    ),
    filtered as (
      select *
      from base
      where (
        q = ''
        or strpos(
          lower(
            coalesce(site_name, '') || ' ' ||
            coalesce(customer_name, '')
          ),
          lower(q)
        ) > 0
      )
      and (
        f = 'all'
        or (
          f = 'unpaid'
          and (
            not confirmed
            or outstanding > 0
            or contract_amount is null
          )
        )
        or (
          f = 'settled'
          and confirmed
          and contract_amount is not null
          and outstanding = 0
        )
      )
    )
    select jsonb_build_object(
      'items',
      coalesce((
        select jsonb_agg(to_jsonb(x))
        from (
          select *
          from filtered
          order by id
          limit 10 offset skip
        ) x
      ), '[]'::jsonb),
      'count', (select count(*) from filtered),
      'summary', (
        select jsonb_build_object(
          'outstanding', coalesce(sum(outstanding), 0),
          'unconfirmed', count(*) filter(where not confirmed)
        )
        from base
      )
    ) into result;

    return result;
  end if;

  if p_action <> 'settle' then
    return public.manage_site_receivables(
      p_user, p_site, p_action, p_body
    );
  end if;

  -- 기존 함수에서 업체 권한을 확인하고 현장 행을 잠급니다.
  result := public.manage_site_receivables(
    p_user, p_site, 'get', '{}'::jsonb
  );
  s := result->'site';
  req := (p_body->>'requestId')::uuid;

  if req is null then
    raise exception '저장 요청을 확인해주세요.'
      using errcode = '22023';
  end if;

  -- 같은 요청을 다시 보내더라도 추가 입금하지 않습니다.
  select * into e
  from public.site_payment_entries
  where id = req;

  if found then
    if e.company_id <> c
      or e.site_id <> p_site
      or e.created_by <> p_user
      or e.memo <> '전액입금 처리'
    then
      raise exception '이미 사용된 요청 번호입니다.'
        using errcode = '22023';
    end if;
    return result;
  end if;

  if s->>'status' <> 'completed' then
    raise exception '시공 완료 현장에서 처리해주세요.'
      using errcode = '22023';
  end if;

  if (s->>'contract_amount')::numeric is null
    or (s->>'contract_amount')::numeric <= 0
  then
    raise exception '계약금액을 먼저 확인해주세요.'
      using errcode = '22023';
  end if;

  if (s->>'revision')::integer
       is distinct from (p_body->>'revision')::integer
    or (s->>'contract_amount')::numeric
       is distinct from (p_body->>'contractAmount')::numeric
  then
    raise exception
      '계약금액 또는 입금 내역이 바뀌었습니다. 다시 확인해주세요.'
      using errcode = '40001';
  end if;

  -- 최초 전액입금도 취소 가능한 입금 내역으로 남깁니다.
  if not (s->>'confirmed')::boolean then
    result := public.manage_site_receivables(
      p_user,
      p_site,
      'initialize',
      jsonb_build_object(
        'revision', 0,
        'requestId', gen_random_uuid(),
        'amount', 0,
        'paidOn', today
      )
    );
    s := result->'site';
  end if;

  paid := coalesce((s->>'paid')::numeric, 0);
  amount_left := (s->>'contract_amount')::numeric - paid;

  if amount_left <= 0 then
    return result;
  end if;

  return public.manage_site_receivables(
    p_user,
    p_site,
    'add',
    jsonb_build_object(
      'revision', (s->>'revision')::integer,
      'requestId', req,
      'amount', amount_left,
      'paidOn', today,
      'direction', 'payment',
      'phase', 'balance',
      'method', 'other',
      'memo', '전액입금 처리'
    )
  );
end
$function$;
