import { completionSeed, normalizeHeader } from "../../../../lib/completionEstimate.mjs";
import { createClient } from "@supabase/supabase-js";
import { GET as getProfit } from "../profit/route";
import { sellingMaterialPrices, mergeCatalogSellingPrices } from "../../../../lib/dealerPriceImport.mjs";
import { allPriceRows } from "../../../../lib/dealerPriceServer";

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

const fail = (message, status) =>
  Object.assign(new Error(message), { status });

const uuid =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

const categories = new Set([
  "film",
  "labor",
  "expense",
  "supplies", "meal", "overhead",
]);

async function authorize(request, siteId) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    throw fail("관리자 로그인이 필요합니다.", 401);
  }

  if (!uuid.test(siteId || "")) {
    throw fail("현장을 확인해주세요.", 400);
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const {
    data: auth,
    error,
  } = await db.auth.getUser(token);

  if (error || !auth.user) {
    throw fail("다시 로그인해주세요.", 401);
  }

  const profile = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profile.error) {
    throw profile.error;
  }

  if (
    profile.data?.role !== "owner" ||
    profile.data.is_active !== true ||
    !profile.data.company_id
  ) {
    throw fail("관리자 권한이 필요합니다.", 403);
  }

  const companyId = profile.data.company_id;

  const company = await db
    .from("companies")
    .select("is_active,company_name,representative_name,phone")
    .eq("id", companyId)
    .maybeSingle();

  if (company.error) {
    throw company.error;
  }

  if (company.data?.is_active !== true) {
    throw fail("업체 사용 상태를 확인해주세요.", 403);
  }

  const site = await db
    .from("sites")
    .select(
      "id,site_name,customer_name,customer_type,address,address_detail,status,work_dates,schedule_start",
    )
    .eq("company_id", companyId)
    .eq("id", siteId)
    .maybeSingle();

  if (site.error) {
    throw site.error;
  }

  if (!site.data) {
    throw fail("현장을 찾을 수 없습니다.", 404);
  }

  if (site.data.status === "cancelled") throw fail("취소된 현장에서는 작성할 수 없습니다.", 409);


  return {
    db,
    companyId,
    userId: auth.user.id,
    site: site.data,
    company: company.data,
  };
}

/*
 * DB:
 *   document = { items: [...], note: "..." }
 *   revision = 수정 버전
 *
 * 화면:
 *   { items, note, version, updated_at }
 */
function toSaved(row) {
  if (!row) return null;

  if (
    !row.document ||
    !Array.isArray(row.document.items) ||
    typeof row.document.note !== "string" ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  ) {
    throw fail(
      "저장된 견적서 형식이 다릅니다. 기존 데이터를 확인해주세요.",
      409,
    );
  }

  return {
    header: row.document.header,
    vat: row.document.vat || "none",
    useDefaultNote: row.document.useDefaultNote === true,
    items: row.document.items,
    note: row.document.note,
    version: row.revision,
    updated_at: row.updated_at,
  };
}

function handleError(error) {
  console.error(
    "completion estimate",
    error.code || error.message,
  );

  const message = [
    "42P01",
    "PGRST205",
  ].includes(error.code)
    ? "완료 견적서 테이블을 찾을 수 없습니다. DB 연결을 확인해주세요."
    : ["42703", "PGRST204"].includes(error.code)
      ? "견적서 조회에 필요한 DB 항목을 확인하지 못했습니다. 관리자에게 오류 코드를 전달해주세요: " + error.code
    : error.status
      ? error.message
      : "완료 견적서를 처리하지 못했습니다. 다시 시도해주세요.";

  return json(
    { error: message },
    error.status || 500,
  );
}


async function readDefaults(db, companyId) {
  const result = await db.from("company_estimate_defaults").select("bank_account,note")
    .eq("company_id",companyId).maybeSingle();
  if (result.error) return { bank_account:"", note:"", unavailable:true };
  return { bank_account:result.data?.bank_account || "", note:result.data?.note || "" };
}

