import { createClient } from "@supabase/supabase-js";
import {
  validateQuote,
  quoteSeed,
} from "../../../../lib/consultationQuote";

export const dynamic = "force-dynamic";

const reply = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

const fail = (message, status) =>
  Object.assign(Error(message), { status });

async function context(request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    throw fail("관리자 로그인이 필요합니다.", 401);
  }

  const siteId = new URL(request.url)
    .searchParams.get("siteId");

  if (
    !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i
      .test(siteId || "")
  ) {
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
    }
  );

  const auth = await db.auth.getUser(token);

  if (auth.error || !auth.data?.user) {
    throw fail("다시 로그인해주세요.", 401);
  }

  const profile = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", auth.data.user.id)
    .maybeSingle();

  if (profile.error) throw profile.error;

  if (
    profile.data?.role !== "owner" ||
    profile.data.is_active !== true
  ) {
    throw fail("관리자 권한이 필요합니다.", 403);
  }

  const companyId = profile.data.company_id;

  const company = await db
    .from("companies")
    .select("company_name,is_active")
    .eq("id", companyId)
    .maybeSingle();

  if (company.error) throw company.error;

  if (company.data?.is_active !== true) {
    throw fail("업체 사용 상태를 확인해주세요.", 403);
  }

  const site = await db
    .from("sites")
    .select(
      "id,customer_name,customer_phone,address,address_detail,work_description,work_dates,consultation_quote_seed"
    )
    .eq("company_id", companyId)
    .eq("id", siteId)
    .maybeSingle();

  if (site.error) throw site.error;

  if (!site.data) {
    throw fail("현장을 찾을 수 없습니다.", 404);
  }

  return {
    db,
    siteId,
    companyId,
    company: company.data,
    site: site.data,
  };
}

const errorResponse = (error) =>
  reply({
    error: error.status
      ? error.message
      : "상담 견적서를 처리하지 못했습니다. SQL 적용 여부와 연결을 확인해주세요.",
  }, error.status || 500);

export async function GET(request) {
  try {
    const {
      db,
      siteId,
      companyId,
      company,
      site,
    } = await context(request);

    const saved = await db
      .from("site_consultation_quotes")
      .select("document,revision")
      .eq("company_id", companyId)
      .eq("site_id", siteId)
      .maybeSingle();

    if (saved.error) throw saved.error;
    if (saved.data) return reply(saved.data);

    const last = await db
      .from("site_consultation_quotes")
      .select("document")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last.error) throw last.error;

    const prior = last.data?.document || {};
    const seed = site.consultation_quote_seed || quoteSeed(site);

    const draft = {
      title: "인테리어필름시공 견적서",
      company_name: company.company_name || "",
      business_number: "",
      company_phone: "",
      footer: "",
      vat: "separate",

      ...Object.fromEntries(
        [
          "title",
          "company_name",
          "business_number",
          "company_phone",
          "footer",
          "vat",
        ]
          .filter((key) => typeof prior[key] === "string")
          .map((key) => [key, prior[key]])
      ),

      customer_name: site.customer_name || "",
      customer_phone: site.customer_phone || "",
      address: [
        site.address,
        site.address_detail,
      ].filter(Boolean).join(" "),
      work_date: seed.work_date || "",
      duration: "",
      customer_note: "",
      other_schedule: seed.other_schedule || "",
      items: (seed.items || []).map((item) => ({
        ...item,
        unit_price: "",
      })),
    };

    return reply({
      document: validateQuote(draft),
      revision: 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const {
      db,
      siteId,
      companyId,
    } = await context(request);

    const text = await request.text();

    if (text.length > 200000) {
      throw fail("견적서 내용이 너무 깁니다.", 413);
    }

    let body;

    try {
      body = JSON.parse(text);
    } catch {
      throw fail("요청 형식을 확인해주세요.", 400);
    }

    if (
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0
    ) {
      throw fail("저장 버전을 확인해주세요.", 400);
    }

    let document;

    try {
      document = validateQuote(body.document);
    } catch (error) {
      throw fail(error.message, 400);
    }

    const value = {
      document,
      revision: body.revision + 1,
      updated_at: new Date().toISOString(),
    };

    const table = db.from("site_consultation_quotes");

    const write = body.revision === 0
      ? table.insert({
          ...value,
          site_id: siteId,
          company_id: companyId,
        })
      : table
          .update(value)
          .eq("company_id", companyId)
          .eq("site_id", siteId)
          .eq("revision", body.revision);

    const saved = await write
      .select("document,revision")
      .maybeSingle();

    if (
      saved.error?.code === "23505" ||
      (!saved.error && !saved.data)
    ) {
      throw fail(
        "다른 화면에서 저장되었습니다. 입력을 복사한 뒤 저장본을 다시 불러와주세요.",
        409
      );
    }

    if (saved.error) throw saved.error;

    return reply(saved.data);
  } catch (error) {
    return errorResponse(error);
  }
}
