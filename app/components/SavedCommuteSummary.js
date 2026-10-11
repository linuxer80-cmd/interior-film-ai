"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// 저장된 결과만 읽습니다. 새로운 교통 예측을 요청하지 않습니다.
export default function SavedCommuteSummary({
  siteId,
  workDate,
  refreshKey = 0,
}) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    let controller;
    setResult(null);

    async function readSaved() {
      controller?.abort();

      const request = new AbortController();
      controller = request;

      const timeout = setTimeout(
        () => request.abort(),
        15000
      );

      try {
        if (!siteId || !workDate) return;

        const { data } =
          await supabase.auth.getSession();

        if (!active || request.signal.aborted) return;

        if (!data?.session?.access_token) {
          setResult(null);
          return;
        }

        const params = new URLSearchParams({
          siteId,
          workDate,
          mode: "saved",
        });

        const response = await fetch(
          `/api/worker/commute?${params}`,
          {
            cache: "no-store",
            signal: request.signal,
            headers: {
              Authorization:
                `Bearer ${data.session.access_token}`,
            },
          }
        );

        const saved = await response.json();

        if (active && !request.signal.aborted) {
          setResult(
            response.ok &&
              saved.workDate === workDate &&
              Number.isFinite(saved.durationMinutes) &&
              saved.durationMinutes > 0 &&
              saved.departureAt &&
              Number.isFinite(
                Date.parse(saved.departureAt)
              )
              ? saved
              : null
          );
        }
      } catch {
        // 조회 실패가 일정이나 다른 기능을 막지 않습니다.
        if (active && !request.signal.aborted) {
          setResult(null);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    const resume = () => {
      if (document.visibilityState === "visible") {
        readSaved();
      }
    };

    readSaved();

    window.addEventListener("focus", resume);
    document.addEventListener(
      "visibilitychange",
      resume
    );

    return () => {
      active = false;
      controller?.abort();

      window.removeEventListener("focus", resume);
      document.removeEventListener(
        "visibilitychange",
        resume
      );
    };
  }, [siteId, workDate, refreshKey]);

  if (!result) return null;

  const departure = new Date(result.departureAt);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(departure);

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  const departureDate =
    `${values.year}-${values.month}-${values.day}`;

  const hour = Number(values.hour);

  const dateLabel =
    departureDate === workDate
      ? ""
      : `${Number(values.month)}월 ${Number(values.day)}일 `;

  return (
    <span
      style={{
        display: "block",
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 12,
        background: "#eff6ff",
        color: "#243648",
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <span style={{ display: "block" }}>
        현장까지 약 {result.durationMinutes}분 예상
      </span>

      <strong style={{ display: "block" }}>
        {dateLabel}
        {hour < 12 ? "오전" : "오후"}{" "}
        {hour % 12 || 12}시{" "}
        {Number(values.minute)}분 출발 권장
      </strong>
    </span>
  );
}
