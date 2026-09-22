import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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
     * 클라이언트의 company_id는 사용하지 않습니다.
     * company_slug로 서버가 실제 활성 업체를 확인합니다.
     * =====================================================
     */

    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select(
        "id, slug"
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
     * 사진 데이터 읽기
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
      `estimate-usage/${company.id}/${fileName}`;

    /*
     * =====================================================
     * Supabase Storage 업로드
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
     * 사용량 기록이 실패해도
     * 사진 업로드 자체는 성공 상태를 유지합니다.
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
