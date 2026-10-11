import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

async function readRows(query) {
  const result = [];

  for (let offset = 0; offset < 50000; offset += 500) {
    const { data, error } = await query.range(
      offset,
      offset + 499
    );

    if (error) throw error;

    result.push(...(data || []));

    if (!data || data.length < 500) return result;
  }

  throw new Error("Too many memberships");
}

export async function GET(request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];

    if (!token) {
      return json(
        { error: "시공자 로그인이 필요합니다." },
        401
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

    const { data: auth, error: authError } =
      await db.auth.getUser(token);

    if (authError || !auth?.user) {
      return json(
        { error: "다시 로그인해주세요." },
        401
      );
    }

    const [workers, profile] = await Promise.all([
      readRows(
        db
          .from("workers")
          .select("id,company_id,name")
          .eq("user_id", auth.user.id)
          .eq("is_active", true)
          .order("id")
      ),
      db
        .from("profiles")
        .select("is_active")
        .eq("id", auth.user.id)
        .maybeSingle(),
    ]);

    if (profile.error) throw profile.error;

    if (
      profile.data?.is_active === false ||
      !workers.length
    ) {
      return json(
        {
          error:
            "연결된 활성 시공자 계정이 없습니다.",
        },
        403
      );
    }

    const companyIds = [
      ...new Set(
        workers.map(worker => worker.company_id)
      ),
    ];

    const companies = [];

    for (
      let offset = 0;
      offset < companyIds.length;
      offset += 100
    ) {
      companies.push(
        ...(await readRows(
          db
            .from("companies")
            .select("id,company_name,is_active")
            .in(
              "id",
              companyIds.slice(offset, offset + 100)
            )
            .order("id")
        ))
      );
    }

    const active = companies.filter(
      company => company.is_active !== false
    );

    if (!active.length) {
      return json(
        { error: "사용 가능한 소속 업체가 없습니다." },
        403
      );
    }

    return json({
      companies: active.map(company => ({
        company_id: company.id,
        company_name:
          company.company_name || "업체명 미등록",
        worker_ids: workers
          .filter(
            worker => worker.company_id === company.id
          )
          .map(worker => worker.id),
      })),
    });
  } catch (error) {
    console.error("worker companies GET", error);

    return json(
      {
        error:
          "소속 업체를 불러오지 못했습니다. 다시 확인해주세요.",
      },
      500
    );
  }
}
