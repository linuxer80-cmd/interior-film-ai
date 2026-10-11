"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function WorkerCommute({
  siteId,
  workDate,
}) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(null);

  useEffect(() => {
    setResult(null);
    setError("");
    setBusy(false);

    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [siteId, workDate]);

  async function check() {
    if (active.current) return;

    const controller = new AbortController();
    active.current = controller;

    const timeout = setTimeout(
      () => controller.abort(),
      55000,
    );

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const { data } = await supabase.auth.getSession();

      if (!data?.session?.access_token) {
        throw Error("로그인을 다시 해주세요.");
      }

      const params = new URLSearchParams({ siteId });

      if (workDate) {
        params.set("workDate", workDate);
      }

      const response = await fetch(
        `/api/worker/commute?${params}`,
        {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Authorization:
              `Bearer ${data.session.access_token}`,
          },
        },
      );

      const dataResult = await response.json();

      if (!response.ok) {
        throw Error(
          dataResult.error ||
          "출발 시간을 확인하지 못했습니다.",
        );
      }

      if (!controller.signal.aborted) {
        setResult(dataResult);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error.message);
      } else if (active.current === controller) {
        setError(
          "조회 시간이 초과되었습니다. 다시 조회해주세요.",
        );
      }
    } finally {
      clearTimeout(timeout);

      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }

  if (!siteId) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 12,
        background: "#eff6ff",
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <strong>오전 7시 50분 도착 준비</strong>

      <button
        type="button"
        disabled={busy}
        onClick={check}
        style={{
          display: "block",
          marginTop: 6,
          padding: "8px 12px",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          background: "white",
        }}
      >
        {busy
          ? "교통 예측 조회 중…"
          : result
            ? "출발 시간 다시 조회"
            : "출발 시간 확인"}
      </button>

      {error && (
        <p
          role="alert"
          style={{
            color: "#b91c1c",
            marginBottom: 0,
          }}
        >
          {error}
        </p>
      )}

      {result && (
        <div role="status" style={{ marginTop: 8 }}>
          <div>
            {result.workDate} 시공 · 목표 도착 07:50
          </div>

          <strong>
            {new Date(
              result.departureAt,
            ).toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "numeric",
              day: "numeric",
            })}
            {" "}{result.departureTime} 출발 권장
          </strong>

          <div>
            현장 도착 {result.arrivalTime} 예상
            {" "}· 자동차 약 {result.durationMinutes}분
          </div>

          <small>
            등록된 출발 주소 기준입니다.
            조회 당시 교통 예측이며 실제 교통·주차 시간은
            달라질 수 있습니다. 출발 전 다시 조회해주세요.
            {" "}조회 {
              new Date(
                result.checkedAt,
              ).toLocaleTimeString("ko-KR", {
                timeZone: "Asia/Seoul",
                hour: "2-digit",
                minute: "2-digit",
              })
            }
          </small>
        </div>
      )}
    </div>
  );
}
