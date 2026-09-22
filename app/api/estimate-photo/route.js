import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  checkUsageLimit,
  makeUsageLimitError,
} from "../../utils/serverUsageLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * =========================================================
 * 자동견적 고객 사진 저장 API
 *
 * 목적:
 * - 고객 브라우저에서 private Storage로 직접 업로드하지 않음
 * - 서버에서 company_slug를 실제 활성 업체로 확인
 * - 업체별 Storage 경로로 사진을 분리
 * - 이미지 업로드 횟수 한도 확인
 * - 저장용량 한도 확인
 * - 사진 저장 성공 시 image_upload 사용량 기록
 *
 * 저장 위치:
 * work-photos / estimate-usage / 회사ID / 파일명.jpg
 * =========================================================
 */

function makeFileName() {
  if (
    typeof crypto.randomUUID ===
    "function"
  ) {
    return `${crypto.randomUUID()}.jpg`;
  }

  return `${Date.now()}-${crypto
    .randomBytes(8)
    .toString("hex")}.jpg`;
}

/*
 * =========================================================
 * 이미지 업로드 사용량 기록
 *
 * 중요:
 * Storage 업로드가 성공한 이후에만 실행합니다.
 *
 * usage_events 기록에 실패해도
 * 이미 저장된 사진 업로드는 실패 처리하지 않습니다.
 * =========================================================
 */

async function recordImageUploadUsage({
  supabase,
  company,
  storagePath,
  fileSizeBytes,
  contentType,
}) {
  if (
    !supabase ||
    !company?.id
  ) {
    return false;
  }

  try {
    const safeBytes =
      Number.isFinite(
        Number(fileSizeBytes)
      )
        ? Number(fileSizeBytes)
        : 0;

    const sizeMb =
      safeBytes > 0
        ? safeBytes /
          (1024 * 1024)
        : 0;

    const {
      error: usageError,
    } = await supabase
      .from("usage_events")
      .insert({
        company_id:
          company.id,

        event_type:
          "image_upload",

        quantity: 1,

        cost_krw: 0,

        provider:
          "supabase",

        model: null,

        reference_id:
          storagePath ||
          null,

        metadata: {
          company_slug:
            company.slug ||
            null,

          subscription_plan:
            company.subscription_plan ||
            null,

          bucket:
            "work-photos",

          storage_path:
            storagePath ||
            null,

          file_size_bytes:
            safeBytes,

          file_size_mb:
            Number(
              sizeMb.toFixed(6)
            ),

          content_type:
            contentType ||
            null,

          upload_source:
            "estimate_photo",
        },
      });

    if (usageError) {
      console.error(
        "IMAGE UPLOAD USAGE INSERT ERROR:",
        usageError
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "IMAGE UPLOAD USAGE RECORD ERROR:",
      error
    );

    return false;
  }
}

/*
 * =========================================================
 * 현재 월 이미지 업로드 용량 계산
 *
 * 현재 구조에서는 image_upload 이벤트의
 * metadata.file_size_mb 값을 합산합니다.
 *
 * 즉 별도의 storage_mb 이벤트를 중복 생성하지 않습니다.
 * =========================================================
 */

async function getCurrentMonthUploadedStorageMb({
  supabase,
  companyId,
}) {
  try {
    /*
     * 한국시간 기준 현재 연/월
     */

    const parts =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone:
            "Asia/Seoul",

          year:
            "numeric",

          month:
            "numeric",
        }
      ).formatToParts(
        new Date()
      );

    const year =
      Number(
        parts.find(
          (part) =>
            part.type ===
            "year"
        )?.value
      );

    const month =
      Number(
        parts.find(
          (part) =>
            part.type ===
            "month"
        )?.value
      );

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month)
    ) {
      throw new Error(
        "현재 월을 계산하지 못했습니다."
      );
    }

    /*
     * 한국시간 월 시작/다음달 시작을
     * UTC ISO 문자열로 변환
     *
     * KST = UTC + 9
     */

    const monthStart =
      new Date(
        Date.UTC(
          year,
          month - 1,
          1,
          -9,
          0,
          0,
          0
        )
      );

    const nextMonthStart =
      new Date(
        Date.UTC(
          year,
          month,
          1,
          -9,
          0,
          0,
          0
        )
      );

    const {
      data,
      error,
    } = await supabase
      .from("usage_events")
      .select(
        "quantity, metadata"
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "event_type",
        "image_upload"
      )
      .gte(
        "created_at",
        monthStart.toISOString()
      )
      .lt(
        "created_at",
        nextMonthStart.toISOString()
      );

    if (error) {
      throw error;
    }

    let totalMb = 0;

    for (
      const row of data || []
    ) {
      const metadata =
        row?.metadata &&
        typeof row.metadata ===
          "object"
          ? row.metadata
          : {};

      const fileSizeMb =
        Number(
          metadata.file_size_mb ||
          0
        );

      if (
        Number.isFinite(
          fileSizeMb
        ) &&
        fileSizeMb > 0
      ) {
        totalMb +=
          fileSizeMb;
      }
    }

    return {
      ok: true,

      usedMb:
        Number(
          totalMb.toFixed(6)
        ),

      monthStart:
        monthStart.toISOString(),

      nextMonthStart:
        nextMonthStart.toISOString(),
    };
  } catch (error) {
    console.error(
      "STORAGE USAGE CHECK ERROR:",
      error
    );

    return {
      ok: false,

      error:
        error?.message ||
        "저장용량 사용량을 확인하지 못했습니다.",
    };
  }
}

