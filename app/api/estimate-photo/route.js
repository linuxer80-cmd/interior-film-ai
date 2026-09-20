import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * 자동견적 고객 사진 저장 API
 *
 * 목적:
 * - 고객 브라우저에서 private Storage로 직접 업로드하지 않음
 * - 서버에서 company_slug를 실제 활성 업체로 확인
 * - 업체별 Storage 경로로 사진을 분리
 *
 * 저장 위치:
 * work-photos / estimate-usage / 회사ID / 파일명.jpg
 */

function makeFileName() {
  if (typeof crypto.randomUUID === "function") {
    return `${crypto.randomUUID()}.jpg`;
  }

  return `${Date.now()}-${crypto
    .randomBytes(8)
    .toString("hex")}.jpg`;
}

export async function POST(request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

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

    const formData =
      await request.formData();

    const companySlug =
      String(
        formData.get("company_slug") ||
          ""
      )
        .trim()
        .toLowerCase();

    if (!companySlug) {
      return NextResponse.json(
        {
          success: false,
          error: "company_slug가 없습니다.",
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
     * 클라이언트의 company_id는 사용하지 않습니다.
     * company_slug로 서버가 실제 활성 업체를 확인합니다.
     */
    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select("id, slug")
      .eq("slug", companySlug)
      .eq("is_active", true)
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

    const file =
      formData.get("image");

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: "사진 파일이 없습니다.",
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

    const contentType =
      String(file.type || "").trim() ||
      "image/jpeg";

    if (
      !contentType.startsWith("image/")
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

    const maxFileSize =
      10 * 1024 * 1024;

    if (
      Number(file.size || 0) >
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
      Number(file.size || 0) <= 0
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

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(arrayBuffer);

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

    const fileName =
      makeFileName();

    /*
     * 같은 work-photos 버킷을 사용하되
     * 회사 ID를 중간 폴더로 넣어 완전히 분리합니다.
     */
    const storagePath =
      `estimate-usage/${company.id}/${fileName}`;

    const {
      data: uploadData,
      error: uploadError,
    } = await supabase.storage
      .from("work-photos")
      .upload(
        storagePath,
        buffer,
        {
          contentType,
          cacheControl: "3600",
          upsert: false,
        }
      );

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

    const savedPath =
      uploadData?.path ||
      storagePath;

    return NextResponse.json({
      success: true,
      path: savedPath,
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