export async function GET(request) {
  try {
    const siteId = new URL(
      request.url,
    ).searchParams.get("siteId");

    const {
      db,
      companyId,
      site, company, userId,
    } = await authorize(request, siteId);

    const defaults = await readDefaults(db, companyId);
    const saved = await db
      .from("site_completion_estimates")
      .select("document,revision,updated_at")
      .eq("company_id", companyId)
      .eq("site_id", siteId)
      .maybeSingle();

    if (saved.error) {
      throw saved.error;
    }

    const savedDocument = toSaved(saved.data);

    /*
     * 기존 수익관리 API의 비용 계산을 재사용합니다.
     * 인건비·팀장수당·승인된 연장비용의 계산 기준을
     * 수익관리 화면과 동일하게 유지합니다.
     */
    const url = new URL(
      "/api/admin/profit",
      request.url,
    );

    url.searchParams.set("siteId", siteId);

    const partialWarnings = [];
    let profit = { sites: [], breakdown: { labor: [], material: [], expense: [] } };
    try {
      const response = await getProfit(new Request(url, { headers: request.headers }));
      const result = await response.json();
      if ([401, 403, 404].includes(response.status)) throw fail(result.error || "현장 접근 권한을 확인해주세요.", response.status);
      if (!response.ok || !result.sites?.some(row => row.id === siteId) || !result.breakdown) {
        throw fail("자동 비용 집계 불가", 502);
      }
      profit = result;
    } catch (error) {
      if ([401, 403, 404].includes(error.status)) throw error;
      console.error("completion estimate cost source", error.code || error.message);
      partialWarnings.push("인건비·경비 자동 집계를 불러오지 못했습니다. 관리자가 누락된 항목을 직접 입력해주세요.");
    }
    const breakdown = profit.breakdown;
    let estimateMaterials = [];
    try {
      const operations = await db.rpc("site_operations", {
        p_user: userId, p_site: siteId, p_action: "get", p_body: { siteId, action: "get" },
      });
      if (operations.error?.code === "42501") throw fail("현장 자재 조회 권한을 확인해주세요.", 403);
      if (operations.error || !Array.isArray(operations.data?.materials)) throw operations.error || Error("자재 응답 누락");
      estimateMaterials = operations.data.materials;
    } catch (error) {
      if (error.status === 403) throw error;
      console.error("completion estimate material source", error.code || error.message);
      partialWarnings.push("현장 필름 물량을 불러오지 못했습니다. 필름명·사용 미터·단가를 직접 확인해 입력해주세요.");
    }
    let sellingWarning = "";
    // This document quotes the interior contractor, regardless of legacy customer_type.
    // Clear purchase prices before any lookup so missing/failed selling prices stay blank.
    const sellingApplied = true;
    estimateMaterials = estimateMaterials.map(row => ({ ...row, unitPrice: null }));
    {
      const priceColumn = "interior_price";
      const priceLabel = "인테리어업자";
      try {
        const optionalPrices = promise => promise.catch(error => {
          if (["42P01", "PGRST205"].includes(error?.code)) return [];
          throw error;
        });
        const [metadata, products, prices, catalog] = await Promise.all([
          allPriceRows(() => db.from("site_materials").select("*").eq("company_id",companyId).eq("site_id",siteId).eq("material_type","planned").order("id")),
          allPriceRows(() => db.from("film_products").select("id,brand,product_code,legacy_non_fire_code").order("id")),
          optionalPrices(allPriceRows(() => db.from("company_film_selling_prices").select("product_id,price_type,interior_price,consumer_price").eq("company_id",companyId).order("product_id").order("price_type"))),
          optionalPrices(allPriceRows(() => db.from("film_catalog_prices").select("product_id,price_type,interior_price,vat_included").order("product_id").order("price_type"))),
        ]);
        estimateMaterials = sellingMaterialPrices(estimateMaterials,metadata,products,mergeCatalogSellingPrices(prices,catalog),priceColumn);
        sellingWarning = `등록한 ${priceLabel} 판매단가(VAT 제외)를 적용합니다. 판매단가가 없거나 방염 구분이 불명확한 항목은 단가를 비워두므로 직접 확인해주세요.`;
      } catch {
        sellingWarning = "인테리어업자 판매단가를 불러오지 못해 필름 단가를 비워두었습니다. 판매단가를 확인해 입력해주세요.";
      }
    }
    const automatic = completionSeed(site, company, breakdown, estimateMaterials);
    if (sellingApplied) {
      // Never leak historical purchase-cost fallback rows into a customer quote.
      const filmRows = completionSeed(site, company, {...breakdown,material:[]},estimateMaterials).items.filter(x=>x.category==='film');
      automatic.items = [...filmRows,...automatic.items.filter(x=>x.category!=='film')];
    }
    automatic.note = defaults.note;
    automatic.header.bank_account = defaults.bank_account;
    automatic.useDefaultNote = true;

    const pending =
      profit.sites.find(
        (row) => row.id === siteId,
      )?.laborPending || 0;

    return json({
      site,
      automatic, defaults,
      saved: savedDocument ? { ...savedDocument, header: { ...(savedDocument.header || automatic.header), customer_name: automatic.header.customer_name, site_name: automatic.header.site_name, address: automatic.header.address } } : null,

      warning: [
        ...partialWarnings,
        sellingWarning,
        defaults.unavailable ? '업체 기본 비고·계좌 설정을 불러오지 못했습니다.' : '',
        pending ? `일당이 확인되지 않은 배정 ${pending}건이 있습니다. 인건비를 확인해주세요.` : "",
        automatic.items.some(row => row.quantityPending) ? "사용량이 미확정인 필름은 수량을 비워두었습니다. 예상 수량을 입력하거나 현장 반입량을 확인해주세요." : "",
        automatic.items.some(row => row.pricePending) ? "단가가 없는 필름은 금액을 확인해주세요." : "",
      ].filter(Boolean).join(" "),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request
      .json()
      .catch(() => {
        throw fail(
          "입력 형식을 확인해주세요.",
          400,
        );
      });

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      throw fail(
        "입력 형식을 확인해주세요.",
        400,
      );
    }

    const {
      db,
      companyId,
      userId,
    } = await authorize(request, body.siteId);

    if (body.action === "saveDefaults") {
      if(typeof body.note !== "string" || body.note.length > 3000 ||
         typeof body.bank_account !== "string" || body.bank_account.length > 500)
        throw fail("고정 비고·계좌번호를 확인해주세요.",400);
      const {error} = await db.from("company_estimate_defaults").upsert({
        company_id:companyId,note:body.note.trim(),bank_account:body.bank_account.trim(),
        updated_at:new Date().toISOString()
      },{onConflict:"company_id"});
      if(error) throw fail("업체 기본 설정 저장에 실패했습니다. 설정 테이블 연결을 확인해주세요.",503);
      return json({defaults:{note:body.note.trim(),bank_account:body.bank_account.trim()}});
    }

    if (
      !Number.isSafeInteger(body.version) ||
      body.version < 0 ||
      body.version > 2000000000 ||
      !Array.isArray(body.items) ||
      body.items.length > 300 ||
      typeof body.note !== "string" ||
      body.note.length > 3000
    ) {
      throw fail(
        "견적서 입력값을 확인해주세요. 항목은 최대 300개입니다.",
        400,
      );
    }

    let header;
    try { header = normalizeHeader(body.header); } catch (error) { throw fail(error.message, 400); }
    const vat = body.vat || "none";
    if (!["none", "included", "separate"].includes(vat)) throw fail("부가세 구분을 확인해주세요.", 400);
    const items = body.items.map((item) => {
      if (
        !item ||
        !categories.has(item.category) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 500 ||
        typeof item.unit !== "string" ||
        item.unit.length > 20 ||
        typeof item.quantity !== "number" ||
        !Number.isFinite(item.quantity) ||
        item.quantity < 0 ||
        item.quantity > 1000000 ||
        !Number.isSafeInteger(item.amount) ||
        item.amount < 0 ||
        item.amount > 1000000000
      ) {
        throw fail(
          "항목명·수량·금액을 확인해주세요. 금액은 0 이상의 정수입니다.",
          400,
        );
      }

      const unitPrice = item.unit_price == null || item.unit_price === "" ? null : Number(item.unit_price);
      if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000000 || Math.round(unitPrice * item.quantity) !== item.amount)) throw fail("수량 × 단가와 금액을 확인해주세요.", 400);
      return {
        unit_price: unitPrice,
        category: item.category,
        name: item.name.trim(),
        quantity: item.quantity,
        unit: item.unit.trim(),
        amount: item.amount,
      };
    });

    const value = {
      document: {
        header, vat,
        useDefaultNote: body.useDefaultNote === true,
        items,
        note: body.note.trim(),
      },
      updated_by: userId,
      updated_at: new Date().toISOString(),
      revision: body.version + 1,
    };

    const table = db.from(
      "site_completion_estimates",
    );

    /*
     * 처음 저장: INSERT
     * 수정 저장: 읽었던 revision과 같을 때만 UPDATE
     */
    const result =
      body.version === 0
        ? await table
            .insert({
              ...value,
              site_id: body.siteId,
              company_id: companyId,
            })
            .select(
              "document,revision,updated_at",
            )
            .single()
        : await table
            .update(value)
            .eq("site_id", body.siteId)
            .eq("company_id", companyId)
            .eq("revision", body.version)
            .select(
              "document,revision,updated_at",
            )
            .maybeSingle();

    if (
      result.error?.code === "23505" ||
      (!result.error && !result.data)
    ) {
      throw fail(
        "다른 화면에서 먼저 저장했습니다. 저장본을 다시 불러온 후 수정해주세요.",
        409,
      );
    }

    if (result.error) {
      throw result.error;
    }

    return json({
      saved: toSaved(result.data),
    });
  } catch (error) {
    return handleError(error);
  }
        }




