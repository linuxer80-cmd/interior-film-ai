"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase";

const order = [
  "cutting_ocr",
  "receipt_ocr",
  "consultation_ocr",
  "voice_transcription",
  "consultation_parse",
  "help_chat",
  "quick_photo_analysis",
  "embedding",
  "structure_analysis",
];

const photoFeatures = new Set([
  "cutting_ocr",
  "receipt_ocr",
  "consultation_ocr",
  "quick_photo_analysis",
]);

const number = (value) =>
  Number(value || 0).toLocaleString("ko-KR");

export default function AiQuotaPanel() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData.session?.access_token
      ) {
        throw new Error(
          "관리자 로그인 후 확인해주세요."
        );
      }

      const response = await fetch(
        "/api/admin/ai-quota",
        {
          cache: "no-store",
          headers: {
            Authorization:
              `Bearer ${sessionData.session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "조회하지 못했습니다."
        );
      }

      setData(result);

      setSelected((previous) =>
        result.plans.some(
          (p) => p.plan_code === previous
        )
          ? previous
          : result.currentPlan
      );
    } catch (error) {
      setError(
        error.message || "다시 확인해주세요."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const plan = data?.plans.find(
    (p) => p.plan_code === selected
  );

  const isCurrent =
    selected === data?.currentPlan;

  return (
    <section
      style={{
        maxWidth: 1000,
        margin: "24px auto",
        padding: 24,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 24,
        color: "#18212d",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 22,
          }}
        >
          추가 AI 기능별 한도
        </h2>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            padding: "9px 12px",
            border: "1px solid #dbe3ec",
            background: "#f3f7fb",
            borderRadius: 12,
          }}
        >
          새로고침
        </button>
      </div>

      {loading && (
        <p>사용 횟수 확인 중…</p>
      )}

      {error && (
        <p
          role="alert"
          style={{ color: "#a33b22" }}
        >
          {error}
        </p>
      )}

      {data && !error && (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 18,
            }}
          >
            {data.plans.map((p) => (
              <button
                type="button"
                key={p.plan_code}
                onClick={() =>
                  setSelected(p.plan_code)
                }
                aria-pressed={
                  selected === p.plan_code
                }
                style={{
                  padding: "10px 14px",
                  border: "1px solid #dbe3ec",
                  borderRadius: 12,
                  background:
                    selected === p.plan_code
                      ? "#18212d"
                      : "#f8fafc",
                  color:
                    selected === p.plan_code
                      ? "#fff"
                      : "#18212d",
                }}
              >
                {p.plan_name}
              </button>
            ))}
          </div>

          {plan && (
            <>
              <p
                style={{
                  color: "#64748b",
                }}
              >
                {plan.plan_name} ·{" "}
                {selected === "trial"
                  ? "체험기간 누적"
                  : "월별 한도"}
                {isCurrent
                  ? " · 현재 이용 중"
                  : ""}
              </p>

              {plan.features.length === 0 ? (
                <p role="alert">
                  이 요금제의 추가 AI 한도가
                  아직 등록되지 않았습니다.
                </p>
              ) : (
                [...plan.features]
                  .sort(
                    (a, b) =>
                      order.indexOf(a.feature) -
                      order.indexOf(b.feature)
                  )
                  .map((feature) => {
                    const unit =
                      photoFeatures.has(
                        feature.feature
                      )
                        ? "장"
                        : "회";

                    const used = Number(
                      data.used[
                        feature.feature
                      ] || 0
                    );

                    const limit = Number(
                      feature.usage_limit || 0
                    );

                    return (
                      <div
                        key={feature.feature}
                        style={{
                          padding: "15px 0",
                          borderBottom:
                            "1px solid #edf1f5",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent:
                              "space-between",
                            gap: 16,
                          }}
                        >
                          <span>
                            {feature.label}
                          </span>

                          <strong>
                            {number(limit)}
                            {unit}
                          </strong>
                        </div>

                        {isCurrent && (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 13,
                              color: "#64748b",
                            }}
                          >
                            {number(used)}
                            {unit} 사용 ·{" "}
                            {number(
                              Math.max(
                                0,
                                limit - used
                              )
                            )}
                            {unit} 남음
                          </div>
                        )}
                      </div>
                    );
                  })
              )}

              <p
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  lineHeight: 1.7,
                }}
              >
                사진 분석은 사진 장수만큼
                차감됩니다. 음성기록·내용
                정리·챗봇은 요청 1건당
                1회입니다.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
