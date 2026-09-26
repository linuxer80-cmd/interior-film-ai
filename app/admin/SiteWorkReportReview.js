"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import ApprovedWorkAiRegister from "./ApprovedWorkAiRegister";

export default function SiteWorkReportReview({
  siteId,
  onReportStateChange,
}) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState(null);

  const [approvedAmount, setApprovedAmount] = useState("");
  const [reviewMemo, setReviewMemo] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!siteId) {
      setLoading(false);
      setData(null);

      if (typeof onReportStateChange === "function") {
        onReportStateChange({
          hasReport: false,
          reviewStatus: null,
        });
      }

      return;
    }

    setApprovedAmount("");
    setReviewMemo("");
    setActionMessage("");
    setActionError("");

    loadReview();
  }, [siteId]);

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
            sessionError.message || "알 수 없는 오류"
          }`
        );
      }

      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error(
          "관리자 로그인 세션이 없습니다. 다시 로그인해주세요."
        );
      }

      const apiUrl =
        `/api/admin/site-work-report-review?siteId=${encodeURIComponent(
          siteId
        )}`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });

      const responseText = await response.text();

      let result = null;

      if (responseText) {
        try {
          result = JSON.parse(responseText);
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

      /*
       * 부모에게 시공자 완료보고 존재 여부와
       * 현재 검수상태를 전달합니다.
       */
      if (typeof onReportStateChange === "function") {
        onReportStateChange({
          hasReport: Boolean(
            result?.hasReport && result?.report
          ),
          reviewStatus:
            result?.review?.status ||
            result?.report?.review_status ||
            null,
        });
      }

      if (
        result?.review?.approvedAmount !== null &&
        result?.review?.approvedAmount !== undefined
      ) {
        setApprovedAmount(
          formatNumberInput(result.review.approvedAmount)
        );
      }

      if (result?.review?.memo) {
        setReviewMemo(result.review.memo);
      }
    } catch (error) {
      console.error(
        "완료보고 검수자료 조회 오류:",
        error
      );

      setData(null);

      if (error?.name === "AbortError") {
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

  async function submitReviewAction(action) {
    if (actionLoading) return;

    setActionMessage("");
    setActionError("");

    const numericAmount = String(approvedAmount || "")
      .replace(/,/g, "")
      .replace(/원/g, "")
      .trim();

    if (action === "approve" && numericAmount === "") {
      setActionError("실제 시공금액을 입력해주세요.");
      return;
    }

    if (
      action === "approve" &&
      (!Number.isFinite(Number(numericAmount)) ||
        Number(numericAmount) < 0)
    ) {
      setActionError(
        "실제 시공금액을 올바르게 입력해주세요."
      );
      return;
    }

    if (
      action === "reject" &&
      !reviewMemo.trim()
    ) {
      setActionError(
        "보완 요청 사유를 입력해주세요."
      );
      return;
    }

    if (action === "approve") {
      const confirmed = window.confirm(
        `실제 시공금액 ${formatMoney(
          numericAmount
        )}으로 검수 승인하시겠습니까?\n\n아직 AI 견적자료에는 등록되지 않습니다.`
      );

      if (!confirmed) return;
    }

    if (action === "reject") {
      const confirmed = window.confirm(
        "이 완료보고를 보완 요청하시겠습니까?\n\n시공자는 보완 사유를 확인한 후 다시 제출할 수 있습니다."
      );

      if (!confirmed) return;
    }

    setActionLoading(true);

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
            sessionError.message || "알 수 없는 오류"
          }`
        );
      }

      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error(
          "관리자 로그인 세션이 없습니다. 다시 로그인해주세요."
        );
      }

      const response = await fetch(
        "/api/admin/site-work-report-review/action",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            siteId,
            action,
            approvedAmount:
              action === "approve"
                ? Number(numericAmount)
                : null,
            reviewMemo: reviewMemo.trim(),
          }),
        }
      );

      const responseText = await response.text();

      let result = null;

      if (responseText) {
        try {
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.error(
            "검수 처리 API JSON 변환 오류:",
            parseError,
            responseText
          );

          throw new Error(
            `서버 응답 형식 오류 (HTTP ${response.status})`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result?.error ||
            `검수 처리 실패 (HTTP ${response.status})`
        );
      }

      if (!result?.success) {
        throw new Error(
          result?.error ||
            "검수 결과를 저장하지 못했습니다."
        );
      }

      setActionMessage(
        result?.message ||
          (action === "approve"
            ? "검수 승인이 저장되었습니다."
            : "보완 요청이 저장되었습니다.")
      );

      await loadReview();
    } catch (error) {
      console.error(
        "완료보고 검수 처리 오류:",
        error
      );

      if (error?.name === "AbortError") {
        setActionError(
          "검수 처리가 15초 이상 걸려 중단되었습니다. 다시 확인해주세요."
        );
      } else {
        setActionError(
          error?.message ||
            "검수 처리 중 오류가 발생했습니다."
        );
      }
    } finally {
      clearTimeout(timeoutId);
      setActionLoading(false);
    }
  }

  function handleAmountChange(event) {
    const raw = event.target.value || "";
    const digits = raw.replace(/[^\d]/g, "");

    if (!digits) {
      setApprovedAmount("");
      return;
    }

    setApprovedAmount(
      new Intl.NumberFormat("ko-KR").format(
        Number(digits)
      )
    );

    if (actionError) {
      setActionError("");
    }
  }

  function formatNumberInput(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "";
    }

    const number = Number(
      String(value).replace(/,/g, "")
    );

    if (!Number.isFinite(number)) {
      return "";
    }

    return new Intl.NumberFormat("ko-KR").format(
      number
    );
  }

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function formatMoney(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "0원";
    }

    const number = Number(
      String(value).replace(/,/g, "")
    );

    if (!Number.isFinite(number)) {
      return "0원";
    }

    return `${new Intl.NumberFormat(
      "ko-KR"
    ).format(number)}원`;
  }

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

    return new Intl.NumberFormat("ko-KR", {
      maximumFractionDigits: 2,
    }).format(number);
  }

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
      default:
        return "기타";
    }
  }

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

  if (loading) {
    return (
      <section style={sectionStyle}>
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

  if (errorMessage) {
    return (
      <section
        style={{
          ...sectionStyle,
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
          style={blackButtonStyle}
        >
          다시 불러오기
        </button>
      </section>
    );
  }

  if (!data?.hasReport || !data?.report) {
    return null;
  }

  const report = data.report;
  const worker = data.worker;

  const materials = Array.isArray(data.materials)
    ? data.materials
    : [];

  const expenses = Array.isArray(data.expenses)
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

  const review = getReviewInfo(reviewStatus);

  const totalExpense = expenses.reduce(
    (sum, item) => {
      const amount = Number(item?.amount);

      return Number.isFinite(amount)
        ? sum + amount
        : sum;
    },
    0
  );

  return (
    <section
      style={{
        ...sectionStyle,
        border: `1px solid ${review.border}`,
      }}
    >
      <div style={headerStyle}>
        <div>
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

      {reviewStatus === "pending" && (
        <NoticeBox
          background="#fffbeb"
          color="#92400e"
        >
          시공자가 완료보고를 제출했습니다.
          <br />
          시공 내용, 사진, 실제 사용 자재와
          경비를 확인해주세요.
          <br />
          아직 AI 견적자료로 등록되지 않았습니다.
        </NoticeBox>
      )}

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

      <ReviewBlock title="🛠️ 실제 시공 내용">
        {report.work_region && (
          <ReviewRow
            label="시공지역"
            value={report.work_region}
          />
        )}

        <div style={contentBoxStyle}>
          {report.work_summary ||
            "등록된 시공 내용이 없습니다."}
        </div>

        {report.memo && (
          <div style={contentBoxStyle}>
            <SmallLabel>시공자 메모</SmallLabel>
            <div
              style={{
                marginTop: "5px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {report.memo}
            </div>
          </div>
        )}
      </ReviewBlock>

      <ReviewBlock
        title={`📷 시공 전 사진 · ${beforePhotos.length}장`}
      >
        {beforePhotos.length === 0 ? (
          <EmptyText>
            등록된 시공 전 사진이 없습니다.
          </EmptyText>
        ) : (
          <PhotoGrid photos={beforePhotos} />
        )}
      </ReviewBlock>

      <ReviewBlock
        title={`📸 시공 완료 사진 · ${afterPhotos.length}장`}
      >
        {afterPhotos.length === 0 ? (
          <EmptyText>
            등록된 완료 사진이 없습니다.
          </EmptyText>
        ) : (
          <PhotoGrid photos={afterPhotos} />
        )}
      </ReviewBlock>

      <ReviewBlock
        title={`📦 실제 사용 자재 · ${materials.length}건`}
      >
        {materials.length === 0 ? (
          <EmptyText>
            등록된 실제 사용 자재가 없습니다.
          </EmptyText>
        ) : (
          <div style={{ display: "grid", gap: "9px" }}>
            {materials.map((material, index) => {
              const quantityText = [
                formatQuantity(material.quantity),
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
                  style={itemCardStyle}
                >
                  <div style={headerStyle}>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {material.brand && (
                        <SmallLabel>
                          {material.brand}
                        </SmallLabel>
                      )}

                      <div
                        style={{
                          marginTop: "3px",
                          color: "#111827",
                          fontSize: "13px",
                          fontWeight: "900",
                          wordBreak: "break-word",
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
                              marginTop: "3px",
                              color: "#64748b",
                              fontSize: "11px",
                            }}
                          >
                            {material.product_name}
                          </div>
                        )}
                    </div>

                    <strong
                      style={{
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {quantityText}
                    </strong>
                  </div>

                  {material.memo && (
                    <div
                      style={{
                        marginTop: "8px",
                        color: "#64748b",
                        fontSize: "11px",
                      }}
                    >
                      메모 {material.memo}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ReviewBlock>
      <ReviewBlock
        title={`💳 현장 경비 · ${expenses.length}건`}
      >
        {expenses.length === 0 ? (
          <EmptyText>
            등록된 현장 경비가 없습니다.
          </EmptyText>
        ) : (
          <>
            <div style={{ display: "grid", gap: "9px" }}>
              {expenses.map((expense, index) => (
                <div
                  key={
                    expense.id ||
                    `${expense.expense_type}-${index}`
                  }
                  style={itemCardStyle}
                >
                  <div style={headerStyle}>
                    <strong
                      style={{
                        fontSize: "12px",
                      }}
                    >
                      {getExpenseLabel(
                        expense.expense_type
                      )}
                    </strong>

                    <strong>
                      {formatMoney(expense.amount)}
                    </strong>
                  </div>

                  {expense.description && (
                    <div
                      style={{
                        marginTop: "7px",
                        color: "#64748b",
                        fontSize: "11px",
                        whiteSpace: "pre-wrap",
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
                      }}
                    >
                      {expense.expense_date}
                    </div>
                  )}
                </div>
              ))}
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

              <strong
                style={{
                  marginLeft: "8px",
                  fontSize: "15px",
                }}
              >
                {formatMoney(totalExpense)}
              </strong>
            </div>
          </>
        )}
      </ReviewBlock>

      {reviewStatus === "pending" && (
        <div
          style={{
            marginTop: "18px",
            padding: "15px",
            borderRadius: "12px",
            background: "#f8fafc",
            border: "1px solid #cbd5e1",
          }}
        >
          <div
            style={{
              color: "#111827",
              fontSize: "14px",
              fontWeight: "900",
            }}
          >
            🔎 관리자 검수
          </div>

          <div
            style={{
              marginTop: "6px",
              color: "#64748b",
              fontSize: "11px",
              lineHeight: 1.6,
            }}
          >
            시공 내용과 사진을 확인한 후 실제
            시공금액을 입력하고 승인해주세요.
          </div>

          <div style={{ marginTop: "16px" }}>
            <label style={labelStyle}>
              실제 시공금액 *
            </label>

            <div style={{ position: "relative" }}>
              <input
                type="text"
                inputMode="numeric"
                value={approvedAmount}
                onChange={handleAmountChange}
                disabled={actionLoading}
                placeholder="예: 500,000"
                style={{
                  ...inputStyle,
                  padding:
                    "12px 42px 12px 12px",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: "900",
                }}
              >
                원
              </div>
            </div>

            <div style={hintStyle}>
              고객 계약금액이 아니라 실제 시공
              결과를 기준으로 확정한 금액을
              입력합니다.
            </div>
          </div>

          <div style={{ marginTop: "14px" }}>
            <label style={labelStyle}>
              검수 메모 / 보완 요청 사유
            </label>

            <textarea
              value={reviewMemo}
              onChange={(event) => {
                setReviewMemo(event.target.value);

                if (actionError) {
                  setActionError("");
                }
              }}
              disabled={actionLoading}
              placeholder="승인 메모 또는 시공자에게 전달할 보완 내용을 입력하세요."
              rows={4}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />

            <div style={hintStyle}>
              보완 요청을 할 때는 사유 입력이
              필수입니다.
            </div>
          </div>

          {actionError && (
            <MessageBox error>
              ❌ {actionError}
            </MessageBox>
          )}

          {actionMessage && (
            <MessageBox>
              ✅ {actionMessage}
            </MessageBox>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "9px",
              marginTop: "15px",
            }}
          >
            <button
              type="button"
              disabled={actionLoading}
              onClick={() =>
                submitReviewAction("reject")
              }
              style={{
                width: "100%",
                border: "1px solid #fecaca",
                borderRadius: "10px",
                background: actionLoading
                  ? "#f1f5f9"
                  : "#fef2f2",
                color: actionLoading
                  ? "#94a3b8"
                  : "#b91c1c",
                padding: "12px 8px",
                fontSize: "12px",
                fontWeight: "900",
              }}
            >
              {actionLoading
                ? "처리 중..."
                : "🔴 보완 요청"}
            </button>

            <button
              type="button"
              disabled={actionLoading}
              onClick={() =>
                submitReviewAction("approve")
              }
              style={{
                width: "100%",
                border: "none",
                borderRadius: "10px",
                background: actionLoading
                  ? "#94a3b8"
                  : "#16a34a",
                color: "#ffffff",
                padding: "12px 8px",
                fontSize: "12px",
                fontWeight: "900",
              }}
            >
              {actionLoading
                ? "처리 중..."
                : "🟢 검수 승인"}
            </button>
          </div>

          <NoticeBox
            background="#fffbeb"
            color="#92400e"
          >
            ⚠️ 이번 단계의 검수 승인은
            완료보고 상태와 실제 시공금액만
            저장합니다.
            <br />
            아직 완료사진을 AI 유사견적용 시공
            DB에 등록하지 않습니다.
          </NoticeBox>
        </div>
      )}

      {reviewStatus === "approved" && (
        <>
          <NoticeBox
            background="#f0fdf4"
            color="#166534"
          >
            <strong>
              🟢 관리자 검수 승인 완료
            </strong>

            {data?.review?.approvedAmount !==
              null &&
              data?.review?.approvedAmount !==
                undefined && (
                <div style={{ marginTop: "9px" }}>
                  실제 시공금액{" "}
                  <strong>
                    {formatMoney(
                      data.review.approvedAmount
                    )}
                  </strong>
                </div>
              )}

            {data?.review?.memo && (
              <div
                style={{
                  marginTop: "9px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {data.review.memo}
              </div>
            )}

            {data?.review?.reviewedAt && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "10px",
                }}
              >
                검수일{" "}
                {formatDateTime(
                  data.review.reviewedAt
                )}
              </div>
            )}

            <div
              style={{
                marginTop: "11px",
                paddingTop: "10px",
                borderTop:
                  "1px solid #bbf7d0",
                fontSize: "10px",
                color: "#64748b",
              }}
            >
              관리자 검수 승인이 완료되었습니다.
              <br />
              아래에서 AI 견적자료 등록을 진행할 수
              있습니다.
            </div>
          </NoticeBox>

          <ApprovedWorkAiRegister
            siteId={siteId}
            report={report}
            materials={materials}
            beforePhotos={beforePhotos}
            afterPhotos={afterPhotos}
            onRegistered={loadReview}
          />
        </>
      )}

      {reviewStatus === "rejected" && (
        <NoticeBox
          background="#fef2f2"
          color="#b91c1c"
        >
          <strong>
            🔴 관리자 보완 요청
          </strong>

          <div
            style={{
              marginTop: "9px",
              whiteSpace: "pre-wrap",
            }}
          >
            {data?.review?.memo ||
              "보완 요청 사유가 등록되지 않았습니다."}
          </div>

          {data?.review?.reviewedAt && (
            <div
              style={{
                marginTop: "8px",
                fontSize: "10px",
              }}
            >
              검수일{" "}
              {formatDateTime(
                data.review.reviewedAt
              )}
            </div>
          )}

          <div
            style={{
              marginTop: "11px",
              paddingTop: "10px",
              borderTop:
                "1px solid #fecaca",
              fontSize: "10px",
            }}
          >
            시공자가 보완 내용을 확인한 뒤
            완료보고를 다시 제출하면 검수 상태가
            다시 검수 대기로 변경됩니다.
          </div>
        </NoticeBox>
      )}
    </section>
  );
}

const sectionStyle = {
  marginTop: "14px",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  padding: "18px",
};

const headerStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "10px",
};

const itemCardStyle = {
  padding: "12px",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  background: "#f8fafc",
};

const contentBoxStyle = {
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
};

const labelStyle = {
  display: "block",
  color: "#334155",
  fontSize: "12px",
  fontWeight: "900",
  marginBottom: "7px",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#111827",
  padding: "12px",
  fontSize: "13px",
  outline: "none",
};

const hintStyle = {
  marginTop: "5px",
  color: "#94a3b8",
  fontSize: "10px",
  lineHeight: 1.5,
};

const blackButtonStyle = {
  width: "100%",
  marginTop: "12px",
  border: "none",
  borderRadius: "10px",
  background: "#111827",
  color: "#ffffff",
  padding: "11px",
  fontSize: "12px",
  fontWeight: "900",
};

function ReviewBlock({ title, children }) {
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

function ReviewRow({ label, value }) {
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

function SmallLabel({ children }) {
  return (
    <div
      style={{
        color: "#64748b",
        fontSize: "10px",
        fontWeight: "800",
      }}
    >
      {children}
    </div>
  );
}

function EmptyText({ children }) {
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

function NoticeBox({
  children,
  background,
  color,
}) {
  return (
    <div
      style={{
        marginTop: "14px",
        padding: "13px",
        borderRadius: "10px",
        background,
        color,
        fontSize: "12px",
        fontWeight: "800",
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}

function MessageBox({
  children,
  error = false,
}) {
  return (
    <div
      style={{
        marginTop: "12px",
        padding: "11px",
        borderRadius: "9px",
        background: error
          ? "#fef2f2"
          : "#f0fdf4",
        border: error
          ? "1px solid #fecaca"
          : "1px solid #bbf7d0",
        color: error
          ? "#b91c1c"
          : "#166534",
        fontSize: "11px",
        fontWeight: "800",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

function PhotoGrid({ photos }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(2, minmax(0, 1fr))",
        gap: "9px",
      }}
    >
      {photos.map((photo, index) => (
        <PhotoCard
          key={
            photo.id ||
            `${photo.storage_path}-${index}`
          }
          photo={photo}
          index={index}
        />
      ))}
    </div>
  );
}

function PhotoCard({ photo, index }) {
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
            "rgba(15,23,42,0.72)",
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
