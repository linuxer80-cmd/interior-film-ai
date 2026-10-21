import { withFilmFireTypes } from "../../../lib/filmFireTypes";
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

async function rows(query) {
  const result = [];

  for (let offset = 0; offset < 50000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);

    if (error) throw error;

    result.push(...(data || []));

    if (!data || data.length < 500) return result;
  }

  throw Error("반출 기록 조회 범위를 초과했습니다.");
}

export async function GET(request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];

    if (!token) {
      return json({ error: "로그인이 필요합니다." }, 401);
    }

    const siteId = new URL(request.url).searchParams.get("siteId");

    if (
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
        siteId || ""
      )
    ) {
      return json({ error: "현장을 확인해주세요." }, 400);
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

    const auth = await db.auth.getUser(token);

    if (auth.error || !auth.data.user) {
      return json({ error: "다시 로그인해주세요." }, 401);
    }

    // 기존 현장 접근 권한 검사를 먼저 통과해야 합니다.
    const state = await db.rpc("site_operations", {
      p_user: auth.data.user.id,
      p_site: siteId,
      p_action: "get",
      p_body: {},
    });

    if (state.error) {
      if (["42501", "P0001"].includes(state.error.code)) {
        return json(
          { error: "이 현장을 조회할 권한이 없습니다." },
          403
        );
      }

      throw state.error;
    }

    if (!state.data || !Array.isArray(state.data.materials)) {
      throw Error("현장 자재 응답을 확인해주세요.");
    }

    state.data = await withFilmFireTypes(db, siteId, state.data);

    const site = await db
      .from("sites")
      .select("company_id")
      .eq("id", siteId)
      .single();

    if (site.error) throw site.error;

    const companyId = site.data.company_id;

    const [trips, issues, workers, profiles] = await Promise.all([
      rows(
        db
          .from("film_stock_trips")
          .select(
            "id,roll_id,material_id,issued,returned,issued_at,returned_at,issued_by"
          )
          .eq("company_id", companyId)
          .eq("site_id", siteId)
          .order("id")
      ),
      rows(
        db
          .from("site_material_issues")
          .select(
            "id,material_id,quantity,created_by,created_at,voided_at"
          )
          .eq("company_id", companyId)
          .eq("site_id", siteId)
          .order("id")
      ),
      rows(
        db
          .from("workers")
          .select("id,user_id,name")
          .eq("company_id", companyId)
          .order("id")
      ),
      rows(
        db
          .from("profiles")
          .select("id,name,role")
          .eq("company_id", companyId)
          .order("id")
      ),
    ]);

    const rolls = [];
    const rollIds = [
      ...new Set(trips.map((t) => t.roll_id).filter(Boolean)),
    ];

    for (let offset = 0; offset < rollIds.length; offset += 100) {
      rolls.push(
        ...(await rows(
          db
            .from("film_stock_rolls")
            .select("id,label")
            .eq("company_id", companyId)
            .in("id", rollIds.slice(offset, offset + 100))
            .order("id")
        ))
      );
    }

    const rollNames = new Map(
      rolls.map((roll) => [roll.id, roll.label])
    );

    const workerNames = new Map(
      workers
        .filter((worker) => worker.user_id)
        .map((worker) => [worker.user_id, worker.name])
    );

    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile])
    );

    const actor = (id) => {
      const profile = profileMap.get(id);

      if (profile?.role === "owner") {
        return {
          name: profile.name || "관리자",
          role: "owner",
        };
      }

      if (workerNames.has(id)) {
        return {
          name: workerNames.get(id) || "시공자",
          role: "worker",
        };
      }

      return {
        name: profile?.name || "기록자 확인 필요",
        role: profile?.role || "unknown",
      };
    };

    const materials = state.data.materials.map((material) => {
      const total = Number(material.issued || 0);

      const rollTrips = trips.filter(
        (trip) =>
          trip.material_id === material.id &&
          Number(trip.issued) > 0
      );

      // 롤 반출은 수량 이력에도 반영될 수 있으므로
      // 동일 자재의 롤 기록과 수량 기록을 이중 표시하지 않습니다.
      const records = rollTrips.length
        ? rollTrips.map((trip) => ({
            id: trip.id,
            ...actor(trip.issued_by),
            quantity: Number(trip.issued),
            unit: "m",
            at: trip.issued_at,
            roll: rollNames.get(trip.roll_id) || "롤",
            returned:
              trip.returned == null
                ? null
                : Number(trip.returned),
            returnedAt: trip.returned_at,
          }))
        : issues
            .filter(
              (issue) =>
                issue.material_id === material.id &&
                !issue.voided_at &&
                Number(issue.quantity) > 0
            )
            .map((issue) => ({
              id: issue.id,
              ...actor(issue.created_by),
              quantity: Number(issue.quantity),
              unit: material.unit,
              at: issue.created_at,
              roll: null,
              returned: null,
              returnedAt: null,
            }));

      return {
        id: material.id,
        brand: material.brand,
        code: material.code || material.name,
        unit: material.unit,
        issued: total,
        records:
          total > 0
            ? records.sort((a, b) =>
                String(b.at).localeCompare(String(a.at))
              )
            : [],
      };
    });

    const issuedCount = materials.filter(
      (material) => material.issued > 0
    ).length;

    return json({
      siteId,
      updatedAt: new Date().toISOString(),
      materials,
      issuedCount,
      materialCount: materials.length,
      status: !materials.length
        ? "unregistered"
        : !issuedCount
          ? "none"
          : issuedCount === materials.length
            ? "recorded"
            : "partial",
    });
  } catch (error) {
    console.error(
      "material-issue-status",
      error.code || error.message
    );

    return json(
      {
        error:
          "반출 기록을 확인하지 못했습니다. 다시 조회해주세요.",
      },
      500
    );
  }
}