/*
 * =========================================================
 * 업체 요금제의 저장용량 제한 조회
 * =========================================================
 */

async function getStorageLimit({
  supabase,
  company,
}) {
  try {
    const planCode =
      String(
        company?.subscription_plan ||
        ""
      ).trim();

    if (!planCode) {
      return {
        ok: false,

        status: 503,

        error:
          "업체 요금제를 확인할 수 없습니다.",
      };
    }

    const {
      data: plan,
      error,
    } = await supabase
      .from(
        "subscription_plans"
      )
      .select(
        `
          plan_code,
          plan_name,
          storage_mb_limit,
          is_active
        `
      )
      .eq(
        "plan_code",
        planCode
      )
      .maybeSingle();

    if (error) {
      console.error(
        "STORAGE PLAN LOOKUP ERROR:",
        error
      );

      return {
        ok: false,

        status: 503,

        error:
          "저장용량 요금제 정보를 확인하지 못했습니다.",
      };
    }

    if (!plan) {
      return {
        ok: false,

        status: 503,

        error:
          "적용된 요금제 정보를 찾을 수 없습니다.",
      };
    }

    if (
      plan.is_active ===
      false
    ) {
      return {
        ok: false,

        status: 503,

        error:
          "현재 사용할 수 없는 요금제입니다.",
      };
    }

    /*
     * 현재 규칙:
     * 0 이하 = 무제한
     */

    const limitMb =
      Number(
        plan.storage_mb_limit ||
        0
      );

    return {
      ok: true,

      planCode:
        plan.plan_code,

      planName:
        plan.plan_name,

      limitMb,

      unlimited:
        limitMb <= 0,
    };
  } catch (error) {
    console.error(
      "STORAGE PLAN CHECK ERROR:",
      error
    );

    return {
      ok: false,

      status: 503,

      error:
        error?.message ||
        "저장용량 한도를 확인하지 못했습니다.",
    };
  }
}

/*
 * =========================================================
 * POST
 * =========================================================
 */

