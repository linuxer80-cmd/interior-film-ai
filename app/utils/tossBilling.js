import crypto from "crypto";

const TOSS_API_BASE_URL =
  "https://api.tosspayments.com";

/**
 * Toss Secret Key
 *
 * 서버에서만 사용합니다.
 * NEXT_PUBLIC_ 접두사를 절대 사용하지 않습니다.
 */
export function getTossSecretKey() {
  const secretKey =
    process.env.TOSS_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.",
    );
  }

  return secretKey;
}

/**
 * Toss 테스트 Secret Key 여부
 *
 * 현재 사용 중인 키 형식(sk_test_)과
 * Toss 문서에서 사용하는 테스트 키 형식을
 * 모두 안전하게 인식합니다.
 */
function isTossTestSecretKey(
  secretKey,
) {
  const value =
    String(
      secretKey || "",
    ).trim();

  return (
    value.startsWith("sk_test_") ||
    value.startsWith("test_sk_") ||
    value.startsWith("gsk_test_") ||
    value.startsWith("test_gsk_")
  );
}

/**
 * 테스트 결제 실패 코드 확인
 *
 * 매우 중요한 안전장치:
 *
 * 1. Toss 테스트 Secret Key에서만 허용
 * 2. 테스트 코드 환경변수가 있어야 함
 * 3. 테스트 대상 orderId 환경변수가 있어야 함
 * 4. 실제 결제 orderId와 정확히 일치해야 함
 *
 * 따라서 일반 정기결제에는
 * 테스트 실패 헤더가 절대로 추가되지 않습니다.
 *
 * 테스트 종료 후에는
 * TOSS_TEST_FAILURE_CODE
 * TOSS_TEST_FAILURE_ORDER_ID
 * 두 환경변수를 삭제합니다.
 */
function getTossTestFailureCode({
  orderId,
}) {
  const secretKey =
    getTossSecretKey();

  if (
    !isTossTestSecretKey(
      secretKey,
    )
  ) {
    return null;
  }

  const testCode =
    String(
      process.env
        .TOSS_TEST_FAILURE_CODE ||
        "",
    ).trim();

  const targetOrderId =
    String(
      process.env
        .TOSS_TEST_FAILURE_ORDER_ID ||
        "",
    ).trim();

  const currentOrderId =
    String(
      orderId || "",
    ).trim();

  if (
    !testCode ||
    !targetOrderId ||
    !currentOrderId
  ) {
    return null;
  }

  if (
    targetOrderId !==
    currentOrderId
  ) {
    return null;
  }

  return testCode;
}

/**
 * Toss Basic Authorization 생성
 *
 * 공식 규격:
 * Base64("SECRET_KEY:")
 */
export function getTossAuthorizationHeader() {
  const secretKey =
    getTossSecretKey();

  const encoded =
    Buffer.from(
      `${secretKey}:`,
      "utf8",
    ).toString(
      "base64",
    );

  return `Basic ${encoded}`;
}

/**
 * 예측하기 어려운 customerKey 생성
 *
 * 이메일/전화번호/사용자 ID를
 * customerKey로 직접 사용하지 않습니다.
 */
export function createTossCustomerKey() {
  return crypto.randomUUID();
}

/**
 * Toss orderId 생성
 *
 * 주문마다 새로운 값을 사용합니다.
 */
export function createTossOrderId() {
  return `sub_${crypto.randomUUID()}`;
}

/**
 * POST 중복 실행 방지를 위한 멱등키
 */
export function createTossIdempotencyKey() {
  return crypto.randomUUID();
}

/**
 * Toss API 공통 요청 함수
 *
 * secret key는 이 서버 함수 내부에서만 사용됩니다.
 *
 * testCode는 서버 내부에서 검증된 경우에만
 * 전달됩니다.
 */
