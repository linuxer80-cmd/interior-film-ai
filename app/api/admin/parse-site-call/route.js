import { NextResponse } from "next/server";
import OpenAI from "openai";

/* =========================================================
   설정
========================================================= */

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================================
   JSON 안전 파싱
========================================================= */

function safeJsonParse(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    /*
     * 혹시 모델이 ```json 코드블록을 붙여서
     * 반환한 경우를 대비합니다.
     */

    try {
      const cleaned = String(value)
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

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
   금액 정리
========================================================= */

function cleanAmount(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return Math.max(
      0,
      Math.round(value),
    );
  }

  const text =
    String(value)
      .replace(/,/g, "")
      .replace(/원/g, "")
      .trim();

  const number =
    Number(text);

  if (!Number.isFinite(number)) {
    return "";
  }

  return Math.max(
    0,
    Math.round(number),
  );
}

/* =========================================================
   날짜 형식 확인
========================================================= */

function cleanDate(value) {
  const text =
    cleanString(value);

  if (!text) {
    return "";
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text,
    )
  ) {
    return text;
  }

  return "";
}

/* =========================================================
   시간 형식 확인
========================================================= */

function cleanTime(value) {
  const text =
    cleanString(value);

  if (!text) {
    return "";
  }

  /*
   * HH:mm
   */

  if (
    /^([01]\d|2[0-3]):[0-5]\d$/.test(
      text,
    )
  ) {
    return text;
  }

  return "";
}

/* =========================================================
   자재 정리
========================================================= */

function cleanMaterials(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return null;
      }

      const brand =
        cleanString(
          item.brand,
        );

      const productCode =
        cleanString(
          item.product_code,
        );

      const productName =
        cleanString(
          item.product_name,
        );

      const quantity =
        item.quantity === null ||
        item.quantity === undefined ||
        item.quantity === ""
          ? ""
          : cleanString(
              item.quantity,
            );

      const unit =
        cleanString(
          item.unit,
        );

      const memo =
        cleanString(
          item.memo,
        );

      /*
       * 자재에 아무 정보도 없으면 제거
       */

      if (
        !brand &&
        !productCode &&
        !productName &&
        !quantity &&
        !memo
      ) {
        return null;
      }

      return {
        brand,
        product_code:
          productCode,
        product_name:
          productName,
        quantity,

        unit:
          unit || "m",

        memo,
      };
    })
    .filter(Boolean);
}

/* =========================================================
   결과 정리
========================================================= */

function normalizeResult(raw) {
  const source =
    raw &&
    typeof raw === "object"
      ? raw
      : {};

  return {
    date:
      cleanDate(
        source.date,
      ),

    start_time:
      cleanTime(
        source.start_time,
      ),

    end_time:
      cleanTime(
        source.end_time,
      ),

    customer_name:
      cleanString(
        source.customer_name,
      ),

    customer_phone:
      cleanString(
        source.customer_phone,
      ),

    site_name:
      cleanString(
        source.site_name,
      ),

    address:
      cleanString(
        source.address,
      ),

    address_detail:
      cleanString(
        source.address_detail,
      ),

    region:
      cleanString(
        source.region,
      ),

    work_type:
      cleanString(
        source.work_type,
      ),

    work_description:
      cleanString(
        source.work_description,
      ),

    contract_amount:
      cleanAmount(
        source.contract_amount,
      ),

    deposit_amount:
      cleanAmount(
        source.deposit_amount,
      ),

    memo:
      cleanString(
        source.memo,
      ),

    materials:
      cleanMaterials(
        source.materials,
      ),
  };
}

/* =========================================================
   POST
========================================================= */

