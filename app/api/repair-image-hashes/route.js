import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 3;

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

function getAccessToken(request) {
  const authorization =
    request.headers.get(
      "authorization"
    ) || "";

  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return "";
  }

  return authorization
    .slice(7)
    .trim();
}

async function checkAdminLogin(
  supabase,
  request
) {
  const accessToken =
    getAccessToken(request);

  if (!accessToken) {
    return {
      success: false,
      error:
        "관리자 로그인이 필요합니다.",
    };
  }

  const {
    data,
    error,
  } = await supabase.auth.getUser(
    accessToken
  );

  if (
    error ||
    !data?.user
  ) {
    return {
      success: false,
      error:
        "관리자 로그인 정보를 확인할 수 없습니다.",
    };
  }

  return {
    success: true,
    user: data.user,
  };
}

function eligiblePhotoQuery(
  supabase,
  options = {}
) {
  let query = supabase
    .from("work_photos")
    .select(
      options.select || "id",
      options.selectOptions || {}
    )
    .not(
      "storage_path",
      "is",
      null
    )
    .neq(
      "storage_path",
      ""
    );

  return query;
}

export async function GET(request) {
  try {
    const supabase =
      createAdminClient();

    /* ======================================
       관리자 로그인 확인
    ====================================== */

    const adminCheck =
      await checkAdminLogin(
        supabase,
        request
      );

    if (!adminCheck.success) {
      return NextResponse.json(
        {
          success: false,
          error: adminCheck.error,
        },
        {
          status: 401,
        }
      );
    }

    /* ======================================
       처리 가능한 전체 사진 수
       storage_path가 있는 사진만 계산
    ====================================== */

    const {
      count: total,
      error: totalError,
    } = await eligiblePhotoQuery(
      supabase,
      {
        select: "id",
        selectOptions: {
          count: "exact",
          head: true,
        },
      }
    );

    if (totalError) {
      throw totalError;
    }

    /* ======================================
       현재 HASH 없는 사진 수
    ====================================== */

    const {
      count: beforeRemaining,
      error: countError,
    } = await eligiblePhotoQuery(
      supabase,
      {
        select: "id",
        selectOptions: {
          count: "exact",
          head: true,
        },
      }
    ).is(
      "image_hash",
      null
    );

    if (countError) {
      throw countError;
    }

    /*
      이미 전부 완료된 경우에는
      Storage 다운로드 없이 바로 종료합니다.
    */

    if (
      Number(beforeRemaining || 0) === 0
    ) {
      return NextResponse.json({
        success: true,
        total: total || 0,
        completed: total || 0,
        remaining: 0,
        previous_remaining: 0,
        this_batch: 0,
        processed: 0,
        failed: 0,
        progress: "100%",
        finished: true,
        errors: [],
      });
    }

    /* ======================================
       HASH가 없는 사진 중 3장 조회
    ====================================== */

    const {
      data: photos,
      error: photosError,
    } = await eligiblePhotoQuery(
      supabase,
      {
        select:
          "id, storage_path, created_at",
      }
    )
      .is(
        "image_hash",
        null
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      )
      .limit(BATCH_SIZE);

    if (photosError) {
      throw photosError;
    }

    let processed = 0;
    let failed = 0;

    const errors = [];

    /* ======================================
       사진을 한 장씩 다운로드하여 HASH 생성
    ====================================== */

    for (
      const photo of photos || []
    ) {
      try {
        const {
          data: file,
          error: downloadError,
        } = await supabase.storage
          .from("work-photos")
          .download(
            photo.storage_path
          );

        if (downloadError) {
          throw downloadError;
        }

        if (!file) {
          throw new Error(
            "Storage에서 사진 파일을 찾을 수 없습니다."
          );
        }

        const arrayBuffer =
          await file.arrayBuffer();

        const buffer =
          Buffer.from(arrayBuffer);

        if (!buffer.length) {
          throw new Error(
            "사진 파일의 내용이 비어 있습니다."
          );
        }

        const imageHash = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex");

        /*
          동시에 다른 요청이 처리했을 수 있으므로
          image_hash가 아직 null인 행만 수정합니다.
        */

        const {
          data: updated,
          error: updateError,
        } = await supabase
          .from("work_photos")
          .update({
            image_hash: imageHash,
          })
          .eq(
            "id",
            photo.id
          )
          .is(
            "image_hash",
            null
          )
          .select("id")
          .maybeSingle();

        if (updateError) {
          throw updateError;
        }

        /*
          이미 다른 요청이 먼저 처리한 경우도
          실패로 계산하지 않습니다.
        */

        if (updated?.id) {
          processed += 1;
        }
      } catch (error) {
        failed += 1;

        errors.push({
          id: photo.id,
          path:
            photo.storage_path,
          error:
            error?.message ||
            "처리 실패",
        });

        console.error(
          "사진 HASH 처리 오류:",
          photo.id,
          photo.storage_path,
          error
        );
      }
    }

    /* ======================================
       처리 후 남은 사진 수 재확인
    ====================================== */

    const {
      count: remaining,
      error: finalCountError,
    } = await eligiblePhotoQuery(
      supabase,
      {
        select: "id",
        selectOptions: {
          count: "exact",
          head: true,
        },
      }
    ).is(
      "image_hash",
      null
    );

    if (finalCountError) {
      throw finalCountError;
    }

    const safeTotal =
      Number(total || 0);

    const safeRemaining =
      Number(remaining || 0);

    const completed =
      Math.max(
        0,
        safeTotal -
          safeRemaining
      );

    const progressNumber =
      safeTotal > 0
        ? Math.min(
            100,
            Math.round(
              (completed /
                safeTotal) *
                100
            )
          )
        : 100;

    return NextResponse.json({
      success: true,

      total: safeTotal,

      completed,

      remaining:
        safeRemaining,

      previous_remaining:
        Number(
          beforeRemaining || 0
        ),

      this_batch:
        photos?.length || 0,

      processed,

      failed,

      progress:
        `${progressNumber}%`,

      finished:
        safeRemaining === 0,

      errors,
    });
  } catch (error) {
    console.error(
      "HASH 복구 API 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "HASH 복구 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