export async function tossApiRequest({
  path,
  method = "POST",
  body,
  idempotencyKey,
  testCode,
}) {
  if (
    !path ||
    typeof path !== "string" ||
    !path.startsWith("/")
  ) {
    throw new Error(
      "올바른 Toss API path가 필요합니다.",
    );
  }

  const upperMethod =
    String(
      method || "POST",
    ).toUpperCase();

  const headers = {
    Authorization:
      getTossAuthorizationHeader(),

    "Content-Type":
      "application/json",
  };

  if (idempotencyKey) {
    headers[
      "Idempotency-Key"
    ] = idempotencyKey;
  }

  /*
   * Toss 테스트 실패 재현용 헤더
   *
   * testCode가 서버의 안전조건을
   * 모두 통과한 경우에만 들어옵니다.
   */
  if (testCode) {
    const secretKey =
      getTossSecretKey();

    if (
      isTossTestSecretKey(
        secretKey,
      )
    ) {
      headers[
        "TossPayments-Test-Code"
      ] = testCode;
    }
  }

  let response;

  try {
    response =
      await fetch(
        `${TOSS_API_BASE_URL}${path}`,
        {
          method:
            upperMethod,

          headers,

          cache:
            "no-store",

          ...(body !==
          undefined
            ? {
                body:
                  JSON.stringify(
                    body,
                  ),
              }
            : {}),
        },
      );
  } catch (error) {
    console.error(
      "[Toss] network error:",
      error,
    );

    const networkError =
      new Error(
        "토스페이먼츠 서버에 연결하지 못했습니다.",
      );

    networkError.code =
      "TOSS_NETWORK_ERROR";

    networkError.status =
      502;

    throw networkError;
  }

  const rawText =
    await response.text();

  let data =
    null;

  if (rawText) {
    try {
      data =
        JSON.parse(
          rawText,
        );
    } catch {
      data = {
        message:
          rawText,
      };
    }
  }

  if (!response.ok) {
    /*
     * billingKey, authKey 등
     * 민감정보가 포함될 가능성이 있으므로
     * 전체 응답 객체를 console.log 하지 않습니다.
     */
    console.error(
      "[Toss] API error:",
      response.status,
      data?.code ||
        "UNKNOWN_ERROR",
      data?.message ||
        "요청 실패",
    );

    const tossError =
      new Error(
        data?.message ||
          "토스페이먼츠 요청에 실패했습니다.",
      );

    tossError.code =
      data?.code ||
      "TOSS_API_ERROR";

    tossError.status =
      response.status;

    throw tossError;
  }

  return data;
}

/**
 * authKey로 빌링키 발급
 *
 * 공식 API:
 * POST /v1/billing/authorizations/issue
 */
export async function issueTossBillingKey({
  authKey,
  customerKey,
  idempotencyKey,
}) {
  if (!authKey) {
    throw new Error(
      "authKey가 없습니다.",
    );
  }

  if (!customerKey) {
    throw new Error(
      "customerKey가 없습니다.",
    );
  }

  return tossApiRequest({
    path:
      "/v1/billing/authorizations/issue",

    method:
      "POST",

    body: {
      authKey,
      customerKey,
    },

    idempotencyKey,
  });
}

/**
 * billingKey로 자동결제 실행
 *
 * 실제 결제 API Route에서
 * DB에서 검증한 금액/요금제만 전달해야 합니다.
 */
export async function payWithTossBillingKey({
  billingKey,
  customerKey,
  amount,
  orderId,
  orderName,
  customerEmail,
  customerName,
  idempotencyKey,
}) {
  if (!billingKey) {
    throw new Error(
      "billingKey가 없습니다.",
    );
  }

  if (!customerKey) {
    throw new Error(
      "customerKey가 없습니다.",
    );
  }

  const safeAmount =
    Number(
      amount,
    );

  if (
    !Number.isInteger(
      safeAmount,
    ) ||
    safeAmount <= 0
  ) {
    throw new Error(
      "결제 금액이 올바르지 않습니다.",
    );
  }

  if (!orderId) {
    throw new Error(
      "orderId가 없습니다.",
    );
  }

  if (!orderName) {
    throw new Error(
      "orderName이 없습니다.",
    );
  }

  const body = {
    customerKey,
    amount:
      safeAmount,
    orderId,
    orderName,
  };

  if (customerEmail) {
    body.customerEmail =
      customerEmail;
  }

  if (customerName) {
    body.customerName =
      customerName;
  }

  /*
   * 테스트 실패코드는
   * 아래 조건을 전부 만족해야 생성됩니다.
   *
   * - Toss 테스트 Secret Key
   * - TOSS_TEST_FAILURE_CODE 존재
   * - TOSS_TEST_FAILURE_ORDER_ID 존재
   * - 현재 orderId와 정확히 일치
   */
  const testCode =
    getTossTestFailureCode({
      orderId,
    });

  return tossApiRequest({
    path:
      `/v1/billing/${encodeURIComponent(
        billingKey,
      )}`,

    method:
      "POST",

    body,

    idempotencyKey,

    testCode,
  });
}
