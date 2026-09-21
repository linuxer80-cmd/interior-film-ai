import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const PHOTO_BUCKET = "work-photos";

const ALLOWED_PHOTO_TYPES = [
  "before",
  "after",
];

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_FILE_SIZE =
  15 * 1024 * 1024;

/* =========================================================
   Supabase Admin Client
========================================================= */

function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
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
    },
  );
}

/* =========================================================
   공용
========================================================= */

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
}

function getAccessToken(request) {
  const authorization =
    request.headers.get(
      "authorization",
    ) || "";

  if (
    !authorization
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    return null;
  }

  return authorization
    .slice(7)
    .trim();
}

/* =========================================================
   파일명 정리
========================================================= */

function sanitizeFileName(
  fileName,
) {
  const original =
    String(
      fileName || "photo.jpg",
    );

  const extensionMatch =
    original.match(
      /\.([a-zA-Z0-9]+)$/,
    );

  let extension =
    extensionMatch?.[1]
      ?.toLowerCase() ||
    "jpg";

  if (
    ![
      "jpg",
      "jpeg",
      "png",
      "webp",
      "heic",
      "heif",
    ].includes(extension)
  ) {
    extension = "jpg";
  }

  const random =
    Math.random()
      .toString(36)
      .slice(2, 10);

  return `${Date.now()}-${random}.${extension}`;
}

/* =========================================================
   시공자 + 현장 권한 확인

   service role을 사용하므로
   반드시 서버에서 직접 권한을 검사합니다.
========================================================= */

async function verifyWorkerSiteAccess({
  supabase,
  accessToken,
  siteId,
}) {
  if (!accessToken) {
    throw new Error(
      "로그인이 필요합니다.",
    );
  }

  /* ---------------------------------------------------------
     로그인 사용자
  --------------------------------------------------------- */

  const {
    data: userData,
    error: userError,
  } =
    await supabase.auth.getUser(
      accessToken,
    );

  if (
    userError ||
    !userData?.user
  ) {
    throw new Error(
      "로그인 정보를 확인할 수 없습니다.",
    );
  }

  const user =
    userData.user;

  /* ---------------------------------------------------------
     workers
  --------------------------------------------------------- */

  const {
    data: worker,
    error: workerError,
  } =
    await supabase
      .from("workers")
      .select(
        `
          id,
          company_id,
          name,
          phone,
          user_id,
          is_active
        `,
      )
      .eq(
        "user_id",
        user.id,
      )
      .eq(
        "is_active",
        true,
      )
      .maybeSingle();

  if (workerError) {
    throw workerError;
  }

  if (!worker) {
    throw new Error(
      "등록된 시공자 계정을 찾을 수 없습니다.",
    );
  }

  /* ---------------------------------------------------------
     현장
  --------------------------------------------------------- */

  const {
    data: site,
    error: siteError,
  } =
    await supabase
      .from("sites")
      .select(
        `
          id,
          company_id,
          site_name,
          customer_name,
          status
        `,
      )
      .eq(
        "id",
        siteId,
      )
      .eq(
        "company_id",
        worker.company_id,
      )
      .maybeSingle();

  if (siteError) {
    throw siteError;
  }

  if (!site) {
    throw new Error(
      "현장을 찾을 수 없습니다.",
    );
  }

  /* ---------------------------------------------------------
     site_workers 배정 확인
  --------------------------------------------------------- */

  const {
    data: assignment,
    error: assignmentError,
  } =
    await supabase
      .from("site_workers")
      .select(
        `
          id,
          company_id,
          site_id,
          worker_id,
          role
        `,
      )
      .eq(
        "company_id",
        worker.company_id,
      )
      .eq(
        "site_id",
        site.id,
      )
      .eq(
        "worker_id",
        worker.id,
      )
      .maybeSingle();

  if (assignmentError) {
    throw assignmentError;
  }

  if (!assignment) {
    throw new Error(
      "이 현장에 배정된 시공자가 아닙니다.",
    );
  }

  return {
    user,
    worker,
    site,
    assignment,
  };
}

/* =========================================================
   파일 검증
========================================================= */

