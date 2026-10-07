import { createClient } from "@supabase/supabase-js";
import { GET as profitGET } from "../profit/route";

export const runtime = "nodejs";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });

const uuid = (value) =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
    value
  );

const date = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) ===
    value;

const monthOK = (value) =>
  typeof value === "string" &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
  Number(value.slice(0, 4)) >= 2000;

async function rows(query) {
  const result = [];

  for (let offset = 0; offset < 100000; offset += 500) {
    const { data, error } = await query.range(
      offset,
      offset + 499
    );

    if (error) throw error;

    result.push(...data);

    if (data.length < 500) {
      return result;
    }
  }

  throw Error("조회 내역이 너무 많습니다.");
}

async function admin(request) {
  const token = (
    request.headers.get("authorization") || ""
  ).match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    return {
      error: "로그인이 필요합니다.",
      status: 401,
    };
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return {
      error: "서버 설정을 확인해주세요.",
      status: 503,
    };
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);

  if (error || !user) {
    return {
      error: "로그인이 만료되었습니다.",
      status: 401,
    };
  }

  const {
    data: profile,
    error: profileError,
  } = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  if (
    !profile?.company_id ||
    profile.role !== "owner" ||
    profile.is_active === false
  ) {
    return {
      error: "관리자 권한이 필요합니다.",
      status: 403,
    };
  }

  const {
    data: company,
    error: companyError,
  } = await db
    .from("companies")
    .select("id,is_active")
    .eq("id", profile.company_id)
    .maybeSingle();

  if (companyError) throw companyError;

  if (!company || company.is_active === false) {
    return {
      error: "업체를 확인할 수 없습니다.",
      status: 403,
    };
  }

  return {
    db,
    companyId: profile.company_id,
    userId: user.id,
  };
}

export async function GET(request) {
  try {
    const auth = await admin(request);

    if (auth.error) {
      return json(
        { error: auth.error },
        auth.status
      );
    }

    const month = new URL(
      request.url
    ).searchParams.get("month");

    if (!monthOK(month)) {
      return json(
        { error: "조회 월을 확인해주세요." },
        400
      );
    }

    const last = new Date(
      Date.UTC(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)),
        0
      )
    )
      .toISOString()
      .slice(0, 10);

    const url = new URL(request.url);

    url.pathname = "/api/admin/profit";
    url.search = `?from=${month}-01&to=${last}`;

    const response = await profitGET(
      new Request(url, {
        headers: request.headers,
      })
    );

    const profit = await response.json();

    if (!response.ok) {
      return json(profit, response.status);
    }

    const [payments, workers] = await Promise.all([
      rows(
        auth.db
          .from("labor_payment_records")
          .select(
            "id,worker_id,amount,paid_on,memo,cancelled_at"
          )
          .eq("company_id", auth.companyId)
          .eq("labor_month", `${month}-01`)
          .order("paid_on")
          .order("id")
      ),

      rows(
        auth.db
          .from("workers")
          .select("id,name")
          .eq("company_id", auth.companyId)
          .order("id")
      ),
    ]);

    return json({
      labor: profit.breakdown.labor,
      payments,
      workers,
    });
  } catch (error) {
    console.error("labor payments GET", error);

    return json(
      {
        error:
          "인건비 지급 내역을 불러오지 못했습니다.",
      },
      500
    );
  }
}

export async function POST(request) {
  try {
    const auth = await admin(request);

    if (auth.error) {
      return json(
        { error: auth.error },
        auth.status
      );
    }

    const body = await request.json();

    const today = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).format(new Date());

    if (
      !uuid(body.id) ||
      !uuid(body.workerId) ||
      !monthOK(body.month) ||
      !date(body.paidOn) ||
      body.paidOn > today ||
      !Number.isSafeInteger(body.amount) ||
      body.amount <= 0 ||
      body.amount > 1000000000 ||
      body.confirmed !== true ||
      typeof body.memo !== "string" ||
      body.memo.length > 200
    ) {
      return json(
        {
          error:
            "지급 금액·지급일·지급 확인을 확인해주세요.",
        },
        400
      );
    }

    const {
      data: worker,
      error: workerError,
    } = await auth.db
      .from("workers")
      .select("id")
      .eq("company_id", auth.companyId)
      .eq("id", body.workerId)
      .maybeSingle();

    if (workerError) throw workerError;

    if (!worker) {
      return json(
        { error: "소속 시공자를 확인해주세요." },
        404
      );
    }

    const record = {
      id: body.id,
      company_id: auth.companyId,
      worker_id: body.workerId,
      labor_month: `${body.month}-01`,
      amount: body.amount,
      paid_on: body.paidOn,
      memo: body.memo.trim(),
      created_by: auth.userId,
    };

    const { error } = await auth.db
      .from("labor_payment_records")
      .insert(record);

    if (error?.code === "23505") {
      const {
        data: previous,
        error: readError,
      } = await auth.db
        .from("labor_payment_records")
        .select("*")
        .eq("company_id", auth.companyId)
        .eq("id", body.id)
        .maybeSingle();

      if (readError) throw readError;

      if (
        !previous ||
        previous.cancelled_at ||
        [
          "worker_id",
          "labor_month",
          "amount",
          "paid_on",
          "memo",
        ].some(
          (key) =>
            String(previous[key]) !==
            String(record[key])
        )
      ) {
        return json(
          {
            error:
              "이미 처리된 요청입니다. 내역을 새로 조회해주세요.",
          },
          409
        );
      }
    } else if (error) {
      throw error;
    }

    return json({ success: true });
  } catch (error) {
    console.error("labor payments POST", error);

    return json(
      {
        error:
          "지급 기록을 저장하지 못했습니다. 같은 화면에서 다시 시도해주세요.",
      },
      500
    );
  }
}

export async function PATCH(request) {
  try {
    const auth = await admin(request);

    if (auth.error) {
      return json(
        { error: auth.error },
        auth.status
      );
    }

    const { id } = await request.json();

    if (!uuid(id)) {
      return json(
        { error: "취소할 기록을 확인해주세요." },
        400
      );
    }

    const { data, error } = await auth.db
      .from("labor_payment_records")
      .update({
        cancelled_at: new Date().toISOString(),
        cancelled_by: auth.userId,
      })
      .eq("company_id", auth.companyId)
      .eq("id", id)
      .is("cancelled_at", null)
      .select("id");

    if (error) throw error;

    if (!data.length) {
      return json(
        {
          error:
            "이미 취소되었거나 없는 지급 기록입니다.",
        },
        409
      );
    }

    return json({ success: true });
  } catch (error) {
    console.error("labor payments PATCH", error);

    return json(
      { error: "지급 기록 취소에 실패했습니다." },
      500
    );
  }
}
