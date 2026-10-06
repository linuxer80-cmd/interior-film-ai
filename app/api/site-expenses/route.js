import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 완료보고를 제출해도 별도로 입력한 경비가 유지되는 기존 저장 구분입니다.
const PREFIX = "수익관리/경비: ";

const TYPES = {
  meal: "식비",
  parking: "주차비",
  fuel: "유류비",
  toll: "통행료",
  other: "기타 경비",
};

const FIELDS =
  "id,expense_type,amount,description,expense_date,created_by,created_at";

const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

const fail = (message, status) => {
  throw Object.assign(new Error(message), { status });
};

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

async function read(query) {
  const { data, error } = await query;

  if (error) throw error;

  return data;
}

async function authorize(db, token, siteId) {
  const { data, error } = await db.auth.getUser(token);

  if (error || !data?.user) {
    fail("다시 로그인해주세요.", 401);
  }

  const user = data.user;

  const profile = await read(
    db
      .from("profiles")
      .select("company_id,role,is_active")
      .eq("id", user.id)
      .maybeSingle()
  );

  if (profile?.is_active === false) {
    fail("비활성 계정입니다.", 403);
  }

  const site = await read(
    db
      .from("sites")
      .select("id,company_id,status,work_dates")
      .eq("id", siteId)
      .maybeSingle()
  );

  if (!site) {
    fail("이 현장을 이용할 수 없습니다.", 403);
  }

  const company = await read(
    db
      .from("companies")
      .select("id,is_active")
      .eq("id", site.company_id)
      .maybeSingle()
  );

  if (!company || company.is_active === false) {
    fail("이 현장을 이용할 수 없습니다.", 403);
  }

  const isAdmin =
    profile?.role === "owner" &&
    profile.company_id === site.company_id;

  if (!isAdmin) {
    const workers = await read(
      db
        .from("workers")
        .select("id")
        .eq("user_id", user.id)
        .eq("company_id", site.company_id)
        .eq("is_active", true)
    );

    if (!workers?.length) {
      fail("배정된 현장만 이용할 수 있습니다.", 403);
    }

    const ids = workers.map((worker) => worker.id);

    const scoped = (table) =>
      db
        .from(table)
        .select("id")
        .eq("site_id", siteId)
        .eq("company_id", site.company_id);

    const [legacy, anyDaily] = await Promise.all([
      read(
        scoped("site_workers")
          .in("worker_id", ids)
          .limit(1)
      ),
      read(
        scoped("site_daily_assignments")
          .limit(1)
      ),
    ]);

    let own = scoped("site_daily_assignments")
      .in("worker_id", ids);

    const explicit = Array.isArray(site.work_dates);

    let ownDaily = [];

    if (!explicit || site.work_dates.length) {
      if (explicit) {
        own = own.in("work_date", site.work_dates);
      }

      ownDaily = await read(own.limit(1));
    }

    if (
      explicit || anyDaily.length
        ? !ownDaily.length
        : !legacy.length
    ) {
      fail("배정된 현장만 이용할 수 있습니다.", 403);
    }
  }

  return { user, site, isAdmin };
}

async function handle(request) {
  try {
    const token = (
      request.headers.get("authorization") || ""
    ).match(/^Bearer (.+)$/i)?.[1];

    if (!token) {
      return json({ error: "로그인이 필요합니다." }, 401);
    }

    const body =
      request.method === "GET"
        ? Object.fromEntries(
            new URL(request.url).searchParams
          )
        : await request.json().catch(() => null);

    if (!uuid(body?.siteId)) {
      return json(
        { error: "현장 주소를 확인해주세요." },
        400
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return json(
        { error: "서버 설정을 확인해주세요." },
        503
      );
    }

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { user, site, isAdmin } = await authorize(
      db,
      token,
      body.siteId
    );

    const scoped = () => {
      let query = db
        .from("site_expenses")
        .select(FIELDS)
        .eq("company_id", site.company_id)
        .eq("site_id", site.id)
        .like("description", `${PREFIX}%`);

      if (!isAdmin) {
        query = query.eq("created_by", user.id);
      }

      return query;
    };

    const publicRow = (row) => ({
      id: row.id,
      expense_type: row.expense_type,
      amount: Number(row.amount),
      description: row.description.slice(PREFIX.length),
      expense_date: row.expense_date,
      mine: row.created_by === user.id,
    });

    if (request.method === "GET") {
      const rows = [];

      for (let offset = 0; ; offset += 500) {
        const batch = await read(
          scoped()
            .order("expense_date", { ascending: false })
            .order("id")
            .range(offset, offset + 499)
        );

        rows.push(...batch);

        if (batch.length < 500) break;
      }

      return json({
        success: true,
        isAdmin,
        canWrite: site.status !== "cancelled",
        expenses: rows.map(publicRow),
      });
    }

    if (site.status === "cancelled") {
      return json(
        {
          error:
            "취소된 현장의 경비는 변경할 수 없습니다.",
        },
        409
      );
    }

    if (!uuid(body.id)) {
      return json(
        {
          error:
            "저장 번호를 확인해주세요. 화면을 다시 열어주세요.",
        },
        400
      );
    }

    if (request.method === "DELETE") {
      let query = db
        .from("site_expenses")
        .delete()
        .eq("id", body.id)
        .eq("company_id", site.company_id)
        .eq("site_id", site.id)
        .like("description", `${PREFIX}%`);

      if (!isAdmin) {
        query = query.eq("created_by", user.id);
      }

      const removed = await read(
        query.select("id").maybeSingle()
      );

      if (!removed) {
        return json(
          {
            error:
              "삭제할 내역이 없거나 삭제 권한이 없습니다.",
          },
          404
        );
      }

      return json({ success: true });
    }

    const amountText = String(body.amount ?? "");
    const amount = Number(amountText);

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    if (
      !Object.hasOwn(TYPES, body.expense_type) ||
      !/^\d+$/.test(amountText) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 100000000 ||
      description.length > 200 ||
      !validDate(body.expense_date) ||
      body.expense_date > today()
    ) {
      return json(
        {
          error:
            "구분, 사용일, 금액(1원~1억원), 내용(200자 이하)을 확인해주세요.",
        },
        400
      );
    }

    const values = {
      id: body.id,
      company_id: site.company_id,
      site_id: site.id,
      expense_type: body.expense_type,
      amount,
      description:
        PREFIX + (description || TYPES[body.expense_type]),
      expense_date: body.expense_date,
      created_by: user.id,
    };

    const result = await db
      .from("site_expenses")
      .insert(values)
      .select(FIELDS)
      .single();

    // 같은 저장 요청을 다시 보내도 중복 등록하지 않습니다.
    if (result.error?.code === "23505") {
      const existing = await read(
        scoped().eq("id", body.id).maybeSingle()
      );

      if (
        !existing ||
        existing.created_by !== user.id ||
        existing.expense_type !== values.expense_type ||
        Number(existing.amount) !== amount ||
        existing.description !== values.description ||
        existing.expense_date !== values.expense_date
      ) {
        return json(
          {
            error:
              "이미 사용된 저장 번호입니다. 내역을 확인해주세요.",
          },
          409
        );
      }

      return json({
        success: true,
        expense: publicRow(existing),
      });
    }

    if (result.error) throw result.error;

    return json(
      {
        success: true,
        expense: publicRow(result.data),
      },
      201
    );
  } catch (error) {
    if (error.status) {
      return json({ error: error.message }, error.status);
    }

    console.error("site expenses", error);

    return json(
      {
        error:
          "경비 처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
      },
      500
    );
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
