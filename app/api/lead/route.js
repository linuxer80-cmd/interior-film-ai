import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

    // ============================================================
    // 기본 입력값 확인
    // ============================================================

    const customerName =
      String(body.customer_name || "").trim();

    const phone =
      String(body.phone || "").trim();

    if (!customerName) {
      return Response.json(
        {
          success: false,
          error: "고객명을 입력해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    if (!phone) {
      return Response.json(
        {
          success: false,
          error: "전화번호를 입력해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    // ============================================================
    // 고객사진 여러 장 처리
    // ============================================================

    let customerPhotoPaths = [];

    if (Array.isArray(body.customer_photo_paths)) {
      customerPhotoPaths =
        body.customer_photo_paths
          .filter(Boolean)
          .map((path) => String(path));
    }

    // 기존 1장 방식도 호환
    if (
      customerPhotoPaths.length === 0 &&
      body.customer_photo_path
    ) {
      customerPhotoPaths = [
        String(body.customer_photo_path),
      ];
    }

    // 중복 경로 제거
    customerPhotoPaths = [
      ...new Set(customerPhotoPaths),
    ];

    // 기존 컬럼에는 대표사진 첫 장 저장
    const customerPhotoPath =
      customerPhotoPaths[0] ||
      body.customer_photo_path ||
      null;

    // ============================================================
    // Supabase 관리자 연결
    // ============================================================

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

    // ============================================================
    // 상담 저장
    // ============================================================

    const { data, error } = await supabase
      .from("customer_leads")
      .insert([
        {
          customer_name: customerName,

          phone,

          region:
            body.region || null,

          category:
            body.category || null,

          sub_category:
            body.sub_category || null,

          ai_description:
            body.ai_description || null,

          estimate_min:
            body.estimate_min ?? null,

          estimate_max:
            body.estimate_max ?? null,

          estimate_average:
            body.estimate_average ?? null,

          // 기존 1장 대표사진
          customer_photo_path:
            customerPhotoPath,

          // 새 여러 장 사진 배열
          customer_photo_paths:
            customerPhotoPaths,

          status: "신규문의",

          memo:
            body.memo || null,
        },
      ])
      .select(
        `
        id,
        customer_photo_path,
        customer_photo_paths
        `
      )
      .single();

    if (error) {
      throw error;
    }

    return Response.json({
      success: true,

      id: data.id,

      customer_photo_path:
        data.customer_photo_path,

      customer_photo_paths:
        data.customer_photo_paths || [],
    });
  } catch (error) {
    console.error(
      "lead API 오류:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error?.message ||
          "상담 신청 저장 오류",
      },
      {
        status: 500,
      }
    );
  }
}
