import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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
   JSON 안전 파싱
========================================================= */

function parseJson(text) {
  if (!text) {
    return null;
  }

  let cleaned =
    String(text).trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    /*
     * 앞뒤에 설명이 붙은 경우
     * JSON 객체 부분만 다시 시도
     */

    const start =
      cleaned.indexOf("{");

    const end =
      cleaned.lastIndexOf("}");

    if (
      start >= 0 &&
      end > start
    ) {
      try {
        return JSON.parse(
          cleaned.slice(
            start,
            end + 1,
          ),
        );
      } catch {
        return null;
      }
    }

    return null;
  }
}

/* =========================================================
   Responses API 결과 텍스트 추출
========================================================= */

function extractOutputText(data) {
  if (
    typeof data?.output_text ===
      "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) {
    return "";
  }

  const texts = [];

  for (const item of data.output) {
    if (
      !Array.isArray(
        item?.content,
      )
    ) {
      continue;
    }

    for (const content of item.content) {
      if (
        content?.type ===
          "output_text" &&
        typeof content?.text ===
          "string"
      ) {
        texts.push(
          content.text,
        );
      }
    }
  }

  return texts
    .join("\n")
    .trim();
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

  if (
    !Number.isFinite(number)
  ) {
    return "";
  }

  return Math.max(
    0,
    Math.round(number),
  );
}

/* =========================================================
   날짜 정리
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
   시간 정리
========================================================= */

