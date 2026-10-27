import { createClient } from "@supabase/supabase-js";
import { nextSiteStatus } from "../../../../lib/siteLifecycle.mjs";
import { siteFields, rows, companySites } from "../../../../lib/workerSiteAssignments.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

// Shared with the server calendar synchronizer; assignment precedence stays identical.
function normalizeFilmBrand(value) {
  const brand = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9가-힣]/g, "");

  return [
    "현대",
    "현대보닥",
    "현대보닥BODAQ",
    "HYUNDAIBODAQ",
    "BODAQ",
  ].includes(brand)
    ? "HYUNDAIBODAQ"
    : brand;
}

function materialSample(material, products) {
  if (material.film_product_id) {
    return (
      products.find(
        (product) =>
          product.id === material.film_product_id
      )?.sample_image_path || null
    );
  }

  const brand = normalizeFilmBrand(material.brand);

  const code = String(material.product_code || "")
    .trim()
    .toUpperCase();

  if (!brand || !code) return null;

  const matches = products.filter(
    (product) =>
      normalizeFilmBrand(product.brand) === brand &&
      String(product.product_code || "")
        .trim()
        .toUpperCase() === code
  );

  return matches.length === 1
    ? matches[0].sample_image_path || null
    : null;
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

    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        {
          error:
            "로그인이 만료되었습니다. 다시 로그인해주세요.",
        },
        401
      );
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    if (siteId !== null && !uuid.test(siteId)) {
      return json(
        { error: "현장 주소를 확인해주세요." },
        400
      );
    }

    const [linked, profileResult] = await Promise.all([
      rows(
        db
          .from("workers")
          .select(
            "id,company_id,name,phone,is_active"
          )
          .eq("user_id", auth.user.id)
          .eq("is_active", true)
          .order("id")
      ),
      db
        .from("profiles")
        .select("is_active,role,company_id,name")
        .eq("id", auth.user.id)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      throw profileResult.error;
    }

    // Owners can use the personal worker home with the same session even
    // before a worker membership or public recruiting profile is registered.
    // This does not create a membership or grant access to unassigned sites.
    async function ownerHome() {
      const profile = profileResult.data;
      if (siteId || profile?.role !== "owner" ||
          profile.is_active === false || !profile.company_id) return null;
      const company = await db.from("companies").select("id,is_active")
        .eq("id", profile.company_id).maybeSingle();
      if (company.error) throw company.error;
      if (company.data?.is_active !== true) return null;
      return json({
        worker: {
          user_id: auth.user.id,
          worker_id: auth.user.id,
          worker_name: profile.name || "관리자",
          worker_phone: "",
          worker_is_active: true,
          membership_worker_ids: [],
          independent: true,
        },
        sites: [],
      });
    }

    if (!linked.length) {
      const home = await ownerHome();
      if (home) return home;
    }

    if (
      profileResult.data?.is_active === false ||
      !linked.length
    ) {
      return json(
        {
          error:
            "연결된 활성 시공자 계정이 없습니다. 회사 관리자에게 계정 연결을 확인해주세요.",
        },
        403
      );
    }

    const companies = await rows(
      db
        .from("companies")
        .select("id,is_active")
        .in(
          "id",
          [
            ...new Set(
              linked.map(
                (worker) => worker.company_id
              )
            ),
          ]
        )
        .order("id")
    );

    const activeCompanies = new Set(
      companies
        .filter(
          (company) => company.is_active !== false
        )
        .map((company) => company.id)
    );

    const workers = linked.filter((worker) =>
      activeCompanies.has(worker.company_id)
    );

    if (!workers.length) {
      const home = await ownerHome();
      if (home) return home;
      return json(
        {
          error:
            "사용 가능한 소속 업체가 없습니다.",
        },
        403
      );
    }

    const first = workers[0];

    const worker = {
      user_id: auth.user.id,
      membership_worker_ids: workers.map(item => item.id),
      worker_id: first.id,
      worker_name: first.name,
      worker_phone: first.phone,
      worker_is_active: true,
    };

    if (
      searchParams.get("profileOnly") === "1" &&
      !siteId
    ) {
      return json({ worker });
    }

    const sites = (
      await Promise.all(
        [...activeCompanies].map((companyId) =>
          companySites(
            db,
            companyId,
            workers
              .filter(
                (item) =>
                  item.company_id === companyId
              )
              .map((item) => item.id),
            siteId
          )
        )
      )
    )
      .flat()
      .sort((a, b) =>
        (a.schedule_start || "9999").localeCompare(
          b.schedule_start || "9999"
        )
      );

    // Names are fetched only for companies already authorized by worker assignment.
    const companyIds = [...new Set(sites.map(site => site.company_id).filter(Boolean))];
    if (companyIds.length) {
      const { data: companies, error: companiesError } = await db
        .from("companies")
        .select("id,company_name")
        .in("id", companyIds);
      if (companiesError) throw companiesError;
      const names = new Map((companies || []).map(company => [company.id, company.company_name]));
      for (const site of sites) {
        site.company_name = names.get(site.company_id) || "업체명 확인 필요";
      }
    }

    if (!siteId && sites.length) {
      // Only read reports for sites assigned to this authenticated worker.
      const reportsBySite = new Map();
      for (let offset = 0; offset < sites.length; offset += 100) {
        const batch = sites.slice(offset, offset + 100);
        const ids = batch.map(site => site.site_id);
        const companyIds = [...new Set(batch.map(site => site.company_id))];
        const {data: reports, error: reportError} = await db
          .from("work_reports")
          .select("site_id,company_id,review_status,updated_at")
          .in("company_id", companyIds)
          .in("site_id", ids)
          .order("updated_at", {ascending:false});
        if (reportError) throw reportError;
        for (const report of reports || []) {
          const key = report.company_id + ":" + report.site_id;
          if (!reportsBySite.has(key)) reportsBySite.set(key, report.review_status);
        }
      }
      for (const site of sites) {
        site.report_review_status = reportsBySite.get(site.company_id + ":" + site.site_id) || null;
      }
    }

    if (!siteId) {
      return json({ worker, sites });
    }

    const site = sites.find(
      (item) => item.site_id === siteId
    );

    if (!site) {
      return json(
        {
          error:
            "현재 로그인 계정에 배정된 현장이 아닙니다. 배정이 변경되었거나 다른 계정으로 로그인했는지 관리자에게 확인해주세요.",
        },
        404
      );
    }

    const siteWorker = workers.find(item => item.company_id === site.company_id && item.id === site.worker_id);
    Object.assign(worker, {
      worker_id: siteWorker.id,
      worker_name: siteWorker.name,
      worker_phone: siteWorker.phone,
      company_id: site.company_id,
    });

    let materials = [];
    let materialsError = null;

    try {
      materials = (
        await rows(
          db
            .from("site_materials")
            .select(
              "id,film_product_id,brand,product_code,product_name,quantity,unit,memo,price_type"
            )
            .eq("company_id", site.company_id)
            .eq("site_id", siteId)
            .eq("material_type", "planned")
            .is("removed_at", null)
            .order("id")
        )
      ).map(({ id, ...material }) => ({
        ...material,
        material_id: id,
      }));
    } catch (error) {
      console.error(
        "시공자 예정 자재 조회 오류:",
        error
      );

      materialsError =
        "예정 자재를 불러오지 못했습니다. 다시 확인해주세요.";
    }

    const productIds = [
      ...new Set(
        materials
          .map((item) => item.film_product_id)
          .filter(Boolean)
      ),
    ];

    const productCodes = [
      ...new Set(
        materials
          .filter((item) => !item.film_product_id)
          .flatMap((item) => {
            const code = String(
              item.product_code || ""
            ).trim();

            return code
              ? [
                  code,
                  code.toUpperCase(),
                  code.toLowerCase(),
                ]
              : [];
          })
      ),
    ];

    try {
      const productsById = new Map();
      const fields =
        "id,brand,product_code,sample_image_path";

      for (
        let offset = 0;
        offset < productIds.length;
        offset += 100
      ) {
        const products = await rows(
          db
            .from("film_products")
            .select(fields)
            .in(
              "id",
              productIds.slice(
                offset,
                offset + 100
              )
            )
            .order("id")
        );

        products.forEach((product) =>
          productsById.set(product.id, product)
        );
      }

      for (
        let offset = 0;
        offset < productCodes.length;
        offset += 100
      ) {
        const products = await rows(
          db
            .from("film_products")
            .select(fields)
            .in(
              "product_code",
              productCodes.slice(
                offset,
                offset + 100
              )
            )
            .order("id")
        );

        products.forEach((product) =>
          productsById.set(product.id, product)
        );
      }

      const products = [...productsById.values()];

      materials = materials.map((material) => ({
        ...material,
        sample_image_path: materialSample(
          material,
          products
        ),
      }));
    } catch (error) {
      console.error(
        "필름 샘플 조회 오류:",
        error
      );
    }

    return json({
      worker,
      site,
      materials,
      materialsError,
    });
  } catch (error) {
    console.error(
      "시공자 현장 조회 오류:",
      error
    );

    return json(
      {
        error:
          "배정 현장을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.",
      },
      500
    );
  }
}

