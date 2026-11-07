CREATE OR REPLACE FUNCTION public.replace_site_daily_assignments(p_company_id uuid, p_site_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    r record;
BEGIN
    -- 현장 단위 동시 수정 방지
    PERFORM 1
    FROM public.sites
    WHERE id = p_site_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '현장을 찾을 수 없습니다.';
    END IF;

    IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION '배정 데이터 형식이 올바르지 않습니다.';
    END IF;

    -- 요청 데이터 검증
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_rows) item
        WHERE item->>'role' NOT IN ('leader','member')
           OR item->>'role' IS NULL
           OR item->>'work_date' IS NULL
           OR item->>'worker_id' IS NULL
    ) THEN
        RAISE EXCEPTION '날짜별 시공자 정보를 확인해주세요.';
    END IF;

    -- 임시 요청 테이블
    CREATE TEMP TABLE IF NOT EXISTS
    pg_temp.requested_assignments (
        work_date date,
        worker_id uuid,
        role text,
        PRIMARY KEY (work_date,worker_id)
    ) ON COMMIT DROP;

    TRUNCATE pg_temp.requested_assignments;

    INSERT INTO pg_temp.requested_assignments
        (work_date,worker_id,role)
    SELECT
        (item->>'work_date')::date,
        (item->>'worker_id')::uuid,
        item->>'role'
    FROM jsonb_array_elements(p_rows) item;

    -- 같은 날짜 팀장은 한 명만
    IF EXISTS (
        SELECT 1
        FROM pg_temp.requested_assignments
        WHERE role = 'leader'
        GROUP BY work_date
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION '같은 날짜에 팀장이 중복되었습니다.';
    END IF;

    -- 다른 업체 또는 비활성 시공자 차단
    IF EXISTS (
        SELECT 1
        FROM pg_temp.requested_assignments a
        LEFT JOIN public.workers w
          ON w.id = a.worker_id
         AND w.company_id = p_company_id
         AND w.is_active = true
        WHERE w.id IS NULL
    ) THEN
        RAISE EXCEPTION
        '다른 업체 또는 비활성 시공자가 포함되어 있습니다.';
    END IF;

    -- 변경된 팀장을 먼저 일반 팀원으로 변경
    -- 팀장 유일성 제약 충돌 방지
    UPDATE public.site_daily_assignments da
    SET role = 'member'
    WHERE da.site_id = p_site_id
      AND da.company_id = p_company_id
      AND da.role = 'leader'
      AND EXISTS (
          SELECT 1
          FROM pg_temp.requested_assignments a
          WHERE a.work_date = da.work_date
            AND a.worker_id = da.worker_id
            AND a.role = 'member'
      );

    -- 제거된 배정만 삭제
    DELETE FROM public.site_daily_assignments da
    WHERE da.site_id = p_site_id
      AND da.company_id = p_company_id
      AND NOT EXISTS (
          SELECT 1
          FROM pg_temp.requested_assignments a
          WHERE a.work_date = da.work_date
            AND a.worker_id = da.worker_id
      );

    -- 새 배정만 추가
    INSERT INTO public.site_daily_assignments
        (company_id,site_id,work_date,worker_id,role)
    SELECT
        p_company_id,
        p_site_id,
        a.work_date,
        a.worker_id,
        a.role
    FROM pg_temp.requested_assignments a
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.site_daily_assignments da
        WHERE da.site_id = p_site_id
          AND da.company_id = p_company_id
          AND da.work_date = a.work_date
          AND da.worker_id = a.worker_id
    );

    -- 기존 팀원에서 팀장으로 변경
    UPDATE public.site_daily_assignments da
    SET role = 'leader'
    FROM pg_temp.requested_assignments a
    WHERE da.site_id = p_site_id
      AND da.company_id = p_company_id
      AND da.work_date = a.work_date
      AND da.worker_id = a.worker_id
      AND a.role = 'leader'
      AND da.role <> 'leader';

    -- 현장별 시공자 명단 동기화
    DELETE FROM public.site_workers sw
    WHERE sw.site_id = p_site_id
      AND sw.company_id = p_company_id
      AND NOT EXISTS (
          SELECT 1
          FROM public.site_daily_assignments da
          WHERE da.site_id = sw.site_id
            AND da.company_id = sw.company_id
            AND da.worker_id = sw.worker_id
      );

    -- 기존 팀장을 먼저 해제
    UPDATE public.site_workers
    SET role = 'member'
    WHERE site_id = p_site_id
      AND company_id = p_company_id
      AND role = 'leader';

    -- 누락된 시공자 추가
    INSERT INTO public.site_workers
        (company_id,site_id,worker_id,role)
    SELECT DISTINCT
        p_company_id,
        p_site_id,
        da.worker_id,
        'member'
    FROM public.site_daily_assignments da
    WHERE da.site_id = p_site_id
      AND da.company_id = p_company_id
      AND NOT EXISTS (
          SELECT 1
          FROM public.site_workers sw
          WHERE sw.site_id = da.site_id
            AND sw.company_id = da.company_id
            AND sw.worker_id = da.worker_id
      );

    -- 현장 대표 팀장 반영
    UPDATE public.site_workers sw
    SET role = 'leader'
    WHERE sw.site_id = p_site_id
      AND sw.company_id = p_company_id
      AND sw.worker_id = (
          SELECT da.worker_id
          FROM public.site_daily_assignments da
          WHERE da.site_id = p_site_id
            AND da.company_id = p_company_id
            AND da.role = 'leader'
          ORDER BY da.work_date,da.worker_id
          LIMIT 1
      );

END;
$function$

