import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 서버 환경 변수가 설정되지 않았습니다."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function nullableText(value) {
  const text = String(value || "").trim();

  return text || null;
}

function nullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.round(number);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

export async function POST(request) {
  try {
    const body = await request.json();

    /* ======================================
       기본 입력값 확인
    ====================================== */

    const customerName =
      nullableText(body.customer_name);

    const phone =
      nullableText(body.phone);

    const region =
      nullableText(body.region);

    if (!customerName) {
      return NextResponse.json(
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
      return NextResponse.json(
        {
          success: false,
          error: "전화번호를 입력해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    if (!region) {
      return NextResponse.json(
        {
          success: false,
          error: "시공 지역을 입력해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    /* ======================================
       고객사진 경로 정리
    ====================================== */

    let customerPhotoPaths = [];

    if (
      Array.isArray(
        body.customer_photo_paths
      )
    ) {
      customerPhotoPaths =
        body.customer_photo_paths
          .map((path) =>
            String(path || "").trim()
          )
          .filter(Boolean);
    }

    /*
      예전 1장 방식도 계속 지원합니다.
    */

    if (
      customerPhotoPaths.length === 0 &&
      body.customer_photo_path
    ) {
      customerPhotoPaths = [
        String(
          body.customer_photo_path
        ).trim(),
      ].filter(Boolean);
    }

    /*
      같은 사진 경로 중복 제거
    */

    customerPhotoPaths = [
      ...new Set(customerPhotoPaths),
    ];

    const customerPhotoPath =
      customerPhotoPaths[0] || null;

    /* ======================================
       Supabase 관리자 연결
    ====================================== */

    const supabase =
      createAdminClient();

    /* ======================================
       고객 상담 저장
    ====================================== */

    const leadPayload = {
      customer_name: customerName,
      phone,
      region,

      category: nullableText(
        body.category
      ),

      sub_category: nullableText(
        body.sub_category
      ),

      ai_description: nullableText(
        body.ai_description
      ),

      estimate_min: nullableNumber(
        body.estimate_min
      ),

      estimate_max: nullableNumber(
        body.estimate_max
      ),

      estimate_average:
        nullableNumber(
          body.estimate_average
        ),

      customer_photo_path:
        customerPhotoPath,

      customer_photo_paths:
        customerPhotoPaths,

      /*
        관리자 화면의 상태값과 맞춥니다.
        new / contacted / scheduled /
        completed / cancelled
      */

      status: "new",

      memo: nullableText(body.memo),

      is_read: false,
      read_at: null,
    };

    const { data, error } =
      await supabase
        .from("customer_leads")
        .insert(leadPayload)
        .select(
          `
          id,
          customer_name,
          phone,
          region,
          customer_photo_path,
          customer_photo_paths,
          created_at
          `
        )
        .single();

    if (error) {
      throw error;
    }

    /* ======================================
       자동견적 → 상담 전환 처리
    ====================================== */

    const usageId = String(
      body.usage_id || ""
    ).trim();

    let usageConverted = false;

    /*
      상담 저장은 성공했지만 전환기록 업데이트가
      실패하는 경우 상담 자체는 삭제하지 않습니다.
    */

    if (usageId && isUuid(usageId)) {
      const {
        data: updatedUsage,
        error: usageError,
      } = await supabase
        .from("estimate_usage")
        .update({
          converted_to_lead: true,
        })
        .eq("id", usageId)
        .select("id")
        .maybeSingle();

      if (usageError) {
        console.error(
          "자동견적 전환 처리 오류:",
          usageError
        );
      } else if (updatedUsage?.id) {
        usageConverted = true;
      }
    }

    return NextResponse.json({
      success: true,

      id: data.id,

      customer_name:
        data.customer_name,

      customer_photo_path:
        data.customer_photo_path,

      customer_photo_paths:
        data.customer_photo_paths || [],

      usage_converted:
        usageConverted,
    });
  } catch (error) {
    console.error(
      "상담 신청 API 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "상담 신청 저장 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
           }