function validateFile(file) {
  if (!file) {
    throw new Error(
      "사진 파일이 없습니다.",
    );
  }

  if (
    typeof file.arrayBuffer !==
    "function"
  ) {
    throw new Error(
      "올바른 사진 파일이 아닙니다.",
    );
  }

  if (
    file.size <= 0
  ) {
    throw new Error(
      "빈 사진 파일은 업로드할 수 없습니다.",
    );
  }

  if (
    file.size > MAX_FILE_SIZE
  ) {
    throw new Error(
      "사진 한 장은 15MB 이하만 업로드할 수 있습니다.",
    );
  }

  /*
   * 일부 모바일 브라우저는
   * MIME type을 비워서 전달할 수 있으므로
   * type이 존재할 때만 검사합니다.
   */

  if (
    file.type &&
    !ALLOWED_IMAGE_TYPES.includes(
      file.type.toLowerCase(),
    )
  ) {
    throw new Error(
      "지원하지 않는 사진 형식입니다.",
    );
  }
}

/* =========================================================
   Storage 업로드
========================================================= */

async function uploadPhoto({
  supabase,
  companyId,
  siteId,
  photoType,
  file,
}) {
  validateFile(file);

  const safeFileName =
    sanitizeFileName(
      file.name,
    );

  /*
   * canonical path
   *
   * before
   * sites/company/site/before/file
   *
   * after
   * sites/company/site/after/file
   */

  const storagePath =
    `sites/${companyId}/${siteId}/${photoType}/${safeFileName}`;

  const arrayBuffer =
    await file.arrayBuffer();

  const buffer =
    Buffer.from(
      arrayBuffer,
    );

  const contentType =
    file.type ||
    "image/jpeg";

  const {
    error: uploadError,
  } =
    await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(
        storagePath,
        buffer,
        {
          contentType,
          upsert: false,
        },
      );

  if (uploadError) {
    throw uploadError;
  }

  return storagePath;
}

/* =========================================================
   site_photos DB 저장
========================================================= */

async function insertPhotoRecord({
  supabase,
  companyId,
  siteId,
  userId,
  photoType,
  storagePath,
  description,
}) {
  const {
    data,
    error,
  } =
    await supabase
      .from("site_photos")
      .insert({
        company_id:
          companyId,

        site_id:
          siteId,

        photo_type:
          photoType,

        storage_path:
          storagePath,

        photo_url:
          null,

        description:
          cleanText(
            description,
          ) ||
          (
            photoType ===
            "before"
              ? "시공자가 등록한 시공 전 사진"
              : "시공자가 등록한 시공 완료 사진"
          ),

        uploaded_by:
          userId,
      })
      .select(
        `
          id,
          photo_type,
          storage_path,
          description,
          created_at
        `,
      )
      .single();

  if (error) {
    throw error;
  }

  return data;
}

/* =========================================================
   업로드 실패 시 Storage 정리
========================================================= */

async function removeStoragePhoto({
  supabase,
  storagePath,
}) {
  if (!storagePath) {
    return;
  }

  try {
    await supabase.storage
      .from(PHOTO_BUCKET)
      .remove([
        storagePath,
      ]);
  } catch (error) {
    console.error(
      "Storage cleanup error:",
      error,
    );
  }
}

/* =========================================================
   POST

   FormData:
   siteId
   photoType = before | after
   description
   photos = File 여러 개
========================================================= */

