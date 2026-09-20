"use client";

import { useEffect, useState } from "react";

function getTodayString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(
    now.getMonth() + 1,
  ).padStart(2, "0");
  const day = String(
    now.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function makeDateTime(
  date,
  time,
) {
  if (!date || !time) {
    return null;
  }

  return `${date}T${time}:00`;
}

const initialForm = {
  date: "",
  start_time: "09:00",
  end_time: "18:00",

  customer_name: "",
  customer_phone: "",

  site_name: "",
  address: "",
  address_detail: "",
  region: "",

  work_type: "",
  work_description: "",

  contract_amount: "",
  deposit_amount: "",

  source: "phone",

  memo: "",
};

export default function SiteRegisterModal({
  open,
  onClose,
  createSite,
  loading = false,
}) {
  const [form, setForm] =
    useState(initialForm);

  const [localMessage, setLocalMessage] =
    useState("");

  /* =========================================================
     팝업 열릴 때 기본 날짜 설정
  ========================================================= */

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm({
      ...initialForm,
      date: getTodayString(),
    });

    setLocalMessage("");
  }, [open]);

  /* =========================================================
     입력 변경
  ========================================================= */

  function updateField(
    field,
    value,
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  /* =========================================================
     저장
  ========================================================= */

  async function handleSubmit(
    event,
  ) {
    event.preventDefault();

    setLocalMessage("");

    if (!form.date) {
      setLocalMessage(
        "❌ 시공 날짜를 선택해주세요.",
      );
      return;
    }

    if (!form.start_time) {
      setLocalMessage(
        "❌ 시작 시간을 입력해주세요.",
      );
      return;
    }

    if (!form.customer_name.trim()) {
      setLocalMessage(
        "❌ 고객명을 입력해주세요.",
      );
      return;
    }

    if (!form.address.trim()) {
      setLocalMessage(
        "❌ 현장 주소를 입력해주세요.",
      );
      return;
    }

    const scheduleStart =
      makeDateTime(
        form.date,
        form.start_time,
      );

    const scheduleEnd =
      form.end_time
        ? makeDateTime(
            form.date,
            form.end_time,
          )
        : null;

    if (
      scheduleEnd &&
      new Date(scheduleEnd) <
        new Date(scheduleStart)
    ) {
      setLocalMessage(
        "❌ 종료 시간은 시작 시간보다 늦어야 합니다.",
      );
      return;
    }

    const result =
      await createSite({
        customer_name:
          form.customer_name,

        customer_phone:
          form.customer_phone,

        site_name:
          form.site_name,

        address:
          form.address,

        address_detail:
          form.address_detail,

        region:
          form.region,

        schedule_start:
          scheduleStart,

        schedule_end:
          scheduleEnd,

        work_type:
          form.work_type,

        work_description:
          form.work_description,

        contract_amount:
          form.contract_amount,

        deposit_amount:
          form.deposit_amount,

        source:
          form.source,

        memo:
          form.memo,
      });

    if (!result?.success) {
      setLocalMessage(
        `❌ ${
          result?.error ||
          "현장 등록에 실패했습니다."
        }`,
      );
      return;
    }

    setLocalMessage(
      "✅ 현장 일정이 등록되었습니다.",
    );

    setTimeout(() => {
      onClose();
    }, 350);
  }

  if (!open) {
    return null;
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border:
      "1px solid #cbd5e1",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#111827",
    fontSize: "14px",
    outline: "none",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "6px",
    color: "#334155",
    fontSize: "13px",
    fontWeight: "700",
  };

  const fieldStyle = {
    marginBottom: "14px",
  };

  return (
    <div
      onClick={() => {
        if (!loading) {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,

        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",

        padding: "24px 12px",

        background:
          "rgba(15, 23, 42, 0.55)",

        overflowY: "auto",
      }}
    >
      <div
        onClick={(event) =>
          event.stopPropagation()
        }
        style={{
          width: "100%",
          maxWidth: "620px",

          background: "#ffffff",

          borderRadius: "16px",

          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",

          overflow: "hidden",
        }}
      >
        {/* 제목 */}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",

            padding: "16px",

            borderBottom:
              "1px solid #e5e7eb",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: "800",
                color: "#111827",
              }}
            >
              새 현장 / 일정 추가
            </div>

            <div
              style={{
                marginTop: "4px",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              전화로 확정된 현장도 바로
              등록할 수 있습니다.
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            style={{
              border: "none",
              background:
                "transparent",
              fontSize: "25px",
              lineHeight: 1,
              cursor: loading
                ? "default"
                : "pointer",
              color: "#64748b",
            }}
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            padding: "16px",
          }}
        >
          {/* 일정 */}

          <div
            style={{
              marginBottom: "16px",
              padding: "14px",
              border:
                "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#f8fafc",
            }}
          >
            <div
              style={{
                marginBottom: "12px",
                fontSize: "15px",
                fontWeight: "800",
              }}
            >
              📅 시공 일정
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                시공 날짜 *
              </label>

              <input
                type="date"
                value={form.date}
                onChange={(event) =>
                  updateField(
                    "date",
                    event.target.value,
                  )
                }
                style={inputStyle}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "8px",
              }}
            >
              <div style={fieldStyle}>
                <label style={labelStyle}>
                  시작 시간 *
                </label>

                <input
                  type="time"
                  value={
                    form.start_time
                  }
                  onChange={(event) =>
                    updateField(
                      "start_time",
                      event.target.value,
                    )
                  }
                  style={inputStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  종료 시간
                </label>

                <input
                  type="time"
                  value={
                    form.end_time
                  }
                  onChange={(event) =>
                    updateField(
                      "end_time",
                      event.target.value,
                    )
                  }
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* 고객 */}

          <div
            style={{
              marginBottom: "16px",
              padding: "14px",
              border:
                "1px solid #e2e8f0",
              borderRadius: "12px",
            }}
          >
            <div
              style={{
                marginBottom: "12px",
                fontSize: "15px",
                fontWeight: "800",
              }}
            >
              👤 고객 / 현장
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "8px",
              }}
            >
              <div style={fieldStyle}>
                <label style={labelStyle}>
                  고객명 *
                </label>

                <input
                  type="text"
                  value={
                    form.customer_name
                  }
                  onChange={(event) =>
                    updateField(
                      "customer_name",
                      event.target.value,
                    )
                  }
                  placeholder="홍길동"
                  style={inputStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  전화번호
                </label>

                <input
                  type="tel"
                  value={
                    form.customer_phone
                  }
                  onChange={(event) =>
                    updateField(
                      "customer_phone",
                      event.target.value,
                    )
                  }
                  placeholder="010-0000-0000"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                현장명
              </label>

              <input
                type="text"
                value={form.site_name}
                onChange={(event) =>
                  updateField(
                    "site_name",
                    event.target.value,
                  )
                }
                placeholder="예: 검단 ○○아파트"
                style={inputStyle}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                주소 *
              </label>

              <input
                type="text"
                value={form.address}
                onChange={(event) =>
                  updateField(
                    "address",
                    event.target.value,
                  )
                }
                placeholder="현장 주소"
                style={inputStyle}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "8px",
              }}
            >
              <div style={fieldStyle}>
                <label style={labelStyle}>
                  상세주소
                </label>

                <input
                  type="text"
                  value={
                    form.address_detail
                  }
                  onChange={(event) =>
                    updateField(
                      "address_detail",
                      event.target.value,
                    )
                  }
                  placeholder="101동 1001호"
                  style={inputStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  지역
                </label>

                <input
                  type="text"
                  value={form.region}
                  onChange={(event) =>
                    updateField(
                      "region",
                      event.target.value,
                    )
                  }
                  placeholder="예: 인천 서구"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* 작업 */}

          <div
            style={{
              marginBottom: "16px",
              padding: "14px",
              border:
                "1px solid #e2e8f0",
              borderRadius: "12px",
            }}
          >
            <div
              style={{
                marginBottom: "12px",
                fontSize: "15px",
                fontWeight: "800",
              }}
            >
              🛠️ 시공 내용
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                시공 종류
              </label>

              <input
                type="text"
                value={form.work_type}
                onChange={(event) =>
                  updateField(
                    "work_type",
                    event.target.value,
                  )
                }
                placeholder="예: 싱크대 / 방문 / 문틀"
                style={inputStyle}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                상세 작업내용
              </label>

              <textarea
                value={
                  form.work_description
                }
                onChange={(event) =>
                  updateField(
                    "work_description",
                    event.target.value,
                  )
                }
                placeholder="예: 싱크대 상하부장, 방문 3개, 문틀 3개"
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                }}
              />
            </div>
          </div>

          {/* 금액 */}

          <div
            style={{
              marginBottom: "16px",
              padding: "14px",
              border:
                "1px solid #e2e8f0",
              borderRadius: "12px",
            }}
          >
            <div
              style={{
                marginBottom: "12px",
                fontSize: "15px",
                fontWeight: "800",
              }}
            >
              💰 계약 정보
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "8px",
              }}
            >
              <div style={fieldStyle}>
                <label style={labelStyle}>
                  계약금액
                </label>

                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={
                    form.contract_amount
                  }
                  onChange={(event) =>
                    updateField(
                      "contract_amount",
                      event.target.value,
                    )
                  }
                  placeholder="1000000"
                  style={inputStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  계약금 / 선금
                </label>

                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={
                    form.deposit_amount
                  }
                  onChange={(event) =>
                    updateField(
                      "deposit_amount",
                      event.target.value,
                    )
                  }
                  placeholder="300000"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                접수 경로
              </label>

              <select
                value={form.source}
                onChange={(event) =>
                  updateField(
                    "source",
                    event.target.value,
                  )
                }
                style={inputStyle}
              >
                <option value="phone">
                  전화
                </option>

                <option value="ai_estimate">
                  AI 견적
                </option>

                <option value="lead">
                  고객 상담
                </option>

                <option value="direct">
                  직접 등록
                </option>

                <option value="other">
                  기타
                </option>
              </select>
            </div>
          </div>

          {/* 메모 */}

          <div style={fieldStyle}>
            <label style={labelStyle}>
              현장 메모
            </label>

            <textarea
              value={form.memo}
              onChange={(event) =>
                updateField(
                  "memo",
                  event.target.value,
                )
              }
              placeholder="예: 지하 2층 주차, 오전 9시 고객 통화 후 입장"
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
              }}
            />
          </div>

          {localMessage && (
            <div
              style={{
                marginBottom: "14px",
                padding: "10px 12px",

                borderRadius: "9px",

                background:
                  localMessage.startsWith(
                    "✅",
                  )
                    ? "#f0fdf4"
                    : "#fef2f2",

                color:
                  localMessage.startsWith(
                    "✅",
                  )
                    ? "#166534"
                    : "#b91c1c",

                fontSize: "13px",
                fontWeight: "700",
                whiteSpace: "pre-wrap",
              }}
            >
              {localMessage}
            </div>
          )}

          {/* 버튼 */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 2fr",
              gap: "8px",
            }}
          >
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              style={{
                border:
                  "1px solid #cbd5e1",

                borderRadius: "10px",

                padding: "12px",

                background:
                  "#ffffff",

                color: "#334155",

                fontWeight: "700",

                cursor: loading
                  ? "default"
                  : "pointer",
              }}
            >
              취소
            </button>

            <button
              type="submit"
              disabled={loading}
              style={{
                border: "none",

                borderRadius: "10px",

                padding: "12px",

                background: loading
                  ? "#94a3b8"
                  : "#111827",

                color: "#ffffff",

                fontWeight: "800",

                cursor: loading
                  ? "default"
                  : "pointer",
              }}
            >
              {loading
                ? "등록 중..."
                : "현장 일정 등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
