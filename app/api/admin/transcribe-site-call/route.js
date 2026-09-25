import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =========================================================
   설정
========================================================= */

const MAX_FILE_SIZE =
  25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
  "m4a",
  "mp3",
  "mp4",
  "wav",
  "webm",
  "mpeg",
  "mpga",
];

/* =========================================================
   문자열 정리
========================================================= */

function cleanString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

/* =========================================================
   확장자
========================================================= */

function getExtension(fileName) {
  const name =
    cleanString(fileName);

  const index =
    name.lastIndexOf(".");

  if (
    index < 0 ||
    index === name.length - 1
  ) {
    return "";
  }

  return name
    .slice(index + 1)
    .toLowerCase();
}

/* =========================================================
   파일명에서 전화번호 후보 추출

   삼성 통화녹음 예:
   통화 01020215..._144139.m4a
   실제 파일명에는 전체 번호가 들어있는 경우
   01012345678 / 0321234567 등을 추출
========================================================= */

function extractPhoneFromFileName(
  fileName,
) {
  const name =
    cleanString(fileName);

  if (!name) {
    return "";
  }

  /*
   * 구분문자를 제거하지 않고 먼저
   * 일반적인 한국 전화번호 패턴 탐색
   */

  const formattedMatch =
    name.match(
      /(?:^|[^0-9])((?:01[016789]|02|0[3-6][1-5])[-_. ]?\d{3,4}[-_. ]?\d{4})(?:[^0-9]|$)/,
    );

  if (
    formattedMatch?.[1]
  ) {
    const digits =
      formattedMatch[1].replace(
        /\D/g,
        "",
      );

    if (
      digits.length >= 9 &&
      digits.length <= 11
    ) {
      return digits;
    }
  }

  /*
   * 01012345678 같은 연속 숫자
   */

  const mobileMatch =
    name.match(
      /(?:^|[^0-9])(01[016789]\d{7,8})(?:[^0-9]|$)/,
    );

  if (
    mobileMatch?.[1]
  ) {
    return mobileMatch[1];
  }

  /*
   * 지역번호 포함 일반전화
   */

  const landlineMatch =
    name.match(
      /(?:^|[^0-9])(0(?:2\d{7,8}|[3-6][1-5]\d{7,8}))(?:[^0-9]|$)/,
    );

  if (
    landlineMatch?.[1]
  ) {
    return landlineMatch[1];
  }

  return "";
}

/* =========================================================
   전화번호 표시 형식
========================================================= */

function formatPhoneNumber(
  value,
) {
  const digits =
    cleanString(value).replace(
      /\D/g,
      "",
    );

  if (!digits) {
    return "";
  }

  if (
    digits.startsWith("02")
  ) {
    if (
      digits.length === 9
    ) {
      return `${digits.slice(
        0,
        2,
      )}-${digits.slice(
        2,
        5,
      )}-${digits.slice(5)}`;
    }

    if (
      digits.length === 10
    ) {
      return `${digits.slice(
        0,
        2,
      )}-${digits.slice(
        2,
        6,
      )}-${digits.slice(6)}`;
    }

    return digits;
  }

  if (
    digits.length === 10
  ) {
    return `${digits.slice(
      0,
      3,
    )}-${digits.slice(
      3,
      6,
    )}-${digits.slice(6)}`;
  }

  if (
    digits.length === 11
  ) {
    return `${digits.slice(
      0,
      3,
    )}-${digits.slice(
      3,
      7,
    )}-${digits.slice(7)}`;
  }

  return digits;
}

/* =========================================================
   파일명에서 연락처 이름 후보 추출

   예:
   통화 홍길동_20260925_101010.m4a
   홍길동_20260925_101010.m4a
========================================================= */

function extractNameFromFileName(
  fileName,
) {
  let name =
    cleanString(fileName);

  if (!name) {
    return "";
  }

  /*
   * 확장자 제거
   */

  name = name.replace(
    /\.[^.]+$/,
    "",
  );

  /*
   * 앞쪽 "통화" 제거
   */

  name = name.replace(
    /^통화[\s_-]*/i,
    "",
  );

  /*
   * 전화번호로 시작하면
   * 이름으로 사용하지 않음
   */

  if (
    /^(?:01[016789]|02|0[3-6][1-5])\d/.test(
      name.replace(/\D/g, ""),
    )
  ) {
    return "";
  }

  /*
   * 뒤쪽 날짜/시간 형태 제거
   */

  name = name
    .replace(
      /[_\s-]*\d{6,8}[_\s-]*\d{4,6}$/,
      "",
    )
    .replace(
      /[_\s-]*\d{4,6}$/,
      "",
    )
    .trim();

  /*
   * 숫자 위주 파일명은
   * 고객명으로 사용하지 않음
   */

  const letters =
    name.replace(
      /[\d\s_.-]/g,
      "",
    );

  if (
    letters.length < 2
  ) {
    return "";
  }

  /*
   * 너무 긴 값은 파일 설명일 가능성
   */

  if (
    name.length > 30
  ) {
    return "";
  }

  return name;
}