export async function POST(request) {
  try {
    /* =====================================================
       API KEY 확인
    ===================================================== */

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

    /* =====================================================
       요청 읽기
    ===================================================== */

    const body =
      await request.json();

    const content =
      cleanString(
        body?.content,
      );

    if (!content) {
      return NextResponse.json(
        {
          success: false,

          error:
            "통화내용이 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (content.length < 5) {
      return NextResponse.json(
        {
          success: false,

          error:
            "통화내용이 너무 짧습니다.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * 지나치게 긴 통화 전문으로 인한
     * 비용 증가를 막습니다.
     *
     * 일반적인 통화요약은 이보다 훨씬 짧습니다.
     */

    const trimmedContent =
      content.slice(
        0,
        20000,
      );

    /* =====================================================
       현재 날짜

       "다음주 월요일", "내일" 등의 표현을
       해석할 때 기준일로 사용합니다.
    ===================================================== */

    const now =
      new Date();

    const currentDate =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            "Asia/Seoul",

          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        },
      ).format(now);

    /* =====================================================
       AI 분석
    ===================================================== */

    const response =
      await openai.responses.create({
        model:
          "gpt-5.6-luna",

        temperature: 0,

        input: [
          {
            role: "system",

            content: [
              {
                type:
                  "input_text",

                text: `
당신은 대한민국 인테리어필름 시공업체의 일정등록 보조 AI입니다.

관리자가 고객과 통화한 내용 또는 휴대폰 통화요약을 입력합니다.

통화내용에서 명확하게 확인되는 정보만 추출하세요.

절대 지켜야 할 규칙:

1. 통화내용에 없는 사실은 추측하지 마세요.
2. 불확실한 값은 빈 문자열 ""로 반환하세요.
3. 날짜는 YYYY-MM-DD 형식으로 반환하세요.
4. 시간은 24시간 HH:mm 형식으로 반환하세요.
5. "오전 9시"는 "09:00"처럼 변환할 수 있습니다.
6. "오후 2시"는 "14:00"처럼 변환할 수 있습니다.
7. 상대 날짜 표현은 기준일을 이용해 계산할 수 있습니다.
8. 계약금액과 선금은 원 단위 숫자로 반환하세요.
9. "120만원"은 1200000으로 변환하세요.
10. "30만"은 300000으로 변환하세요.
11. 전화번호가 명확하면 그대로 추출하세요.
12. 주소와 상세주소를 가능한 경우 구분하세요.
13. 지역은 주소에서 명확히 알 수 있을 때만 추출하세요.
14. 현장명은 아파트명, 건물명 등 명확한 명칭이 있을 때만 입력하세요.
15. 시공 종류는 "싱크대", "문·문틀", "붙박이장" 등 통화에서 확인되는 표현을 사용하세요.
16. 상세 작업내용은 시공 부위와 수량 등 실제 통화내용을 간결하게 정리하세요.
17. 필름 제조사, 제품코드, 제품명/색상이 명확하면 materials에 넣으세요.
18. 자재 수량을 모르면 빈 문자열로 반환하세요.
19. 자재 단위를 모르면 "m"를 사용하세요.
20. 통화내용 중 현장 작업에 필요한 기타 중요한 내용은 memo에 정리하세요.
21. 고객에게 하지 않은 약속이나 새로운 작업내용을 만들어내지 마세요.
22. 반드시 JSON 객체 하나만 반환하세요.
23. 설명, 마크다운, 코드블록은 반환하지 마세요.

기준 날짜:
${currentDate}

반환 JSON 형식:

{
  "date": "",
  "start_time": "",
  "end_time": "",
  "customer_name": "",
  "customer_phone": "",
  "site_name": "",
  "address": "",
  "address_detail": "",
  "region": "",
  "work_type": "",
  "work_description": "",
  "contract_amount": "",
  "deposit_amount": "",
  "memo": "",
  "materials": [
    {
      "brand": "",
      "product_code": "",
      "product_name": "",
      "quantity": "",
      "unit": "m",
      "memo": ""
    }
  ]
}
                `.trim(),
              },
            ],
          },

          {
            role: "user",

            content: [
              {
                type:
                  "input_text",

                text:
                  trimmedContent,
              },
            ],
          },
        ],
      });

    /* =====================================================
       응답 텍스트
    ===================================================== */

    const outputText =
      response.output_text ||
      "";

    const parsed =
      safeJsonParse(
        outputText,
      );

    if (!parsed) {
      console.error(
        "통화내용 AI JSON 파싱 실패:",
        outputText,
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "AI 분석 결과를 읽지 못했습니다. 다시 시도해주세요.",
        },
        {
          status: 500,
        },
      );
    }

    /* =====================================================
       최종 정리
    ===================================================== */

    const data =
      normalizeResult(
        parsed,
      );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "통화내용 AI 분석 API 오류:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "통화내용 분석 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
         }
