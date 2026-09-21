"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

/* =========================================================
   관리자 - 시공자 완료보고 검수
   현재 단계:
   - 완료보고 조회
   - 시공 전/완료 사진
   - 실제 사용 자재
   - 경비
   - 검수 상태 표시

   아직 하지 않는 것:
   - 승인
   - 보완 요청
   - AI 자료 등록
========================================================= */

export default function SiteWorkReportReview({
  siteId,
}) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] =
    useState("");

  const [data, setData] = useState(null);

  /* =========================================================
     최초 조회
  ========================================================= */

  useEffect(() => {
    if (!siteId) {
      setLoading(false);
      setData(null);
      return;
    }

    loadReview();
  }, [siteId]);

  /* =========================================================
     검수자료 조회
  ========================================================= */

  async function loadReview() {
    setLoading(true);
    setErrorMessage("");
    setData(null);

    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(
          `로그인 세션 확인 실패: ${
            sessionError.message ||
            "알 수 없는 오류"
          }`
        );
      }

      const accessToken =
        sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error(
          "관리자 로그인 세션이 없습니다. 다시 로그인해주세요."
        );
      }

      const apiUrl =
        `/api/admin/site-work-report-review?siteId=${encodeURIComponent(
          siteId
        )}`;

      console.log(
        "완료보고 검수자료 요청:",
        {
          siteId,
          apiUrl,
        }
      );

      const response = await fetch(
        apiUrl,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            Accept:
              "application/json",
          },

          cache: "no-store",

          signal:
            controller.signal,
        }
      );

      const responseText =
        await response.text();

      let result = null;

      if (responseText) {
        try {
          result =
            JSON.parse(responseText);
        } catch (parseError) {
          console.error(
            "검수 API JSON 변환 오류:",
            parseError,
            responseText
          );

          throw new Error(
            `서버 응답 형식 오류 (HTTP ${response.status})`
          );
        }
      }

      console.log(
        "완료보고 검수자료 응답:",
        {
          status:
            response.status,

          ok:
            response.ok,

          result,
        }
      );

      if (!response.ok) {
        throw new Error(
          result?.error ||
            `완료보고 조회 실패 (HTTP ${response.status})`
        );
      }

      if (!result?.success) {
        throw new Error(
          result?.error ||
            "완료보고 검수자료 조회에 실패했습니다."
        );
      }

      setData(result);
    } catch (error) {
      console.error(
        "완료보고 검수자료 조회 오류:",
        error
      );

      setData(null);

      if (
        error?.name ===
        "AbortError"
      ) {
        setErrorMessage(
          "완료보고 조회가 15초 이상 걸려 중단했습니다. 서버 API 응답을 확인해주세요."
        );
      } else {
        setErrorMessage(
          error?.message ||
            "완료보고 검수자료를 불러오지 못했습니다."
        );
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  /* =========================================================
     날짜
  ========================================================= */

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat(
      "ko-KR",
      {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).format(date);
  }

  /* =========================================================
     금액
  ========================================================= */

  function formatMoney(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "0원";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0원";
    }

    return `${new Intl.NumberFormat(
      "ko-KR"
    ).format(number)}원`;
  }

  /* =========================================================
     수량
  ========================================================= */

  function formatQuantity(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "-";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
    }

    return new Intl.NumberFormat(
      "ko-KR",
      {
        maximumFractionDigits: 2,
      }
    ).format(number);
  }

  /* =========================================================
     경비 종류
  ========================================================= */

  function getExpenseLabel(type) {
    switch (type) {
      case "parking":
        return "주차비";

      case "meal":
        return "식비";

      case "fuel":
        return "유류비";

      case "toll":
        return "통행료";

      case "material":
        return "추가 자재비";

      case "other":
      default:
        return "기타";
    }
  }

  /* =========================================================
     검수 상태
  ========================================================= */

  function getReviewInfo(status) {
    switch (status) {
      case "approved":
        return {
          icon: "🟢",
          title: "관리자 승인 완료",
          label: "승인 완료",
          background: "#f0fdf4",
          border: "#bbf7d0",
          color: "#166534",
        };

      case "rejected":
        return {
          icon: "🔴",
          title: "보완 요청",
          label: "보완 필요",
          background: "#fef2f2",
          border: "#fecaca",
          color: "#b91c1c",
        };

      case "pending":
      default:
        return {
          icon: "🟠",
          title: "시공자 완료보고",
          label: "검수 대기",
          background: "#fffbeb",
          border: "#fde68a",
          color: "#92400e",
        };
    }
  }

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <section
        style={{
          marginTop: "14px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "16px",
          padding: "18px",
        }}
      >
        <div
          style={{
            color: "#64748b",
            fontSize: "13px",
            fontWeight: "800",
          }}
        >
          시공자 완료보고를 확인하고 있습니다...
        </div>
      </section>
    );
  }

  /* =========================================================
     오류
  ========================================================= */

  if (errorMessage) {
    return (
      <section
        style={{
          marginTop: "14px",
          background: "#ffffff",
          border: "1px solid #fecaca",
          borderRadius: "16px",
          padding: "18px",
        }}
      >
        <div
          style={{
            color: "#b91c1c",
            fontSize: "13px",
            fontWeight: "900",
          }}
        >
          ❌ 완료보고 조회 오류
        </div>

        <div
          style={{
            marginTop: "8px",
            color: "#7f1d1d",
            fontSize: "12px",
            lineHeight: 1.6,
          }}
        >
          {errorMessage}
        </div>

        <button
          type="button"
          onClick={loadReview}
          style={{
            width: "100%",
            marginTop: "12px",
            border: "none",
            borderRadius: "10px",
            background: "#111827",
            color: "#ffffff",
            padding: "11px",
            fontSize: "12px",
            fontWeight: "900",
            cursor: "pointer",
          }}
        >
          다시 불러오기
        </button>
      </section>
    );
  }

  /* =========================================================
     완료보고 없음

     관리자 화면을 불필요하게 길게 만들지 않기 위해
     보고서가 없으면 아무것도 표시하지 않는다.
  ========================================================= */

  if (
    !data?.hasReport ||
    !data?.report
  ) {
    return null;
  }

  const report = data.report;

  const worker = data.worker;

  const materials = Array.isArray(
    data.materials
  )
    ? data.materials
    : [];

  const expenses = Array.isArray(
    data.expenses
  )
    ? data.expenses
    : [];

  const beforePhotos = Array.isArray(
    data.beforePhotos
  )
    ? data.beforePhotos
    : [];

  const afterPhotos = Array.isArray(
    data.afterPhotos
  )
    ? data.afterPhotos
    : [];

  const reviewStatus =
    data?.review?.status ||
    report?.review_status ||
    "pending";

  const review =
    getReviewInfo(reviewStatus);

  const totalExpense =
    expenses.reduce(
      (sum, item) => {
        const amount =
          Number(item?.amount);

        if (!Number.isFinite(amount)) {
          return sum;
        }

        return sum + amount;
      },
      0
    );

  /* =========================================================
     화면
  ========================================================= */

  return (
    <section
      style={{
        marginTop: "14px",
        background: "#ffffff",
        border: `1px solid ${review.border}`,
        borderRadius: "16px",
        padding: "18px",
      }}
    >
      {/* =====================================================
          제목
      ===================================================== */}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              color: "#111827",
              fontSize: "16px",
              fontWeight: "900",
            }}
          >
            {review.icon} {review.title}
          </div>

          <div
            style={{
              marginTop: "5px",
              color: review.color,
              fontSize: "12px",
              fontWeight: "900",
            }}
          >
            {review.label}
          </div>
        </div>

        <div
          style={{
            flex: "0 0 auto",
            padding: "6px 10px",
            borderRadius: "999px",
            background: review.background,
            border: `1px solid ${review.border}`,
            color: review.color,
            fontSize: "10px",
            fontWeight: "900",
          }}
        >
          {review.label}
        </div>
      </div>

      {/* =====================================================
          검수대기 안내
      ===================================================== */}

      {reviewStatus === "pending" && (
        <div
          style={{
            marginTop: "14px",
            padding: "13px",
            borderRadius: "10px",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: "12px",
            fontWeight: "800",
            lineHeight: 1.7,
          }}
        >
          시공자가 완료보고를 제출했습니다.
          <br />
          시공 내용, 사진, 실제 사용 자재와 경비를
          확인해주세요.
          <br />
          아직 AI 견적자료로 등록되지 않았습니다.
        </div>
      )}

      {/* =====================================================
          작성 시공자
      ===================================================== */}

      <ReviewBlock title="👷 제출 시공자">
        <ReviewRow
          label="이름"
          value={
            worker?.name ||
            "시공자 정보 없음"
          }
        />

        {worker?.phone && (
          <ReviewRow
            label="전화"
            value={worker.phone}
          />
        )}

        <ReviewRow
          label="제출일"
          value={formatDateTime(
            report.completed_at ||
              report.updated_at ||
              report.created_at
          )}
        />
      </ReviewBlock>

      {/* =====================================================
          실제 시공내용
      ===================================================== */}

      <ReviewBlock title="🛠️ 실제 시공 내용">
        {report.work_region && (
          <ReviewRow
            label="시공지역"
            value={report.work_region}
          />
        )}

        <div
          style={{
            marginTop: "8px",
            padding: "12px",
            borderRadius: "10px",
            background: "#f8fafc",
            color: "#334155",
            fontSize: "13px",
            fontWeight: "800",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {report.work_summary ||
            "등록된 시공 내용이 없습니다."}
        </div>

        {report.memo && (
          <div
            style={{
              marginTop: "10px",
              padding: "12px",
              borderRadius: "10px",
              background: "#f8fafc",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "10px",
                fontWeight: "800",
              }}
            >
              시공자 메모
            </div>

            <div
              style={{
                marginTop: "5px",
                color: "#475569",
                fontSize: "12px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {report.memo}
            </div>
          </div>
        )}
      </ReviewBlock>

      {/* =====================================================
          시공 전 사진
      ===================================================== */}

      <ReviewBlock
        title={`📷 시공 전 사진 · ${beforePhotos.length}장`}
      >
        {beforePhotos.length === 0 ? (
          <EmptyText>
            등록된 시공 전 사진이 없습니다.
          </EmptyText>
        ) : (
          <PhotoGrid
            photos={beforePhotos}
          />
        )}
      </ReviewBlock>

      {/* =====================================================
          시공 완료 사진
      ===================================================== */}

      <ReviewBlock
        title={`📸 시공 완료 사진 · ${afterPhotos.length}장`}
      >
        {afterPhotos.length === 0 ? (
          <EmptyText>
            등록된 완료 사진이 없습니다.
          </EmptyText>
        ) : (
          <PhotoGrid
            photos={afterPhotos}
          />
        )}
      </ReviewBlock>

      {/* =====================================================
          실제 사용 자재
      ===================================================== */}

      <ReviewBlock
        title={`📦 실제 사용 자재 · ${materials.length}건`}
      >
        {materials.length === 0 ? (
          <EmptyText>
            등록된 실제 사용 자재가 없습니다.
          </EmptyText>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "9px",
            }}
          >
            {materials.map(
              (material, index) => {
                const quantityText = [
                  formatQuantity(
                    material.quantity
                  ),
                  material.unit,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div
                    key={
                      material.id ||
                      `${material.product_code}-${index}`
                    }
                    style={{
                      padding: "12px",
                      border:
                        "1px solid #e2e8f0",
                      borderRadius: "10px",
                      background: "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "flex-start",
                        justifyContent:
                          "space-between",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {material.brand && (
                          <div
                            style={{
                              color:
                                "#64748b",
                              fontSize:
                                "10px",
                              fontWeight:
                                "800",
                            }}
                          >
                            {material.brand}
                          </div>
                        )}

                        <div
                          style={{
                            marginTop:
                              material.brand
                                ? "3px"
                                : 0,
                            color: "#111827",
                            fontSize: "13px",
                            fontWeight: "900",
                            wordBreak:
                              "break-word",
                          }}
                        >
                          {material.product_code ||
                            material.product_name ||
                            "자재"}
                        </div>

                        {material.product_name &&
                          material.product_name !==
                            material.product_code && (
                            <div
                              style={{
                                marginTop:
                                  "3px",
                                color:
                                  "#64748b",
                                fontSize:
                                  "11px",
                              }}
                            >
                              {
                                material.product_name
                              }
                            </div>
                          )}
                      </div>

                      <div
                        style={{
                          flex: "0 0 auto",
                          color: "#111827",
                          fontSize: "12px",
                          fontWeight: "900",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {quantityText}
                      </div>
                    </div>

                    {material.memo && (
                      <div
                        style={{
                          marginTop: "8px",
                          color: "#64748b",
                          fontSize: "11px",
                          lineHeight: 1.5,
                        }}
                      >
                        메모 {material.memo}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        )}
      </ReviewBlock>
      {/* =====================================================
          현장 경비
      ===================================================== */}

      <ReviewBlock
        title={`💳 현장 경비 · ${expenses.length}건`}
      >
        {expenses.length === 0 ? (
          <EmptyText>
            등록된 현장 경비가 없습니다.
          </EmptyText>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gap: "9px",
              }}
            >
              {expenses.map(
                (expense, index) => (
                  <div
                    key={
                      expense.id ||
                      `${expense.expense_type}-${index}`
                    }
                    style={{
                      padding: "12px",
                      border:
                        "1px solid #e2e8f0",
                      borderRadius: "10px",
                      background: "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent:
                          "space-between",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          color: "#334155",
                          fontSize: "12px",
                          fontWeight: "900",
                        }}
                      >
                        {getExpenseLabel(
                          expense.expense_type
                        )}
                      </div>

                      <div
                        style={{
                          color: "#111827",
                          fontSize: "13px",
                          fontWeight: "900",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatMoney(
                          expense.amount
                        )}
                      </div>
                    </div>

                    {expense.description && (
                      <div
                        style={{
                          marginTop: "7px",
                          color: "#64748b",
                          fontSize: "11px",
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {expense.description}
                      </div>
                    )}

                    {expense.expense_date && (
                      <div
                        style={{
                          marginTop: "5px",
                          color: "#94a3b8",
                          fontSize: "10px",
                          fontWeight: "700",
                        }}
                      >
                        {expense.expense_date}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            <div
              style={{
                marginTop: "10px",
                padding: "12px",
                borderRadius: "10px",
                background: "#f8fafc",
                textAlign: "right",
              }}
            >
              <span
                style={{
                  color: "#64748b",
                  fontSize: "11px",
                  fontWeight: "800",
                }}
              >
                경비 합계
              </span>

              <span
                style={{
                  marginLeft: "8px",
                  color: "#111827",
                  fontSize: "15px",
                  fontWeight: "900",
                }}
              >
                {formatMoney(totalExpense)}
              </span>
            </div>
          </>
        )}
      </ReviewBlock>

      {/* =====================================================
          기존 검수 결과

          승인/보완 요청 기능은 다음 단계에서 추가한다.
      ===================================================== */}

      {reviewStatus === "approved" && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            borderRadius: "12px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
          }}
        >
          <div
            style={{
              color: "#166534",
              fontSize: "13px",
              fontWeight: "900",
            }}
          >
            🟢 관리자 검수 승인 완료
          </div>

          {data?.review?.approvedAmount !==
            null &&
            data?.review?.approvedAmount !==
              undefined && (
              <div
                style={{
                  marginTop: "9px",
                  color: "#166534",
                  fontSize: "12px",
                  fontWeight: "800",
                }}
              >
                실제 시공금액{" "}
                {formatMoney(
                  data.review.approvedAmount
                )}
              </div>
            )}

          {data?.review?.memo && (
            <div
              style={{
                marginTop: "9px",
                color: "#166534",
                fontSize: "12px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {data.review.memo}
            </div>
          )}

          {data?.review?.reviewedAt && (
            <div
              style={{
                marginTop: "7px",
                color: "#15803d",
                fontSize: "10px",
                fontWeight: "700",
              }}
            >
              검수일{" "}
              {formatDateTime(
                data.review.reviewedAt
              )}
            </div>
          )}
        </div>
      )}

      {reviewStatus === "rejected" && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            borderRadius: "12px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
          }}
        >
          <div
            style={{
              color: "#b91c1c",
              fontSize: "13px",
              fontWeight: "900",
            }}
          >
            🔴 관리자 보완 요청
          </div>

          {data?.review?.memo ? (
            <div
              style={{
                marginTop: "9px",
                color: "#7f1d1d",
                fontSize: "12px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {data.review.memo}
            </div>
          ) : (
            <div
              style={{
                marginTop: "9px",
                color: "#991b1b",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              보완 요청 사유가 등록되지
              않았습니다.
            </div>
          )}

          {data?.review?.reviewedAt && (
            <div
              style={{
                marginTop: "7px",
                color: "#991b1b",
                fontSize: "10px",
                fontWeight: "700",
              }}
            >
              검수일{" "}
              {formatDateTime(
                data.review.reviewedAt
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================
          현재 단계 안내
      ===================================================== */}

      {reviewStatus === "pending" && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            borderRadius: "12px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              color: "#334155",
              fontSize: "12px",
              fontWeight: "900",
              lineHeight: 1.6,
            }}
          >
            다음 단계에서 실제 시공금액 입력,
            보완 요청, 검수 승인 기능을
            연결합니다.
          </div>

          <div
            style={{
              marginTop: "6px",
              color: "#64748b",
              fontSize: "11px",
              lineHeight: 1.6,
            }}
          >
            관리자 승인 전에는 완료사진을
            AI 유사견적용 시공 DB에 등록하지
            않습니다.
          </div>
        </div>
      )}
    </section>
  );
}

/* =========================================================
   검수 블록
========================================================= */

function ReviewBlock({
  title,
  children,
}) {
  return (
    <div
      style={{
        marginTop: "16px",
        paddingTop: "16px",
        borderTop:
          "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          marginBottom: "10px",
          color: "#111827",
          fontSize: "13px",
          fontWeight: "900",
        }}
      >
        {title}
      </div>

      {children}
    </div>
  );
}

/* =========================================================
   한 줄 정보
========================================================= */

function ReviewRow({
  label,
  value,
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "80px minmax(0, 1fr)",
        gap: "10px",
        padding: "7px 0",
        borderBottom:
          "1px solid #f1f5f9",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "11px",
          fontWeight: "800",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#111827",
          fontSize: "12px",
          fontWeight: "800",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value || "-"}
      </div>
    </div>
  );
}

/* =========================================================
   빈 내용
========================================================= */

function EmptyText({
  children,
}) {
  return (
    <div
      style={{
        padding: "13px",
        borderRadius: "10px",
        background: "#f8fafc",
        border:
          "1px dashed #cbd5e1",
        color: "#64748b",
        fontSize: "11px",
        lineHeight: 1.6,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

/* =========================================================
   사진 목록
========================================================= */

function PhotoGrid({
  photos,
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(2, minmax(0, 1fr))",
        gap: "9px",
      }}
    >
      {photos.map(
        (photo, index) => (
          <PhotoCard
            key={
              photo.id ||
              `${photo.storage_path}-${index}`
            }
            photo={photo}
            index={index}
          />
        )
      )}
    </div>
  );
}

/* =========================================================
   사진 카드
========================================================= */

function PhotoCard({
  photo,
  index,
}) {
  const imageUrl =
    photo?.signed_url ||
    photo?.photo_url ||
    "";

  if (!imageUrl) {
    return (
      <div
        style={{
          aspectRatio: "1 / 1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px",
          border:
            "1px solid #e2e8f0",
          borderRadius: "11px",
          background: "#f8fafc",
          color: "#94a3b8",
          fontSize: "11px",
          fontWeight: "800",
          textAlign: "center",
        }}
      >
        사진을 불러올 수 없습니다.
      </div>
    );
  }

  return (
    <a
      href={imageUrl}
      target="_blank"
      rel="noreferrer"
      style={{
        position: "relative",
        display: "block",
        aspectRatio: "1 / 1",
        overflow: "hidden",
        borderRadius: "11px",
        border:
          "1px solid #e2e8f0",
        background: "#f8fafc",
      }}
    >
      <img
        src={imageUrl}
        alt={`시공사진 ${index + 1}`}
        loading="lazy"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "6px",
          bottom: "6px",
          padding: "3px 6px",
          borderRadius: "999px",
          background:
            "rgba(15, 23, 42, 0.72)",
          color: "#ffffff",
          fontSize: "10px",
          fontWeight: "900",
        }}
      >
        사진 {index + 1}
      </div>
    </a>
  );
           }
