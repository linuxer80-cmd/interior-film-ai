import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function cleanText(value, maxLength = 1000) {
  if (typeof value !== "string") return null;

  const text = value.trim();

  if (!text) return null;

  return text.slice(0, maxLength);
}

function cleanNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

export async function POST(request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "서버 환경 변수가 설정되지 않았습니다."
      );
    }

    const body = await request.json();

    const customerName =
      cleanText(body.customer_name, 100);

    const phone =
      cleanText(body.phone, 50);

    if (!customerName || !phone) {
      return Response.json(
        {
          success: false,
          error: "이름과 연락처가 필요합니다.",
        },
        { status: 400 }
      );
    }

    const photoPaths =
      Array.isArray(body.customer_photo_paths)
        ? body.customer_photo_paths
            .filter(
              (item) =>
                typeof item === "string" &&
                item.startsWith("leads/")
            )
            .slice(0, 20)
        : [];

    const estimateDetails =
      Array.isArray(body.estimate_details)
        ? body.estimate_details
            .slice(0, 20)
            .map((item) => ({
              group_key:
                cleanText(item?.group_key, 100),
              category:
                cleanText(item?.category, 100),
              sub_category:
                cleanText(
                  item?.sub_category,
                  100
                ),
              photo_count:
                cleanNumber(item?.photo_count),
              estimate_min:
                cleanNumber(item?.estimate_min),
              estimate_max:
                cleanNumber(item?.estimate_max),
              estimate_average:
                cleanNumber(
                  item?.estimate_average
                ),
              confidence:
                cleanText(
                  item?.confidence,
                  50
                ),
              similar_count:
                cleanNumber(
                  item?.similar_count
                ),
            }))
        : [];

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data, error } = await supabase
      .from("customer_leads")
      .insert([
        {
          customer_name: customerName,
          phone,
          region:
            cleanText(body.region, 200),

          category:
            cleanText(body.category, 100),

          sub_category:
            cleanText(
              body.sub_category,
              100
            ),

          ai_description:
            cleanText(
              body.ai_description,
              10000
            ),

          estimate_min:
            cleanNumber(
              body.estimate_min
            ),

          estimate_max:
            cleanNumber(
              body.estimate_max
            ),

          estimate_average:
            cleanNumber(
              body.estimate_average
            ),

          customer_photo_path:
            photoPaths[0] ||
            cleanText(
              body.customer_photo_path,
              1000
            ),

          customer_photo_paths:
            photoPaths,

          estimate_details:
            estimateDetails,

          status: "신규문의",

          memo:
            cleanText(
              body.memo,
              5000
            ),
        },
      ])
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return Response.json({
      success: true,
      id: data.id,
    });
  } catch (error) {
    console.error(
      "lead API 오류:",
      error?.message
    );

    return Response.json(
      {
        success: false,
        error:
          error?.message ||
          "상담 신청 저장 오류",
      },
      { status: 500 }
    );
  }
}
