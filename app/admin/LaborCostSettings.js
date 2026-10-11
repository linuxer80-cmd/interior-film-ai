"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import CompanyLeaderAllowance from "./workers/CompanyLeaderAllowance";

const field = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 46,
  padding: "10px 12px",
  margin: "6px 0 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  background: "white",
  color: "#111827",
  fontSize: 16,
};

const button = {
  minHeight: 44,
  padding: "10px 16px",
  border: 0,
  borderRadius: 10,
  background: "#111827",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const month = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);

async function attendance(method = "GET", body, signal) {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error("로그인을 다시 해주세요.");
  }

  const response = await fetch(
    `/api/attendance?mode=admin&month=${month()}`,
    {
      method,
      signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );

  const result = await response.json().catch(() => ({
    error: "서버 응답을 확인하지 못했습니다.",
  }));

  if (!response.ok) {
    throw new Error(
      result.error || "출퇴근 설정을 불러오지 못했습니다.",
    );
  }

  return result;
}

function OvertimeSettings() {
  const [rate, setRate] = useState("");
  const [cutoff, setCutoff] = useState("17:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setReady(false);
    setError("");

    attendance("GET", null, controller.signal)
      .then((result) => {
        if (!active) return;

        setRate(
          result.settings
            ? String(result.settings.hourly_rate)
            : "",
        );

        setCutoff(
          result.settings?.cutoff?.slice(0, 5) || "17:00",
        );

        setReady(true);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retry]);

  async function save(event) {
    event.preventDefault();

    if (lock.current || !ready) return;

    const amount = Number(rate);

    if (
      rate === "" ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      amount > 1000000
    ) {
      setError(
        "시간당 금액을 0~1,000,000원 사이의 정수로 입력해주세요.",
      );
      return;
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) {
      setError("기준 퇴근시각을 입력해주세요.");
      return;
    }

    lock.current = true;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const current = await attendance();

      await attendance("POST", {
        action: "settings",
        cutoff,
        hourlyRate: amount,
        radius: current.settings?.radius_m ?? 200,
      });

      setMessage(
        `저장했습니다. 다음 출근부터 ${cutoff} 이후 연장근무에 시간당 ${amount.toLocaleString("ko-KR")}원을 적용합니다.`,
      );
    } catch (cause) {
      setError(cause.message);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <section
      style={{
        padding: 16,
        border: "1px solid #ddd6fe",
        borderRadius: 14,
        background: "#faf8ff",
      }}
    >
      <h3 style={{ margin: 0, fontSize: 17 }}>
        오버타임 비용 설정
      </h3>

      <p
        style={{
          fontSize: 12,
          lineHeight: 1.7,
          color: "#475569",
        }}
      >
        기준 퇴근시각 이후의 연장시간에서 휴게시간을 빼고
        계산합니다. 추가 인건비는 출퇴근 관리에서 승인한 후
        반영됩니다.
      </p>

      {loading && (
        <p role="status">설정을 불러오는 중…</p>
      )}

      {ready && (
        <form onSubmit={save}>
          <label>
            기준 퇴근시각 (한국 시간)
            <input
              style={field}
              type="time"
              required
              value={cutoff}
              disabled={saving}
              onChange={(event) =>
                setCutoff(event.target.value)
              }
            />
          </label>

          <label>
            연장근무 시간당 금액 (원)
            <input
              style={field}
              type="number"
              min="0"
              max="1000000"
              step="1"
              required
              value={rate}
              disabled={saving}
              onChange={(event) =>
                setRate(event.target.value)
              }
            />
          </label>

          <p
            style={{
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.7,
            }}
          >
            등록한 시간당 금액 × 인정 연장분 ÷ 60으로
            계산합니다. 별도 배율은 곱하지 않습니다.
            변경한 기준은 다음 출근부터 적용되고 기존
            출퇴근 기록의 단가는 유지됩니다.
          </p>

          <button style={button} disabled={saving}>
            {saving ? "저장 중…" : "오버타임 기준 저장"}
          </button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          style={{ color: "#b91c1c", fontSize: 13 }}
        >
          {error}
        </p>
      )}

      {message && (
        <p
          role="status"
          style={{
            color: "#166534",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          {message}
        </p>
      )}

      {!loading && !ready && (
        <button
          style={button}
          onClick={() => setRetry((value) => value + 1)}
        >
          다시 불러오기
        </button>
      )}

      <p style={{ marginBottom: 0, fontSize: 13 }}>
        <Link href="/admin/attendance">
          출퇴근 기록·연장근무 승인 →
        </Link>
      </p>
    </section>
  );
}

export default function LaborCostSettings({ onClose }) {
  const [mounted, setMounted] = useState(false);

  return (
    <details
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 14,
        background: "#f8fafc",
      }}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setMounted(true);
        } else if (mounted) {
          onClose?.();
        }
      }}
    >
      <summary
        style={{
          fontWeight: 800,
          cursor: "pointer",
          minHeight: 24,
        }}
      >
        팀장수당 · 오버타임 비용 설정
      </summary>

      {mounted && (
        <div style={{ marginTop: 14 }}>
          <CompanyLeaderAllowance />
          <OvertimeSettings />
        </div>
      )}
    </details>
  );
          }
