"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const labels = {
  film: "사용 필름",
  labor: "인건비",
  expense: "경비",
  supplies: "부자재·추가자재",
};

const won = (value) =>
  `${Number(value || 0).toLocaleString("ko-KR")}원`;

const input = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 42,
  padding: 9,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
};

const button = {
  minHeight: 42,
  padding: "9px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  background: "#fff",
  color: "#1e293b",
  cursor: "pointer",
};

async function request(siteId, body, signal) {
  const timeout = new AbortController();
  const abort = () => timeout.abort();

  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 25000);

  try {
    if (signal?.aborted) {
      throw Error("요청이 취소되었습니다.");
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
      throw Error("관리자로 다시 로그인해주세요.");
    }

    const response = await fetch(
      `/api/admin/completion-estimate?siteId=${encodeURIComponent(siteId)}`,
      {
        method: body ? "POST" : "GET",
        signal: timeout.signal,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        ...(body
          ? { body: JSON.stringify({ ...body, siteId }) }
          : {}),
      },
    );

    const result = await response.json().catch(() => ({
      error:
        "서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
    }));

    if (!response.ok) {
      throw Error(result.error || "견적서 처리 실패");
    }

    return result;
  } catch (error) {
    if (timeout.signal.aborted && !signal?.aborted) {
      throw Error(
        "응답이 지연되고 있습니다. 입력은 유지됩니다. 저장 요청이 처리됐을 수 있으니 저장본을 확인한 후 다시 시도해주세요.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export default function CompletionEstimate({
  siteId,
  onDirtyChange,
}) {
  const [draft, setDraft] = useState(null);
  const [automatic, setAutomatic] = useState(null);
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const lock = useRef(false);
  const controller = useRef(null);

  useEffect(() => {
    onDirtyChange?.(dirty || busy);
  }, [dirty, busy, onDirtyChange]);

  async function load(signal) {
    setError("");
    setMessage("");
    setBusy(true);

    try {
      const result = await request(siteId, null, signal);
      if (signal.aborted) return;

      setDraft(result.saved || result.automatic);
      setAutomatic(result.automatic);
      setWarning(result.warning || "");
      setDirty(false);
    } catch (err) {
      if (!signal.aborted) setError(err.message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    const next = new AbortController();

    controller.current = next;
    setDraft(null);
    setAutomatic(null);
    load(next.signal);

    return () => next.abort();
  }, [siteId]);

  useEffect(() => {
    const warn = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(next) {
    setDraft(next);
    setDirty(true);
    setMessage("");
  }

  function edit(index, key, value) {
    change({
      ...draft,
      items: draft.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    });
  }

  async function save(event) {
    event.preventDefault();
    event.stopPropagation();

    if (lock.current || !draft || busy) return;

    for (const [index, row] of draft.items.entries()) {
      const prefix = `${index + 1}번 항목 (${row.name || "이름 없음"})`;
      let problem = "";

      if (!String(row.name || "").trim()) {
        problem = "항목명을 입력해주세요.";
      } else if (String(row.name).length > 500) {
        problem = "항목명은 500자 이하로 입력해주세요.";
      } else if (
        String(row.quantity ?? "").trim() === "" ||
        !Number.isFinite(Number(row.quantity)) ||
        Number(row.quantity) < 0 ||
        Number(row.quantity) > 1000000
      ) {
        problem = "수량은 0~1,000,000 범위로 입력해주세요.";
      } else if (
        String(row.amount ?? "").trim() === "" ||
        !Number.isSafeInteger(Number(row.amount)) ||
        Number(row.amount) < 0 ||
        Number(row.amount) > 1000000000
      ) {
        problem =
          "금액은 0~1,000,000,000원의 정수로 입력해주세요.";
      } else if (String(row.unit || "").length > 20) {
        problem = "단위는 20자 이하로 입력해주세요.";
      }

      if (problem) {
        setError(`${prefix}: ${problem}`);
        setMessage("");
        return;
      }
    }

    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const items = draft.items.map((row) => ({
        ...row,
        quantity: Number(row.quantity),
        amount: Number(row.amount),
      }));

      const result = await request(
        siteId,
        {
          items,
          note: draft.note,
          version: draft.version,
        },
        controller.current.signal,
      );

      if (controller.current.signal.aborted) return;

      setDraft(result.saved);
      setDirty(false);
      setMessage("견적서를 저장했습니다.");
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: 16,
        background: "#fff",
        border: "1px solid #dbeafe",
        borderRadius: 16,
      }}
    >
      <h3 style={{ margin: "0 0 8px" }}>시공 완료 견적서</h3>

      <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
        실제 사용내역으로 초안을 자동 작성합니다. 항목과 금액을
        확인한 후 저장하세요. 견적서 수정은 실제 지출·계약금액을
        변경하지 않습니다.
      </p>

      {warning && (
        <p role="status" style={{ color: "#92400e" }}>
          {warning}
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {message && (
        <p role="status" style={{ color: "#15803d" }}>
          {message}
        </p>
      )}

      {busy && <p role="status">처리 중…</p>}

      <button
        type="button"
        style={button}
        disabled={busy}
        onClick={() => {
          if (
            dirty &&
            !window.confirm(
              "저장하지 않은 수정을 버리고 다시 불러올까요?",
            )
          ) {
            return;
          }

          controller.current?.abort();
          controller.current = new AbortController();
          load(controller.current.signal);
        }}
      >
        저장본·최신 비용 다시 불러오기
      </button>

      {draft && (
        <form onSubmit={save} noValidate>
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <p style={{ fontSize: 12, color: "#64748b" }}>
              {draft.version
                ? `저장본 ${draft.version} · ${new Date(
                    draft.updated_at,
                  ).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}`
                : "자동 작성 초안 · 아직 저장되지 않았습니다."}
              {dirty && " · 수정사항 저장 필요"}
            </p>

            <button
              type="button"
              style={button}
              disabled={!automatic}
              onClick={() => {
                if (
                  window.confirm(
                    "수정한 항목을 불러온 실제 비용으로 바꿀까요? 저장 전에는 기존 저장본이 유지됩니다.",
                  )
                ) {
                  change({
                    ...draft,
                    items: automatic.items.map((row) => ({
                      ...row,
                    })),
                  });
                }
              }}
            >
              불러온 실제 비용으로 다시 작성
            </button>

            {Object.entries(labels).map(([category, label]) => (
              <section key={category} style={{ marginTop: 20 }}>
                <h4 style={{ margin: "0 0 8px" }}>{label}</h4>

                {draft.items.map((row, index) =>
                  row.category !== category ? null : (
                    <div
                      key={index}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <label>
                        항목명
                        <input
                          style={input}
                          required
                          maxLength={500}
                          value={row.name}
                          onChange={(event) =>
                            edit(index, "name", event.target.value)
                          }
                        />
                      </label>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          marginTop: 8,
                        }}
                      >
                        <label>
                          수량
                          <input
                            style={input}
                            type="number"
                            required
                            min="0"
                            max="1000000"
                            step="any"
                            value={row.quantity}
                            onChange={(event) =>
                              edit(
                                index,
                                "quantity",
                                event.target.value,
                              )
                            }
                          />
                        </label>

                        <label>
                          단위
                          <input
                            style={input}
                            maxLength={20}
                            value={row.unit}
                            onChange={(event) =>
                              edit(index, "unit", event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <label>
                        항목 합계금액 (원)
                        <input
                          style={{ ...input, marginTop: 6 }}
                          type="number"
                          required
                          min="0"
                          max="1000000000"
                          step="1"
                          value={row.amount}
                          onChange={(event) =>
                            edit(index, "amount", event.target.value)
                          }
                        />
                      </label>

                      <label>
                        분류
                        <select
                          style={input}
                          value={row.category}
                          onChange={(event) =>
                            edit(
                              index,
                              "category",
                              event.target.value,
                            )
                          }
                        >
                          {Object.entries(labels).map(
                            ([value, name]) => (
                              <option key={value} value={value}>
                                {name}
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <button
                        type="button"
                        style={{
                          ...button,
                          marginTop: 8,
                          color: "#b91c1c",
                        }}
                        onClick={() =>
                          change({
                            ...draft,
                            items: draft.items.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        항목 삭제
                      </button>
                    </div>
                  ),
                )}

                <button
                  type="button"
                  style={button}
                  disabled={draft.items.length >= 300}
                  onClick={() =>
                    change({
                      ...draft,
                      items: [
                        ...draft.items,
                        {
                          category,
                          name: "",
                          quantity: 1,
                          unit: "식",
                          amount: 0,
                        },
                      ],
                    })
                  }
                >
                  + {label} 추가
                </button>

                <p style={{ textAlign: "right", fontWeight: 700 }}>
                  {label} 합계{" "}
                  {won(
                    draft.items
                      .filter((row) => row.category === category)
                      .reduce(
                        (sum, row) => sum + Number(row.amount || 0),
                        0,
                      ),
                  )}
                </p>
              </section>
            ))}

            <p style={{ fontWeight: 900, fontSize: 20 }}>
              견적 합계{" "}
              {won(
                draft.items.reduce(
                  (sum, row) => sum + Number(row.amount || 0),
                  0,
                ),
              )}
            </p>

            <p style={{ fontSize: 12, color: "#64748b" }}>
              각 금액은 해당 항목의 합계입니다. 수량을 바꿀 때
              금액도 함께 확인해주세요. 부가세는 자동 가산하지
              않습니다.
            </p>

            <label>
              비고
              <textarea
                style={input}
                rows={3}
                maxLength={3000}
                value={draft.note}
                onChange={(event) =>
                  change({ ...draft, note: event.target.value })
                }
              />
            </label>

            <div
              aria-live="polite"
              style={{ marginTop: 12 }}
            >
              {error && (
                <p
                  role="alert"
                  style={{
                    color: "#b91c1c",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {error}
                </p>
              )}

              {message && (
                <p role="status" style={{ color: "#15803d" }}>
                  {message}
                </p>
              )}

              {busy && (
                <p role="status">견적서 처리 중…</p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              style={{
                ...button,
                width: "100%",
                marginTop: 12,
                background: "#2563eb",
                color: "#fff",
              }}
            >
              {busy ? "저장 중…" : "견적서 저장"}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
