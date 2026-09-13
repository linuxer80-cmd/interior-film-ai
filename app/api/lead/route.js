import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("서버 환경 변수가 설정되지 않았습니다.");
    }

    const body = await request.json();

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
          customer_name: body.customer_name,
          phone: body.phone,
          region: body.region || null,
          category: body.category || null,
          sub_category: body.sub_category || null,
          ai_description: body.ai_description || null,
          estimate_min: body.estimate_min ?? null,
          estimate_max: body.estimate_max ?? null,
          estimate_average: body.estimate_average ?? null,
          customer_photo_path: body.customer_photo_path || null,
          status: "신규문의",
        },
      ])
      .select("id")
      .single();

    if (error) throw error;

    return Response.json({
      success: true,
      id: data.id,
    });
  } catch (error) {
    console.error("lead API 오류:", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "상담 신청 저장 오류",
      },
      { status: 500 }
    );
  }
}
