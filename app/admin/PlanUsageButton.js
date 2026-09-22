"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

function formatNumber(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return new Intl.NumberFormat("ko-KR").format(
    Math.round(number),
  );
}

function formatStorage(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "0 MB";
  }

  if (number >= 1024) {
    const gb = number / 1024;

    return `${gb.toFixed(
      gb >= 10 ? 0 : 1,
    )} GB`;
  }

  return `${Math.round(number)} MB`;
}

function getPlanLabel(planCode, planName) {
  const code = String(
    planCode || "",
  ).toLowerCase();

  if (code === "trial") {
    return "TRIAL";
  }

  if (code === "basic") {
    return "BASIC";
  }

  if (code === "pro") {
    return "PRO";
  }

  if (code === "business") {
    return "BUSINESS";
  }

  return (
    String(planName || planCode || "PLAN")
      .trim()
      .toUpperCase()
  );
}

function getUsageStatus(used, limit) {
  const usedNumber = Number(used || 0);
  const limitNumber = Number(limit || 0);

  if (limitNumber <= 0) {
    return {
      percent: 0,
      warning: false,
      exhausted: false,
    };
  }

  const percent = Math.min(
    100,
    Math.max(
      0,
      (usedNumber / limitNumber) * 100,
    ),
  );

  return {
    percent,
    warning: percent >= 80,
    exhausted: usedNumber >= limitNumber,
  };
}

function UsageRow({
  label,
  used,
  limit,
  remaining,
  storage = false,
}) {
  const limitNumber = Number(limit || 0);

  const unlimited =
    limitNumber <= 0;

  const status =
    getUsageStatus(
      used,
      limit,
    );

  let remainingText = "";

  if (unlimited) {
    remainingText = "무제한";
  } else if (storage) {
    remainingText =
      `${formatStorage(remaining)} 남음`;
  } else {
    remainingText =
      `${formatNumber(remaining)}회 남음`;
  }

  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom:
          "1px solid #f1f5f9",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "12px",
          marginBottom:
            unlimited ? "0" : "6px",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            color: "#475569",
            fontWeight: "600",
          }}
        >
          {label}
        </span>

        <span
          style={{
            fontSize: "13px",
            fontWeight: "800",
            color:
              status.exhausted
                ? "#dc2626"
                : status.warning
                  ? "#d97706"
                  : "#111827",
            whiteSpace: "nowrap",
          }}
        >
          {remainingText}
        </span>
      </div>

      {!unlimited && (
        <>
          <div
            style={{
              width: "100%",
              height: "5px",
              borderRadius: "999px",
              overflow: "hidden",
              background: "#e2e8f0",
            }}
          >
            <div
              style={{
                width:
                  `${status.percent}%`,
                height: "100%",
                borderRadius:
                  "999px",
                background:
                  status.exhausted
                    ? "#dc2626"
                    : status.warning
                      ? "#f59e0b"
                      : "#2563eb",
                transition:
                  "width 0.2s ease",
              }}
            />
          </div>

          <div
            style={{
              marginTop: "4px",
              fontSize: "11px",
              color: "#94a3b8",
              textAlign: "right",
            }}
          >
            {storage
              ? `${formatStorage(
                  used,
                )} / ${formatStorage(
                  limit,
                )}`
              : `${formatNumber(
                  used,
                )} / ${formatNumber(
                  limit,
                )}`}
          </div>
        </>
      )}
    </div>
  );
}