export async function POST(request) {
  try {
    /*
     * =====================================================
     * 환경변수 확인
     * =====================================================
     */

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,

          error:
            "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
        },
        {
          status: 500,
        }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,

          error:
            "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * Supabase Service Role
     * =====================================================
     */

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,
          },
        }
      );

    /*
     * =====================================================
     * FormData
     * =====================================================
     */

    const formData =
      await request.formData();

    const companySlug =
      String(
        formData.get(
          "company_slug"
        ) || ""
      )
        .trim()
        .toLowerCase();

    /*
     * =====================================================
     * company_slug 확인
     * =====================================================
     */

    if (!companySlug) {
      return NextResponse.json(
        {
          success: false,

          error:
            "company_slug가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^[a-z0-9-]+$/.test(
        companySlug
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "올바르지 않은 회사 주소입니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * 활성 업체 확인
     *
     * company_slug로 서버에서 업체를 확인합니다.
     * =====================================================
     */

    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select(
        `
          id,
          slug,
          company_name,
          subscription_plan,
          is_active
        `
      )
      .eq(
        "slug",
        companySlug
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();

    if (companyError) {
      console.error(
        "ESTIMATE PHOTO COMPANY LOOKUP ERROR:",
        companyError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "회사 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    if (!company?.id) {
      return NextResponse.json(
        {
          success: false,

          error:
            "사용할 수 없는 회사 주소입니다.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * =====================================================
     * 사진 파일
     * =====================================================
     */

    const file =
      formData.get(
        "image"
      );

    if (!file) {
      return NextResponse.json(
        {
          success: false,

          error:
            "사진 파일이 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeof file.arrayBuffer !==
      "function"
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "올바른 사진 파일이 아닙니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * Content-Type 확인
     * =====================================================
     */

    const contentType =
      String(
        file.type || ""
      ).trim() ||
      "image/jpeg";

    if (
      !contentType.startsWith(
        "image/"
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "이미지 파일만 업로드할 수 있습니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * 파일 크기 확인
     *
     * 최대 10MB
     * =====================================================
     */

    const fileSizeBytes =
      Number(
        file.size || 0
      );

    const maxFileSize =
      10 * 1024 * 1024;

    if (
      fileSizeBytes >
      maxFileSize
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "사진 용량이 너무 큽니다. 10MB 이하 사진을 사용해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      fileSizeBytes <= 0
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "사진 파일의 내용이 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * 이미지 업로드 횟수 한도 검사
     *
     * Storage 업로드 전에 실행합니다.
     * =====================================================
     */

    const uploadLimitCheck =
      await checkUsageLimit({
        company,

        eventType:
          "image_upload",

        requestedQuantity: 1,

        supabase,
      });

    if (!uploadLimitCheck.ok) {
      const errorPayload =
        makeUsageLimitError(
          uploadLimitCheck
        );

      return NextResponse.json(
        {
          ...errorPayload,

          code:
            uploadLimitCheck.limitReached
              ? "IMAGE_UPLOAD_LIMIT_REACHED"
              : "IMAGE_UPLOAD_LIMIT_CHECK_FAILED",
        },
        {
          status:
            uploadLimitCheck.status ||
            (
              uploadLimitCheck.limitReached
                ? 429
                : 503
            ),
        }
      );
    }

    /*
     * =====================================================
     * 저장용량 한도 확인
     *
     * 현재 파일 크기를 MB로 계산합니다.
     * =====================================================
     */

    const incomingFileMb =
      fileSizeBytes /
      (1024 * 1024);

    const storagePlan =
      await getStorageLimit({
        supabase,
        company,
      });

    if (!storagePlan.ok) {
      return NextResponse.json(
        {
          success: false,

          code:
            "STORAGE_LIMIT_CHECK_FAILED",

          error:
            storagePlan.error ||
            "저장용량 한도를 확인하지 못했습니다.",
        },
        {
          status:
            storagePlan.status ||
            503,
        }
      );
    }

    /*
     * 무제한이 아닐 때만
     * 현재 사용량을 조회합니다.
     */

    let storageUsage = {
      ok: true,
      usedMb: 0,
    };

    if (
      !storagePlan.unlimited
    ) {
      storageUsage =
        await getCurrentMonthUploadedStorageMb({
          supabase,

          companyId:
            company.id,
        });

      if (!storageUsage.ok) {
        return NextResponse.json(
          {
            success: false,

            code:
              "STORAGE_LIMIT_CHECK_FAILED",

            error:
              storageUsage.error ||
              "현재 저장용량을 확인하지 못했습니다.",
          },
          {
            status: 503,
          }
        );
      }

      /*
       * 현재 사용량 + 새 파일 크기가
       * 요금제 한도를 초과하는지 검사
       */

      const projectedStorageMb =
        Number(
          storageUsage.usedMb ||
          0
        ) +
        incomingFileMb;

      if (
        projectedStorageMb >
        storagePlan.limitMb
      ) {
        return NextResponse.json(
          {
            success: false,

            code:
              "STORAGE_MB_LIMIT_REACHED",

            error:
              `저장용량 한도에 도달했습니다. 현재 ${Number(
                storageUsage.usedMb ||
                  0
              ).toFixed(
                2
              )}MB / ${Number(
                storagePlan.limitMb
              ).toFixed(
                0
              )}MB를 사용 중입니다.`,

            event_type:
              "storage_mb",

            plan_code:
              storagePlan.planCode,

            plan_name:
              storagePlan.planName,

            used:
              Number(
                storageUsage.usedMb ||
                0
              ),

            requested:
              Number(
                incomingFileMb.toFixed(
                  6
                )
              ),

            limit:
              storagePlan.limitMb,

            remaining:
              Math.max(
                0,
                storagePlan.limitMb -
                  Number(
                    storageUsage.usedMb ||
                    0
                  )
              ),
          },
          {
            status: 429,
          }
        );
      }
    }

    /*
     * =====================================================
     * 사진 데이터 읽기
     *
     * 모든 사용량 검사를 통과한 뒤에
     * 실제 파일 데이터를 읽습니다.
     * =====================================================
     */

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    if (!buffer.length) {
      return NextResponse.json(
        {
          success: false,

          error:
            "사진 데이터를 읽지 못했습니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * 파일명 생성
     * =====================================================
     */

    const fileName =
      makeFileName();

    /*
     * =====================================================
     * Storage 경로
     *
     * 같은 work-photos 버킷을 사용하되
     * 회사 ID를 중간 폴더로 넣어 완전히 분리합니다.
     * =====================================================
     */

    const storagePath =
      `estimate-usage/${company.id}/${fileName}`;    /*
     * =====================================================
     * Supabase Storage 업로드
     *
     * 여기까지 왔다는 것은:
     *
     * 1. 활성 업체 확인 완료
     * 2. 이미지 업로드 횟수 한도 통과
     * 3. 저장용량 한도 통과
     * 4. 개별 파일 10MB 제한 통과
     *
     * 따라서 실제 Storage 업로드를 진행합니다.
     * =====================================================
     */

    const {
      data: uploadData,
      error: uploadError,
    } =
      await supabase.storage
        .from(
          "work-photos"
        )
        .upload(
          storagePath,
          buffer,
          {
            contentType,

            cacheControl:
              "3600",

            upsert:
              false,
          }
        );

    /*
     * =====================================================
     * Storage 실패
     * =====================================================
     */

    if (uploadError) {
      console.error(
        "ESTIMATE PHOTO STORAGE ERROR:",
        uploadError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            uploadError.message ||
            "자동견적 사진 저장에 실패했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 실제 저장 경로
     * =====================================================
     */

    const savedPath =
      uploadData?.path ||
      storagePath;

    /*
     * =====================================================
     * 이미지 업로드 사용량 기록
     *
     * Storage 저장이 성공한 사진만
     * image_upload = 1 로 기록합니다.
     *
     * 파일 크기는 metadata.file_size_mb에 저장됩니다.
     *
     * 별도의 storage_mb 이벤트를 만들지 않습니다.
     * 저장용량 계산 시 image_upload 이벤트의
     * file_size_mb를 합산합니다.
     *
     * 사용량 기록이 실패해도
     * 이미 성공한 Storage 업로드는
     * 실패 상태로 바꾸지 않습니다.
     * =====================================================
     */

    const usageRecorded =
      await recordImageUploadUsage(
        {
          supabase,

          company,

          storagePath:
            savedPath,

          fileSizeBytes:
            buffer.length,

          contentType,
        }
      );

    /*
     * =====================================================
     * 업로드 후 사용량 계산
     * =====================================================
     */

    const uploadUsedBefore =
      Number(
        uploadLimitCheck.used ||
        0
      );

    const uploadUsedAfter =
      uploadUsedBefore + 1;

    const uploadLimit =
      uploadLimitCheck.unlimited
        ? null
        : Number(
            uploadLimitCheck.limit ||
            0
          );

    const uploadRemaining =
      uploadLimitCheck.unlimited
        ? null
        : Math.max(
            0,
            uploadLimit -
              uploadUsedAfter
          );

    /*
     * 저장용량 사용량
     *
     * 현재 업로드가 성공했으므로
     * 기존 사용량 + 현재 파일 크기
     */

    const storageUsedBefore =
      Number(
        storageUsage.usedMb ||
        0
      );

    const storageUsedAfter =
      storageUsedBefore +
      incomingFileMb;

    const storageRemaining =
      storagePlan.unlimited
        ? null
        : Math.max(
            0,
            storagePlan.limitMb -
              storageUsedAfter
          );

    /*
     * =====================================================
     * 성공
     * =====================================================
     */

    return NextResponse.json({
      success: true,

      path:
        savedPath,

      usageRecorded,

      fileSizeBytes:
        buffer.length,

      fileSizeMb:
        Number(
          incomingFileMb.toFixed(
            6
          )
        ),

      /*
       * 이미지 업로드 횟수
       */
      uploadUsage: {
        event_type:
          "image_upload",

        plan_code:
          uploadLimitCheck.planCode ||
          company.subscription_plan ||
          null,

        plan_name:
          uploadLimitCheck.planName ||
          null,

        used_before:
          uploadUsedBefore,

        used_after:
          uploadUsedAfter,

        limit:
          uploadLimit,

        remaining:
          uploadRemaining,

        unlimited:
          Boolean(
            uploadLimitCheck.unlimited
          ),
      },

      /*
       * 저장용량
       */
      storageUsage: {
        event_type:
          "storage_mb",

        plan_code:
          storagePlan.planCode ||
          company.subscription_plan ||
          null,

        plan_name:
          storagePlan.planName ||
          null,

        used_before_mb:
          Number(
            storageUsedBefore.toFixed(
              6
            )
          ),

        used_after_mb:
          Number(
            storageUsedAfter.toFixed(
              6
            )
          ),

        limit_mb:
          storagePlan.unlimited
            ? null
            : storagePlan.limitMb,

        remaining_mb:
          storageRemaining === null
            ? null
            : Number(
                storageRemaining.toFixed(
                  6
                )
              ),

        unlimited:
          Boolean(
            storagePlan.unlimited
          ),
      },
    });
  } catch (error) {
    console.error(
      "ESTIMATE PHOTO API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "자동견적 사진 저장 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
            }
