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

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const accessToken =
        sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error(
          "관리자 로그인이 필요합니다."
        );
      }

      const response = await fetch(
        `/api/admin/site-work-report-review?siteId=${encodeURIComponent(
          siteId
        )}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        }
      );

      let result = null;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.error ||
            "완료보고 검수자료를 불러오지 못했습니다."
        );
      }

      setData(result);
    } catch (error) {
      console.error(
        "완료보고 검수자료 조회 오류:",
        error
      );

      setData(null);

      setErrorMessage(
        error?.message ||
          "완료보고 검수자료를 불러오지 못했습니다."
      );
    } finally {
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
        title={`💰 현장 경비 · ${expenses.length}건`}
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
                gap: "8px",
              }}
            >
              {expenses.map(
                (expense, index) => (
                  <div
                    key={
                      expense.id ||
                      index
                    }
                    style={{
                      display: "flex",
                      alignItems:
                        "flex-start",
                      justifyContent:
                        "space-between",
                      gap: "12px",
                      padding: "11px",
                      borderRadius: "9px",
                      background: "#f8fafc",
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
                          fontSize: "12px",
                          fontWeight: "900",
                        }}
                      >
                        {getExpenseLabel(
                          expense.expense_type
                        )}
                      </div>

                      {expense.description && (
                        <div
                          style={{
                            marginTop:
                              "3px",
                            color:
                              "#64748b",
                            fontSize:
                              "11px",
                            lineHeight:
                              1.5,
                          }}
                        >
                          {
                            expense.description
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
                      }}
                    >
                      {formatMoney(
                        expense.amount
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "12px",
                marginTop: "10px",
                padding: "12px",
                borderRadius: "10px",
                background: "#111827",
                color: "#ffffff",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "800",
                }}
              >
                경비 합계
              </div>

              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "900",
                }}
              >
                {formatMoney(
                  totalExpense
                )}
              </div>
            </div>
          </>
        )}
      </ReviewBlock>

      {/* =====================================================
          기존 검수결과

          pending에서는 아직 없음.
          approved/rejected 상태가 생긴 후 표시.
      ===================================================== */}

      {reviewStatus !== "pending" && (
        <ReviewBlock title="📝 관리자 검수 결과">
          <ReviewRow
            label="상태"
            value={review.label}
          />

          {data?.review
            ?.approvedAmount !== null &&
            data?.review
              ?.approvedAmount !==
              undefined && (
              <ReviewRow
                label="실제금액"
                value={formatMoney(
                  data.review
                    .approvedAmount
                )}
              />
            )}

          {data?.review
            ?.reviewedAt && (
            <ReviewRow
              label="검수일"
              value={formatDateTime(
                data.review.reviewedAt
              )}
            />
          )}

          {data?.review?.memo && (
            <div
              style={{
                marginTop: "9px",
                padding: "12px",
                borderRadius: "10px",
                background:
                  review.background,
                color: review.color,
                fontSize: "12px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {data.review.memo}
            </div>
          )}
        </ReviewBlock>
      )}

      {/* =====================================================
          다음 단계 안내

          가짜 승인 버튼은 만들지 않는다.
          실제 승인 API를 만든 뒤 버튼을 연결한다.
      ===================================================== */}

      {reviewStatus === "pending" && (
        <div
          style={{
            marginTop: "14px",
            padding: "13px",
            borderRadius: "10px",
            border: "1px dashed #cbd5e1",
            background: "#f8fafc",
            color: "#64748b",
            fontSize: "11px",
            lineHeight: 1.7,
            textAlign: "center",
          }}
        >
          검수자료 확인 단계입니다.
          <br />
          다음 단계에서 실제 시공금액 입력,
          보완 요청, 검수 승인 기능을 연결합니다.
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
        marginTop: "14px",
        paddingTop: "14px",
        borderTop: "1px solid #e2e8f0",
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
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        marginTop: "7px",
        fontSize: "12px",
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          width: "62px",
          flex: "0 0 62px",
          color: "#94a3b8",
          fontWeight: "800",
        }}
      >
        {label}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          color: "#334155",
          fontWeight: "800",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   빈 데이터
========================================================= */

function EmptyText({
  children,
}) {
  return (
    <div
      style={{
        padding: "13px",
        borderRadius: "9px",
        background: "#f8fafc",
        color: "#94a3b8",
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
   사진
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
        gap: "8px",
      }}
    >
      {photos.map(
        (photo, index) => {
          const imageUrl =
            photo?.signed_url ||
            photo?.photo_url ||
            "";

          if (!imageUrl) {
            return null;
          }

          return (
            <a
              key={
                photo.id ||
                `${imageUrl}-${index}`
              }
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "block",
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1 / 1",
                  overflow: "hidden",
                  borderRadius: "10px",
                  border:
                    "1px solid #e2e8f0",
                  background: "#f1f5f9",
                }}
              >
                <img
                  src={imageUrl}
                  alt={
                    photo.photo_type ===
                    "before"
                      ? `시공 전 사진 ${
                          index + 1
                        }`
                      : `시공 완료 사진 ${
                          index + 1
                        }`
                  }
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>

              {photo.description && (
                <div
                  style={{
                    marginTop: "4px",
                    color: "#64748b",
                    fontSize: "10px",
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                  }}
                >
                  {photo.description}
                </div>
              )}
            </a>
          );
        }
      )}
    </div>
  );
            }
