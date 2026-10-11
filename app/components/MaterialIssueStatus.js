"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const labels = {
  unregistered: "사용 필름 미등록",
  none: "반출 기록 없음 · 자재 준비 필요",
  partial: "일부 필름 반출 등록",
  recorded: "등록된 필름 모두 반출 기록 있음",
};

const time = (value) =>
  value
    ? new Date(value).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
      })
    : "날짜 확인 필요";

export default function MaterialIssueStatus({
  siteId,
  refreshKey = 0,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const controller = useRef(null);

  const load = useCallback(async () => {
    controller.current?.abort();

    const current = new AbortController();
    controller.current = current;

    const timer = setTimeout(() => current.abort(), 20000);

    setLoading(true);
    setError("");

    try {
      const auth = await supabase.auth.getSession();

      if (auth.error || !auth.data.session?.access_token) {
        throw Error("다시 로그인해주세요.");
      }

      const response = await fetch(
        `/api/material-issue-status?siteId=${encodeURIComponent(siteId)}`,
        {
          cache: "no-store",
          signal: current.signal,
          headers: {
            Authorization: `Bearer ${auth.data.session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw Error(result.error || "반출 기록 조회 실패");
      }

      if (!current.signal.aborted) setData(result);
    } catch (cause) {
      if (controller.current === current) {
        setError(
          cause.name === "AbortError"
            ? "반출 기록 조회가 지연됩니다. 다시 확인해주세요."
            : cause.message
        );
        setData(null);
      }
    } finally {
      clearTimeout(timer);

      if (controller.current === current) {
        setLoading(false);
      }
    }
  }, [siteId]);

  useEffect(() => {
    setData(null);
    load();

    const resume = () => {
      if (document.visibilityState === "visible") load();
    };

    const changed = (event) => {
      if (event.detail?.siteId === siteId) load();
    };

    const timer = setInterval(resume, 60000);

    window.addEventListener("focus", resume);
    window.addEventListener("site-materials-changed", changed);
    document.addEventListener("visibilitychange", resume);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("site-materials-changed", changed);
      document.removeEventListener("visibilitychange", resume);
      controller.current?.abort();
      controller.current = null;
    };
  }, [load, siteId, refreshKey]);

  const people = [
    ...new Set(
      (data?.materials || []).flatMap((material) =>
        material.records.map((record) =>
          record.role === "owner"
            ? `${record.name} (관리자 등록)`
            : record.name
        )
      )
    ),
  ];

  return (
    <div className="issue-status" aria-busy={loading}>
      {loading ? (
        <p role="status">반출 기록 확인 중…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={load}>
            다시 확인
          </button>
        </div>
      ) : data ? (
        <>
          <p className={data.issuedCount ? "done" : "pending"}>
            <b>{labels[data.status]}</b>
            {data.materialCount > 0 && (
              <span>
                {" "}
                · {data.issuedCount}/{data.materialCount}종
              </span>
            )}
          </p>

          {people.length > 0 && (
            <p>반출 등록: {people.join(" · ")}</p>
          )}

          <details>
            <summary>반출자 · 필름 · 수량 보기</summary>

            {data.materials.map((material) => (
              <div key={material.id} className="material">
                <b>
                  {material.brand} {material.code}
                </b>
                <p>
                  총 반출 {material.issued}
                  {material.unit}
                </p>

                {!material.issued ? (
                  <p>반출 기록 없음</p>
                ) : !material.records.length ? (
                  <p>반출 수량 있음 · 기록자 확인 필요</p>
                ) : (
                  material.records.map((record) => (
                    <p key={record.id}>
                      <b>{record.name}</b>
                      {record.role === "owner"
                        ? " · 관리자 등록"
                        : " · 반출 등록"}
                      <br />
                      {record.roll ? `${record.roll} · ` : ""}
                      {record.quantity}
                      {record.unit} · {time(record.at)}

                      {record.returnedAt && (
                        <>
                          <br />
                          반납 처리: {record.returned ?? 0}
                          {record.unit} · {time(record.returnedAt)}
                        </>
                      )}
                    </p>
                  ))
                )}
              </div>
            ))}
          </details>

          <small>
            저장된 반출 기록 기준입니다. 필요한 전체 수량이
            준비됐는지는 확인해주세요. 관리자 등록 기록은 실제
            가져간 시공자를 뜻하지 않습니다.
          </small>
        </>
      ) : null}

      <style jsx>{`
        .issue-status {
          margin: 10px 0;
          padding: 12px;
          border-radius: 12px;
          background: #f1f6fb;
          font-size: 13px;
          color: #243648;
          overflow-wrap: anywhere;
        }
        p {
          margin: 6px 0;
          line-height: 1.6;
        }
        .done {
          color: #166534;
        }
        .pending {
          color: #92400e;
        }
        summary {
          cursor: pointer;
          padding: 10px 0;
          font-weight: 700;
        }
        .material {
          border-top: 1px solid #dce5ee;
          padding: 10px 0;
        }
        small {
          display: block;
          margin-top: 8px;
          color: #64748b;
          line-height: 1.6;
        }
        button {
          min-height: 44px;
          padding: 8px 12px;
          border-radius: 9px;
          border: 1px solid #cbd5e1;
          background: white;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
                  }
