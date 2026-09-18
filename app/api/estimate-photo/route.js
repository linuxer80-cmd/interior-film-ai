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
 * - 서버의 SUPABASE_SERVICE_ROLE_KEY를 사용해서 업로드
 * - 업로드된 Storage 경로를 page.js로 반환
 *
 * 저장 위치:
 * work-photos / estimate-usage / 파일명.jpg
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
    /*
     * 1. 환경변수 확인
     */

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

    /*
     * 2. Supabase 서버용 클라이언트
     *
     * SERVICE ROLE KEY는 이 서버 파일에서만 사용합니다.
     * page.js 같은 브라우저 코드에는 절대 넣지 않습니다.
     */

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

    /*
     * 3. 고객이 보낸 FormData 읽기
     */

    const formData = await request.formData();

    const file = formData.get("image");

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

    /*
     * 브라우저 FormData의 File인지 확인
     */

    if (
      typeof file.arrayBuffer !== "function"
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
     * 4. 파일 형식 확인
     *
     * 현재 page.js에서 사진을 JPEG로 압축해서 보내므로
     * image/jpeg가 정상입니다.
     *
     * 혹시 다른 이미지 형식이 들어와도 image/*이면 허용합니다.
     */

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

    /*
     * 5. 파일 크기 제한
     *
     * page.js에서 1200px JPEG로 압축하지만
     * 비정상적으로 큰 요청을 막기 위해
     * 서버에서도 10MB 제한을 둡니다.
     */

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

    /*
     * 6. File → Buffer 변환
     */

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

    /*
     * 7. Storage 저장 경로 생성
     */

    const fileName =
      makeFileName();

    const storagePath =
      `estimate-usage/${fileName}`;

    /*
     * 8. private work-photos 버킷에 업로드
     *
     * Service Role을 사용하므로
     * 고객 브라우저의 Storage INSERT RLS에
     * 의존하지 않습니다.
     */

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

    /*
     * 9. 실제 저장된 경로 확인
     */

    const savedPath =
      uploadData?.path ||
      storagePath;

    /*
     * 10. 성공 응답
     *
     * signed URL은 여기서 만들지 않습니다.
     *
     * DB에는 Storage 경로만 저장하고,
     * 관리자 페이지에서 사진 보기 버튼을 눌렀을 때만
     * signed URL을 생성합니다.
     *
     * 이렇게 해야 불필요한 Supabase egress를 줄일 수 있습니다.
     */

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