function cleanTime(value) {
  const text =
    cleanString(value);

  if (!text) {
    return "";
  }

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
    .slice(0, 20)
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
   최종 결과 정리
========================================================= */

function normalizeResult(raw) {
  const source =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw)
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
   한국 기준 오늘 날짜
========================================================= */

function getKoreaDateString() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Seoul",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      },
    ).formatToParts(
      new Date(),
    );

  const values = {};

  for (const part of parts) {
    values[part.type] =
      part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

/* =========================================================
   POST
========================================================= */

export async function POST(request) {
  try {
    /* -------------------------------------------------------
       API KEY 확인
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
       요청 읽기
    ------------------------------------------------------- */

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

    if (
      content.length < 5
    ) {
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
     * 불필요한 API 사용량 제한
     */

    const trimmedContent =
      content.slice(
        0,
        20000,
      );

    const currentDate =
      getKoreaDateString();

    /* -------------------------------------------------------
       AI 지시문

       중요:
       녹음시간 / 통화시간 / 파일시간을
       시공일정으로 사용하지 않습니다.

       통화내용에서 실제 시공일정으로
       명확하게 언급된 경우에만
       날짜와 시간을 반환합니다.
    ------------------------------------------------------- */

    const instruction = `
당신은 대한민국 인테리어필름 시공업체의 일정등록 보조 AI입니다.

관리자가 고객과 통화한 내용, 통화 녹취 요약 또는 직접 작성한 상담 메모를 입력합니다.

통화내용에서 명확하게 확인되는 정보만 추출하세요.

현재 대한민국 기준 날짜는 ${currentDate} 입니다.

반드시 지켜야 할 규칙:

1. 통화내용에 없는 사실은 추측하지 마세요.
2. 불확실한 값은 빈 문자열 ""로 반환하세요.
3. 날짜는 YYYY-MM-DD 형식으로 반환하세요.
4. 시간은 24시간 HH:mm 형식으로 반환하세요.
5. 오전 9시는 09:00으로 변환하세요.
6. 오후 2시는 14:00으로 변환하세요.

7. "오늘", "내일", "모레", "다음주 월요일"처럼 현재 날짜를 기준으로 명확하게 계산할 수 있는 시공 날짜는 실제 YYYY-MM-DD 날짜로 변환하세요.
8. 상대 날짜 표현이 애매하면 추측하지 말고 date를 빈 문자열 ""로 반환하세요.

9. 매우 중요:
녹음파일의 녹음 시각, 통화 시작 시각, 통화 종료 시각, 파일 생성 시각, 파일 수정 시각은 시공 일정이 아닙니다.
이러한 시각을 date, start_time, end_time에 절대로 사용하지 마세요.

10. date는 통화 내용에서 고객과 시공업체가 실제 시공 날짜 또는 방문 날짜를 명확하게 언급한 경우에만 입력하세요.

11. start_time은 통화 내용에서 실제 시공 시작시간 또는 현장 방문시간을 명확하게 언급한 경우에만 입력하세요.

12. end_time은 통화 내용에서 실제 시공 종료시간을 명확하게 언급한 경우에만 입력하세요.

13. 시공 날짜가 언급되지 않았다면 date는 반드시 ""로 반환하세요.

14. 시공 시작시간이 언급되지 않았다면 start_time은 반드시 ""로 반환하세요.

15. 시공 종료시간이 언급되지 않았다면 end_time은 반드시 ""로 반환하세요.

16. "오전에", "오전쯤", "점심쯤", "점심 이후", "오후에", "저녁쯤"처럼 정확한 시각이 없는 표현을 임의의 HH:mm 시간으로 변환하지 마세요.
이 경우 start_time과 end_time은 빈 문자열 ""로 반환하세요.
필요하면 해당 표현은 memo에 남길 수 있습니다.

17. "9시", "오전 9시", "9시 반", "오후 2시 30분"처럼 실제 시공시간으로 명확하게 말한 경우에는 정확한 HH:mm 값으로 변환할 수 있습니다.

18. 통화 내용에 단순히 "지금 9시인데요", "아까 2시에 전화했어요", "10분 전에 통화했어요"처럼 통화 자체의 시간을 설명하는 내용이 있더라도 시공시간으로 사용하지 마세요.

19. 날짜와 시간이 같은 문장에 등장하더라도 그것이 실제 시공 일정인지 문맥을 확인하세요.
시공, 방문, 작업, 현장 도착 등의 일정으로 명확한 경우에만 date/start_time/end_time에 넣으세요.

20. 예:
"이번 주 금요일 오전 9시에 시공하러 갈게요."
→ date에는 해당 금요일의 실제 날짜
→ start_time은 "09:00"
→ end_time은 ""

21. 예:
"금요일에 작업할게요."
→ date에는 해당 금요일의 실제 날짜
→ start_time은 ""
→ end_time은 ""

22. 예:
"금요일 오전에 갈게요."
→ date에는 해당 금요일의 실제 날짜
→ start_time은 ""
→ end_time은 ""
→ 필요하면 memo에 "오전 방문 예정"이라고 정리할 수 있습니다.

23. 예:
"오전 9시부터 오후 5시까지 작업할게요."
그리고 해당 통화에서 시공 날짜도 명확하게 확인되는 경우
→ start_time은 "09:00"
→ end_time은 "17:00"

24. 예:
통화 내용에 시공 날짜와 시공시간 언급이 전혀 없음
→ date는 ""
→ start_time은 ""
→ end_time은 ""

25. 계약금액과 계약금/선금은 원 단위 숫자로 반환하세요.
26. 120만원은 1200000으로 변환하세요.
27. 30만원은 300000으로 변환하세요.

28. 전화번호가 명확하면 그대로 추출하세요.

29. 주소와 상세주소를 가능한 경우 구분하세요.

30. 지역은 주소에서 명확하게 확인 가능한 경우만 추출하세요.

31. 아파트명 또는 건물명이 명확하면 site_name에 넣으세요.

32. 시공 종류는 실제 통화에서 확인되는 내용을 사용하세요.

33. 시공 종류 예:
싱크대, 문·문틀, 방화문, 붙박이장, 신발장, 샤시, 아트월, 화장대, 중문, 냉장고장.

34. work_description에는 실제 통화에서 확인되는 시공 부위, 개수, 범위 등 작업에 필요한 내용을 간결하게 정리하세요.

35. 필름 제조사, 제품코드, 제품명 또는 색상이 명확하면 materials에 넣으세요.

36. 예:
"현대보닥 S115"
가 명확하게 언급되면
brand는 "현대보닥"
product_code는 "S115"
로 넣으세요.

37. 자재 수량을 모르면 quantity는 빈 문자열 ""로 반환하세요.

38. 자재 단위를 모르면 unit은 "m"으로 반환하세요.

39. 주차, 출입방법, 비밀번호 전달 예정, 고객 요청사항, 정확하지 않은 방문 시간대 등 현장에 필요한 기타 정보는 memo에 정리하세요.

40. 고객이 말하지 않은 약속이나 작업내용을 새로 만들어내지 마세요.

41. 고객명은 통화에서 명확하게 확인되는 경우에만 customer_name에 넣으세요.
통화 상대방의 이름을 추측하지 마세요.

42. 고객 전화번호도 통화내용에서 명확하게 확인되는 경우에만 customer_phone에 넣으세요.
전화번호가 통화내용에 없다면 빈 문자열 ""로 반환하세요.
녹음파일명에서 별도로 확인된 전화번호는 다른 단계에서 처리하므로 여기에서 추측하지 마세요.

43. 금액을 언급했더라도 계약금액인지 계약금/선금인지 문맥이 명확하지 않으면 임의로 contract_amount 또는 deposit_amount에 넣지 마세요.
필요하면 memo에 해당 금액 내용을 정리하세요.

44. 같은 정보가 여러 번 언급되고 최종적으로 변경된 경우에는 통화에서 최종 합의된 내용을 우선하세요.

45. 반드시 JSON 객체 하나만 반환하세요.

46. 설명문, 마크다운, 코드블록을 반환하지 마세요.

반환 형식:

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

분석할 통화내용:

${trimmedContent}
`.trim();

    /* -------------------------------------------------------
       기존 프로젝트와 동일한 방식으로
       OpenAI Responses API 직접 호출
    ------------------------------------------------------- */

    const openaiResponse =
      await fetch(
        "https://api.openai.com/v1/responses",
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              model:
                "gpt-5.6-luna",

              input: [
                {
                  role:
                    "user",

                  content: [
                    {
                      type:
                        "input_text",

                      text:
                        instruction,
                    },
                  ],
                },
              ],
            }),
        },
      );

    const data =
      await openaiResponse.json();

    /* -------------------------------------------------------
       OpenAI 오류
    ------------------------------------------------------- */

    if (
      !openaiResponse.ok
    ) {
      console.error(
        "OpenAI parse-site-call error:",
        data,
      );

      return NextResponse.json(
        {
          success: false,

          error:
            data?.error
              ?.message ||
            "AI 통화내용 분석 요청에 실패했습니다.",
        },
        {
          status:
            openaiResponse.status,
        },
      );
    }

    /* -------------------------------------------------------
       AI 텍스트 추출
    ------------------------------------------------------- */

    const outputText =
      extractOutputText(
        data,
      );

    if (!outputText) {
      console.error(
        "AI output empty:",
        data,
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "AI 분석 결과가 없습니다.",
        },
        {
          status: 500,
        },
      );
    }

    /* -------------------------------------------------------
       JSON 변환
    ------------------------------------------------------- */

    const parsed =
      parseJson(
        outputText,
      );

    if (!parsed) {
      console.error(
        "통화내용 JSON 파싱 실패:",
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

    /* -------------------------------------------------------
       최종 데이터 정리
    ------------------------------------------------------- */

    const result =
      normalizeResult(
        parsed,
      );

    return NextResponse.json({
      success: true,

      data:
        result,
    });
  } catch (error) {
    console.error(
      "parse-site-call API error:",
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