export default function PlanUsageButton() {
  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    plan,
    setPlan,
  ] = useState(null);

  const [
    error,
    setError,
  ] = useState("");

  const wrapperRef =
    useRef(null);

  async function loadPlanUsage() {
    try {
      setLoading(true);
      setError("");

      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        "get_my_plan_usage",
      );

      if (rpcError) {
        throw rpcError;
      }

      const row =
        Array.isArray(data)
          ? data[0]
          : data;

      if (!row) {
        throw new Error(
          "요금제 정보를 찾을 수 없습니다.",
        );
      }

      setPlan(row);
    } catch (loadError) {
      console.error(
        "요금제 사용량 조회 오류:",
        loadError,
      );

      setError(
        loadError?.message ||
          "요금제 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlanUsage();
  }, []);

  useEffect(() => {
    function handleOutside(event) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(
          event.target,
        )
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener(
        "mousedown",
        handleOutside,
      );

      document.addEventListener(
        "touchstart",
        handleOutside,
      );
    }

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutside,
      );

      document.removeEventListener(
        "touchstart",
        handleOutside,
      );
    };
  }, [open]);

  const planLabel =
    loading
      ? "..."
      : getPlanLabel(
          plan?.plan_code,
          plan?.plan_name,
        );

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen(
            (current) => !current,
          );

          if (!open) {
            loadPlanUsage();
          }
        }}
        style={{
          border:
            "1px solid #cbd5e1",
          borderRadius: "999px",
          padding: "7px 11px",
          background: "#ffffff",
          color: "#111827",
          fontSize: "12px",
          lineHeight: "1",
          fontWeight: "800",
          cursor: "pointer",
          boxShadow:
            "0 1px 2px rgba(15,23,42,0.06)",
          whiteSpace: "nowrap",
        }}
      >
        {planLabel}{" "}
        <span
          style={{
            color: "#64748b",
            fontSize: "10px",
          }}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 1000,

            width:
              "min(330px, calc(100vw - 28px))",

            background: "#ffffff",

            border:
              "1px solid #e2e8f0",

            borderRadius: "16px",

            boxShadow:
              "0 18px 45px rgba(15,23,42,0.18)",

            padding: "16px",
          }}
        >
          {loading ? (
            <div
              style={{
                padding:
                  "18px 4px",
                textAlign:
                  "center",
                color:
                  "#64748b",
                fontSize:
                  "13px",
              }}
            >
              요금제 정보를 불러오는 중...
            </div>
          ) : error ? (
            <div>
              <div
                style={{
                  color:
                    "#b91c1c",
                  fontSize:
                    "13px",
                  lineHeight:
                    "1.5",
                  marginBottom:
                    "12px",
                }}
              >
                {error}
              </div>

              <button
                type="button"
                onClick={
                  loadPlanUsage
                }
                style={{
                  width: "100%",
                  border:
                    "1px solid #cbd5e1",
                  borderRadius:
                    "9px",
                  padding:
                    "9px",
                  background:
                    "#ffffff",
                  fontWeight:
                    "700",
                  cursor:
                    "pointer",
                }}
              >
                다시 불러오기
              </button>
            </div>
          ) : plan ? (
            <>
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "flex-start",
                  justifyContent:
                    "space-between",
                  gap: "12px",
                  paddingBottom:
                    "12px",
                  borderBottom:
                    "1px solid #e2e8f0",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize:
                        "11px",
                      color:
                        "#64748b",
                      fontWeight:
                        "700",
                      marginBottom:
                        "3px",
                    }}
                  >
                    현재 요금제
                  </div>

                  <div
                    style={{
                      fontSize:
                        "20px",
                      fontWeight:
                        "900",
                      color:
                        "#111827",
                    }}
                  >
                    {getPlanLabel(
                      plan.plan_code,
                      plan.plan_name,
                    )}
                  </div>
                </div>

                <div
                  style={{
                    textAlign:
                      "right",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "11px",
                      color:
                        "#64748b",
                      marginBottom:
                        "3px",
                    }}
                  >
                    월 이용료
                  </div>

                  <div
                    style={{
                      fontSize:
                        "15px",
                      fontWeight:
                        "800",
                      color:
                        "#111827",
                    }}
                  >
                    {Number(
                      plan.monthly_price_krw ||
                        0,
                    ) <= 0
                      ? "무료"
                      : `${formatNumber(
                          plan.monthly_price_krw,
                        )}원`}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop:
                    "12px",
                  marginBottom:
                    "3px",
                  fontSize:
                    "12px",
                  fontWeight:
                    "800",
                  color:
                    "#334155",
                }}
              >
                이번 달 사용량
              </div>

              <UsageRow
                label="AI 사진분석"
                used={
                  plan.ai_photo_analysis_used
                }
                limit={
                  plan.ai_photo_analysis_limit
                }
                remaining={
                  plan.ai_photo_analysis_remaining
                }
              />

              <UsageRow
                label="자동견적"
                used={
                  plan.auto_estimate_used
                }
                limit={
                  plan.auto_estimate_limit
                }
                remaining={
                  plan.auto_estimate_remaining
                }
              />

              <UsageRow
                label="유사 이미지 검색"
                used={
                  plan.similar_image_search_used
                }
                limit={
                  plan.similar_image_search_limit
                }
                remaining={
                  plan.similar_image_search_remaining
                }
              />

              <UsageRow
                label="가상시공"
                used={
                  plan.virtual_remodel_used
                }
                limit={
                  plan.virtual_remodel_limit
                }
                remaining={
                  plan.virtual_remodel_remaining
                }
              />

              <UsageRow
                label="사진 업로드"
                used={
                  plan.image_upload_used
                }
                limit={
                  plan.image_upload_limit
                }
                remaining={
                  plan.image_upload_remaining
                }
              />

              <UsageRow
                label="고객상담"
                used={
                  plan.customer_lead_used
                }
                limit={
                  plan.customer_lead_limit
                }
                remaining={
                  plan.customer_lead_remaining
                }
              />

              <UsageRow
                label="저장공간"
                used={
                  plan.storage_mb_used
                }
                limit={
                  plan.storage_mb_limit
                }
                remaining={
                  plan.storage_mb_remaining
                }
                storage
              />

              <button
                type="button"
                onClick={() => {
                  window.location.href =
                    "/admin/billing";
                }}
                style={{
                  width: "100%",
                  marginTop:
                    "14px",
                  border: "none",
                  borderRadius:
                    "10px",
                  padding:
                    "11px 12px",
                  background:
                    "#111827",
                  color:
                    "#ffffff",
                  fontSize:
                    "13px",
                  fontWeight:
                    "800",
                  cursor:
                    "pointer",
                }}
              >
                요금제 비교 / 변경
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