export async function POST(
  request,
) {
  const uploadedPaths = [];

  try {
    const supabase =
      createAdminClient();

    /* -------------------------------------------------------
       로그인 토큰
    ------------------------------------------------------- */

    const accessToken =
      getAccessToken(
        request,
      );

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "로그인이 필요합니다.",
        },
        {
          status: 401,
        },
      );
    }

    /* -------------------------------------------------------
       FormData
    ------------------------------------------------------- */

    let formData;

    try {
      formData =
        await request.formData();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "사진 업로드 데이터를 확인할 수 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const siteId =
      cleanText(
        formData.get(
          "siteId",
        ),
      );

    const photoType =
      cleanText(
        formData.get(
          "photoType",
        ),
      );

    const description =
      cleanText(
        formData.get(
          "description",
        ),
      );

    const photos =
      formData
        .getAll("photos")
        .filter(
          (file) =>
            file &&
            typeof file.arrayBuffer ===
              "function",
        );

    /* -------------------------------------------------------
       필수값 검증
    ------------------------------------------------------- */

    if (!siteId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "현장 정보가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !ALLOWED_PHOTO_TYPES.includes(
        photoType,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "사진 구분은 before 또는 after만 가능합니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      photos.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "등록할 사진을 선택해주세요.",
        },
        {
          status: 400,
        },
      );
    }

    /* -------------------------------------------------------
       한 번에 너무 많은 사진 방지
    ------------------------------------------------------- */

    if (
      photos.length > 20
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "사진은 한 번에 최대 20장까지 등록할 수 있습니다.",
        },
        {
          status: 400,
        },
      );
    }

    /* -------------------------------------------------------
       파일을 먼저 전부 검증

       중간에 잘못된 파일이 발견되어
       일부만 업로드되는 것을 줄입니다.
    ------------------------------------------------------- */

    for (
      const file of photos
    ) {
      validateFile(file);
    }

    /* -------------------------------------------------------
       시공자 + 현장 배정 권한 확인
    ------------------------------------------------------- */

    const {
      user,
      worker,
      site,
      assignment,
    } =
      await verifyWorkerSiteAccess({
        supabase,
        accessToken,
        siteId,
      });

    /* -------------------------------------------------------
       취소 현장 방지
    ------------------------------------------------------- */

    if (
      site.status ===
      "cancelled"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "취소된 현장에는 사진을 등록할 수 없습니다.",
        },
        {
          status: 409,
        },
      );
    }

    /*
     * 완료된 현장에 새로운 사진을 계속 추가하는 것은
     * 데이터가 바뀌는 문제가 있으므로 막습니다.
     */

    if (
      site.status ===
      "completed"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이미 완료된 현장에는 사진을 추가할 수 없습니다.",
        },
        {
          status: 409,
        },
      );
    }

    /* -------------------------------------------------------
       사진 업로드
    ------------------------------------------------------- */

    const savedPhotos = [];

    for (
      const file of photos
    ) {
      let storagePath =
        null;

      try {
        storagePath =
          await uploadPhoto({
            supabase,

            companyId:
              worker.company_id,

            siteId:
              site.id,

            photoType,

            file,
          });

        uploadedPaths.push(
          storagePath,
        );

        const savedPhoto =
          await insertPhotoRecord({
            supabase,

            companyId:
              worker.company_id,

            siteId:
              site.id,

            userId:
              user.id,

            photoType,

            storagePath,

            description,
          });

        savedPhotos.push(
          savedPhoto,
        );
      } catch (error) {
        /*
         * 현재 파일이 Storage에는 올라갔지만
         * DB 저장에 실패했다면 현재 파일 정리
         */

        if (
          storagePath
        ) {
          await removeStoragePhoto({
            supabase,
            storagePath,
          });

          const index =
            uploadedPaths.indexOf(
              storagePath,
            );

          if (
            index >= 0
          ) {
            uploadedPaths.splice(
              index,
              1,
            );
          }
        }

        throw error;
      }
    }

    return NextResponse.json(
      {
        success: true,

        site_id:
          site.id,

        photo_type:
          photoType,

        worker: {
          id:
            worker.id,

          name:
            worker.name,

          role:
            assignment.role,
        },

        count:
          savedPhotos.length,

        photos:
          savedPhotos,

        message:
          photoType ===
          "before"
            ? `${savedPhotos.length}장의 시공 전 사진을 등록했습니다.`
            : `${savedPhotos.length}장의 시공 완료 사진을 등록했습니다.`,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "Worker site photo upload API error:",
      error,
    );

    const message =
      error?.message ||
      "사진 등록 중 오류가 발생했습니다.";

    let status = 500;

    if (
      message ===
        "로그인이 필요합니다." ||
      message ===
        "로그인 정보를 확인할 수 없습니다."
    ) {
      status = 401;
    } else if (
      message ===
        "등록된 시공자 계정을 찾을 수 없습니다." ||
      message ===
        "이 현장에 배정된 시공자가 아닙니다." ||
      message ===
        "현장을 찾을 수 없습니다."
    ) {
      status = 403;
    } else if (
      message.includes(
        "사진",
      ) ||
      message.includes(
        "형식",
      ) ||
      message.includes(
        "15MB",
      )
    ) {
      status = 400;
    }

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status,
      },
    );
  }
}