/* =========================================================
   OpenAI 응답 오류 메시지
========================================================= */

async function readOpenAiError(
  response,
) {
  try {
    const data =
      await response.json();

    return (
      data?.error?.message ||
      "음성 변환 요청에 실패했습니다."
    );
  } catch {
    try {
      const text =
        await response.text();

      return (
        text ||
        "음성 변환 요청에 실패했습니다."
      );
    } catch {
      return "음성 변환 요청에 실패했습니다.";
    }
  }
}

/* =========================================================
   POST
========================================================= */

export async function POST(request) {
  try {
    /* -------------------------------------------------------
       API KEY
    ------------------------------------------------------- */

    if (
      !process.env.OPENAI_API_KEY
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "OPENAI_API_KEY가 설정되어 있지 않습니다.",
        },
        {
          status: 500,
        },
      );
    }

    /* -------------------------------------------------------
       multipart/form-data
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
            "통화녹음 파일을 읽지 못했습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const file =
      formData.get("file");

    if (
      !file ||
      typeof file === "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "통화녹음 파일을 선택해주세요.",
        },
        {
          status: 400,
        },
      );
    }

    /* -------------------------------------------------------
       파일 검사
    ------------------------------------------------------- */

    const fileName =
      cleanString(
        file.name,
      );

    const extension =
      getExtension(
        fileName,
      );

    if (
      !ALLOWED_EXTENSIONS.includes(
        extension,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "지원하지 않는 파일 형식입니다. m4a, mp3, mp4, wav 파일을 선택해주세요.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !file.size ||
      file.size <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "빈 통화녹음 파일입니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "통화녹음 파일이 너무 큽니다. 25MB 이하 파일을 선택해주세요.",
        },
        {
          status: 413,
        },
      );
    }

    /* -------------------------------------------------------
       파일명 정보
    ------------------------------------------------------- */

    const filePhone =
      formatPhoneNumber(
        extractPhoneFromFileName(
          fileName,
        ),
      );

    const fileCustomerName =
      extractNameFromFileName(
        fileName,
      );

    /* -------------------------------------------------------
       OpenAI 음성 변환 요청
    ------------------------------------------------------- */

    const openAiForm =
      new FormData();

    /*
     * 음성 전사용 모델.
     * 별도 npm 패키지 없이
     * REST API를 직접 호출합니다.
     */

    openAiForm.append(
      "model",
      "gpt-4o-mini-transcribe",
    );

    openAiForm.append(
      "file",
      file,
      fileName,
    );

    openAiForm.append(
      "language",
      "ko",
    );

    openAiForm.append(
      "response_format",
      "json",
    );

    const openaiResponse =
      await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`,
          },

          body:
            openAiForm,
        },
      );

    /* -------------------------------------------------------
       OpenAI 오류
    ------------------------------------------------------- */

    if (
      !openaiResponse.ok
    ) {
      const errorMessage =
        await readOpenAiError(
          openaiResponse,
        );

      console.error(
        "OpenAI transcription error:",
        errorMessage,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            errorMessage,
        },
        {
          status:
            openaiResponse.status,
        },
      );
    }

    /* -------------------------------------------------------
       결과 읽기
    ------------------------------------------------------- */

    let transcriptionData;

    try {
      transcriptionData =
        await openaiResponse.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "음성 변환 결과를 읽지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    const transcript =
      cleanString(
        transcriptionData?.text,
      );

    if (!transcript) {
      return NextResponse.json(
        {
          success: false,
          error:
            "통화녹음에서 음성 내용을 찾지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    /* -------------------------------------------------------
       성공
    ------------------------------------------------------- */

    return NextResponse.json({
      success: true,

      data: {
        file_name:
          fileName,

        customer_phone:
          filePhone,

        customer_name:
          fileCustomerName,

        transcript,
      },
    });
  } catch (error) {
    console.error(
      "transcribe-site-call API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "통화녹음 처리 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
      }
