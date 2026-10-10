import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  SHOWCASE_BUCKET,
  publishedCases,
} from "./showcaseValidation.mjs";

export async function loadCustomerHomepage(slug) {
  const normalized = String(slug || "").trim().toLowerCase();

  if (!/^[a-z0-9-]{1,100}$/.test(normalized)) {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: company, error } = await db
    .from("companies")
    .select(
      "id,company_name,slug,phone,representative_name,logo_url"
    )
    .eq("slug", normalized)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !company) {
    return null;
  }

  const [
    settingsResult,
    profileResult,
    casesResult,
  ] = await Promise.all([
    db
      .from("company_settings")
      .select(
        "estimate_enabled,ai_estimate_enabled,virtual_install_enabled,film_samples_enabled,minimum_estimate,similarity_threshold,estimate_title,estimate_description,customer_phone,contact_url"
      )
      .eq("company_id", company.id)
      .maybeSingle(),

    db
      .from("company_public_profiles")
      .select(
        "company_id,introduction,regions,services,business_name,representative_name,business_number,business_address,public_phone,public_email,blog_url,place_url,is_published"
      )
      .eq("company_id", company.id)
      .eq("is_published", true)
      .maybeSingle(),

    db
      .from("company_public_cases")
      .select(
        "id,company_id,title,category,region,description,film,before_paths,after_paths,is_published,sort_order,created_at"
      )
      .eq("company_id", company.id)
      .eq("is_published", true)
      .order("sort_order")
      .order("created_at", { ascending: false })
      .limit(24),
  ]);

  // 업체 소개가 비공개이면 모든 시공 사례도 숨깁니다.
  const profile = profileResult.error
    ? null
    : profileResult.data;

  const cases = profile
    ? publishedCases(
        casesResult.error ? [] : casesResult.data,
        company.id
      )
    : [];

  const paths = [
    ...new Set(
      cases.flatMap((item) => [
        ...item.before_paths,
        ...item.after_paths,
      ])
    ),
  ];

  const signed = new Map();

  if (paths.length) {
    const { data } = await db.storage
      .from(SHOWCASE_BUCKET)
      .createSignedUrls(paths, 1800);

    for (const image of data || []) {
      if (image.signedUrl) {
        signed.set(image.path, image.signedUrl);
      }
    }
  }

  return {
    company,

    settings: settingsResult.error
      ? null
      : settingsResult.data,

    profile,

    cases: cases
      .map((item) => ({
        ...item,

        before: item.before_paths
          .map((path) => signed.get(path))
          .filter(Boolean),

        after: item.after_paths
          .map((path) => signed.get(path))
          .filter(Boolean),
      }))
      .filter((item) => item.after.length),
  };
}
