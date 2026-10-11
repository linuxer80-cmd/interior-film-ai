import {
  privateAuth,
  privateJson as json,
} from "../../../lib/workerPrivate";

import {
  GET as mySites,
} from "../worker/my-sites/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const take = result => {
  if (result.error) throw result.error;
  return result.data;
};

const normalize = value =>
  String(value || "")
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/^영림인테리어필름$/, "영림")
    .replace(/^현대$/, "현대보닥");

export async function GET(request) {
  try {
    const auth = await privateAuth(request, false);

    if (auth.error) {
      return json(
        { error: auth.error },
        auth.status
      );
    }

    // 기존 내 현장 API가 인증과 본인 배정 여부를 검증합니다.
    const url = new URL(request.url);
    url.pathname = "/api/worker/my-sites";
    url.search = "";

    const response = await mySites(
      new Request(url, {
        headers: request.headers,
      })
    );

    const info = await response.json();

    if (!response.ok) {
      return json(info, response.status);
    }

    const day = today();

    // 오늘 이후 팀장으로 배정된 날짜가 있는 진행 현장만 허용합니다.
    // 날짜별 팀장 배정이 없는 과거 방식의 기록은 허용하지 않습니다.
    const sites = (info.sites || []).filter(site =>
      !["completed", "cancelled"].includes(
        site.status || site.site_status
      ) &&
      site.assigned_dates?.some(assignment =>
        assignment.role === "leader" &&
        assignment.work_date >= day
      )
    );

    const companyIds = [
      ...new Set(
        sites.map(site => site.company_id)
      ),
    ];

    const companies = companyIds.length
      ? take(
          await auth.db
            .from("companies")
            .select("id,company_name")
            .in("id", companyIds)
        )
      : [];

    const choices = sites.map(site => ({
      id: site.site_id,
      company_id: site.company_id,

      company_name:
        companies.find(company =>
          company.id === site.company_id
        )?.company_name || "업체",

      site_name:
        site.site_name ||
        site.customer_name ||
        site.region ||
        "현장",

      work_dates: site.assigned_dates
        .filter(assignment =>
          assignment.role === "leader" &&
          assignment.work_date >= day
        )
        .map(assignment => assignment.work_date),
    }));

    const siteId = new URL(request.url)
      .searchParams.get("siteId");

    if (!siteId) {
      return json({
        sites: choices,
        materials: [],
        selectedSite: null,
        state: choices.length
          ? "choose_site"
          : "no_leader_site",
      });
    }

    const selected = choices.find(
      site => site.id === siteId
    );

    if (!selected) {
      return json(
        {
          error:
            "오늘 이후 팀장으로 배정된 현장의 자재만 조회할 수 있습니다.",
        },
        403
      );
    }

    const setting = take(
      await auth.db
        .from("company_inventory_preferences")
        .select("enabled")
        .eq("company_id", selected.company_id)
        .maybeSingle()
    );

    // 설정이 없거나 사용하지 않는 업체는 0m로 표시하지 않습니다.
    if (!setting?.enabled) {
      return json({
        sites: choices,
        selectedSite: selected,
        materials: [],
        state: "unavailable",
        message:
          "이 업체는 재고관리 기능을 사용하지 않아 재고 상황을 파악할 수 없습니다.",
      });
    }

    const materials = take(
      await auth.db
        .from("site_materials")
        .select(
          "id,brand,product_code,product_name,quantity,unit"
        )
        .eq("site_id", siteId)
        .eq("company_id", selected.company_id)
    );

    if (!materials.length) {
      return json({
        sites: choices,
        selectedSite: selected,
        materials: [],
        state: "no_materials",
        message:
          "현장에 사용 필름이 등록되지 않았습니다. 관리자에게 확인해주세요.",
      });
    }

    const rolls = [];

    const productCodes = [
      ...new Set(
        materials
          .map(material => material.product_code)
          .filter(Boolean)
      ),
    ];

    for (
      let offset = 0;
      offset < productCodes.length;
      offset += 100
    ) {
      for (let start = 0; ; start += 500) {
        const rows = take(
          await auth.db
            .from("film_stock_rolls")
            .select(
              "id,brand,product_code,remaining"
            )
            .eq(
              "company_id",
              selected.company_id
            )
            .eq("status", "available")
            .gt("remaining", 0)
            .in(
              "product_code",
              productCodes.slice(
                offset,
                offset + 100
              )
            )
            .range(start, start + 499)
        );

        rolls.push(...rows);

        if (rows.length < 500) break;
      }
    }

    return json({
      sites: choices,
      selectedSite: selected,
      state: "available",

      materials: materials.map(material => ({
        ...material,

        available_m: rolls
          .filter(roll =>
            normalize(roll.brand) ===
              normalize(material.brand) &&
            normalize(roll.product_code) ===
              normalize(material.product_code)
          )
          .reduce(
            (sum, roll) =>
              sum + Number(roll.remaining || 0),
            0
          ),
      })),
    });
  } catch (error) {
    console.error(
      "worker-stock",
      error.code || error.message
    );

    return json(
      {
        error: ["42P01", "PGRST205"].includes(
          error.code
        )
          ? "현장별 재고관리 SQL을 먼저 실행해주세요."
          : "재고를 조회하지 못했습니다. 재고 없음과는 다른 상태입니다. 다시 확인해주세요.",
      },
      503
    );
  }
}
