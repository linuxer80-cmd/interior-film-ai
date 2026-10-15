"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

import { completionLabels as labels, headerFields, completionTotals, editCompletionItem, summarizeMeals, includedCompletionItem } from "../../lib/completionEstimate.mjs";

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

  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("");
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
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

      const source = result.saved || result.automatic;
      const items = summarizeMeals(source.items);
      setDraft({ ...source, items });
      setAutomatic(result.automatic);
      setWarning(result.warning || "");
      setDirty(Boolean(result.saved) && JSON.stringify(items) !== JSON.stringify(source.items));
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
    setPdfUrl("");
    setDraft(next);
    setDirty(true);
    setMessage("");
  }

  function edit(index, key, value) {
    change({
      ...draft,
      items: draft.items.map((item, i) =>
        i === index ? editCompletionItem(item, key, value) : item,
      ),
    });
  }

  async function save(event) {
    event.preventDefault();
    event.stopPropagation();

    if (lock.current || !draft || busy) return;

    for (const [index, row] of draft.items.entries()) {
      if (!includedCompletionItem(row)) continue;
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

    const makePdf = event.nativeEvent?.submitter?.value === "pdf";
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const items = draft.items.filter(includedCompletionItem).map((row) => ({
        ...row,
        quantity: Number(row.quantity),
        amount: Number(row.amount),
      }));

      const pdf = makePdf ? await (await import("../../lib/completionEstimatePdf.mjs")).completionPdf({ ...draft, items }) : null;
      const result = await request(
        siteId,
        {
          items,
          header: draft.header || {},
          vat: draft.vat || "none",
          note: draft.note,
          version: draft.version,
        },
        controller.current.signal,
      );

      if (controller.current.signal.aborted) return;

      setDraft(result.saved);
      setDirty(false);
      setMessage("견적서를 저장했습니다.");
      if (pdf) {
        const url = URL.createObjectURL(pdf);
        const filename = `${draft.header?.site_name || "현장"}_정산견적서_v${result.saved.version}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
        setPdfUrl(url); setPdfName(filename);
        const link = document.createElement("a"); link.href = url; link.download = filename;
        document.body.appendChild(link); link.click(); link.remove();
        setMessage("견적서를 저장하고 PDF를 만들었습니다. 다운로드가 시작되지 않으면 아래 링크를 눌러주세요.");
      }
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
      <h3 style={{ margin: "0 0 8px" }}>업체 견적서 · 물량·인건비·경비</h3>

      <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
        현장 필름명과 사용량을 자동으로 가져옵니다. 사용량은 반출량에서 반입량을 뺀 값입니다. 미확정 수량은 직접 입력해주세요. 자재 금액은 등록된 원가를 참고한 초안이므로 청구할 금액으로
        수정한 후 저장하세요. 견적서 수정은 실제 지출·계약금액을
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
        저장본·최신 현장 내역 불러오기
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
                    "수정한 항목을 불러온 현장 물량·인건비·경비로 바꿀까요? 저장 전에는 기존 저장본이 유지됩니다.",
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
              현장 물량·비용으로 다시 작성
            </button>

            <button type="button" style={{ ...button, marginTop: 10 }} disabled={!automatic}
              onClick={() => {
                if (!window.confirm("인건비만 최신 현장 비용으로 다시 집계할까요? 직접 수정한 인건비는 대체됩니다.")) return;
                change({ ...draft, items: [
                  ...draft.items.filter(row => row.category !== "labor"),
                  ...automatic.items.filter(row => row.category === "labor").map(row => ({ ...row })),
                ], header: { ...draft.header, crew_count: automatic.header.crew_count, person_days: automatic.header.person_days } });
              }}>인건비만 일당별로 다시 작성</button>
            <p style={{ fontSize: 13, color: "#64748b" }}>
              투입 인원 {draft.header?.crew_count || "미확인"}명 · 총 {draft.header?.person_days || "미확인"}공수.
              1명이 3일 일하면 1명·3공수입니다. 단가가 바뀐 사람은 해당 단가별 인원에 각각 포함됩니다.
            </p>

            <button type="button" style={{ ...button, marginTop: 10 }} disabled={!automatic}
              onClick={() => {
                if (!window.confirm("필름 물량과 단가만 최신 현장 내역으로 바꿀까요? 직접 수정한 필름 항목은 대체됩니다.")) return;
                change({ ...draft, items: [
                  ...automatic.items.filter(row => row.category === "film").map(row => ({ ...row })),
                  ...draft.items.filter(row => row.category !== "film"),
                ] });
              }}>필름 수량·단가 다시 불러오기</button>
            <p style={{fontSize:13,color:"#64748b"}}>
              필름 수량은 반출량에서 반입량을 뺀 사용량입니다. 반입량을 아직 입력하지 않았다면 현장 자재에서 반입량을 확인한 뒤 최신 현장 내역을 불러와주세요.
            </p>

            <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", padding: "10px 0", fontWeight: 700 }}>업체·현장 정보 확인 / 수정</summary>
            <p>{draft.header?.customer_name || "거래처 미입력"} · {draft.header?.site_name || "현장명 미입력"}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              {Object.entries(headerFields).map(([key, label]) => <label key={key}>{label}
                <input style={input} maxLength={500} value={draft.header?.[key] ?? ""}
                  onChange={event => change({ ...draft, header: { ...draft.header, [key]: event.target.value } })} />
              </label>)}
            </div>
            </details>

            {[
              { title: "필름 물량", categories: ["film"] },
              { title: "인건비", categories: ["labor"] },
              { title: "경비", categories: ["meal", "supplies", "overhead", "expense"] },
            ].map(group => (
              <section key={group.title} style={{ marginTop: 20, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                <h4 style={{ margin: "0 0 8px" }}>{group.title}</h4>
                {group.categories.map(category => {
                  const label = labels[category];
                  return <div key={category}>

                {draft.items.map((row, index) =>
                  row.category !== category ? null : category === "meal" ? (
                    <div key={index} style={{marginBottom:12}}>
                      <label>식대 합계 (원)
                        <input style={input} type="number" min="0" max="1000000000" step="1"
                          value={row.amount} onChange={event => edit(index, "amount", event.target.value)} />
                      </label>
                    </div>
                  ) : (
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
                            placeholder="사용량 확인 필요"
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
                        단가 (원)
                        <input style={input} type="number" min="0" max="1000000000" step="any" value={row.unit_price ?? ""}
                          placeholder="기존 합계금액을 유지하려면 비워두세요"
                          onChange={event => edit(index, "unit_price", event.target.value === "" ? null : event.target.value)} />
                      </label>
                      <label>
                        금액 (원)
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

                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: "pointer", padding: "8px 0" }}>항목 설정</summary>
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
                      </details>
                    </div>
                  ),
                )}

                <button
                  type="button"
                  style={button}
                  disabled={draft.items.length >= 300 || (category === "meal" && draft.items.some(row => row.category === "meal"))}
                  onClick={() =>
                    change({
                      ...draft,
                      items: [
                        ...draft.items,
                        {
                          category,
                          name: category === "meal" ? "식대 합계" : "",
                          quantity: 1,
                          unit: category === "film" ? "m" : category === "labor" ? "공수" : "식",
                          amount: 0,
                        },
                      ],
                    })
                  }
                >
                  + {label} 추가
                </button>

                  </div>;
                })}
                <p style={{ textAlign: "right", fontWeight: 700 }}>
                  {group.title} 합계 {won(draft.items.filter(row => group.categories.includes(row.category) && includedCompletionItem(row)).reduce((sum, row) => sum + Number(row.amount || 0), 0))}
                </p>
              </section>
            ))}

            <p style={{ fontWeight: 900, fontSize: 20 }}>
              견적 합계{" "}
              {won(completionTotals(draft.items, draft.vat).total)}
            </p>

            <p style={{ fontSize: 12, color: "#64748b" }}>
              항목명·수량·금액 중 하나를 빈칸으로 두면 저장 및 PDF에서 해당 항목이 제외됩니다. 단가만 비우면 입력한 합계금액은 유지됩니다.
            </p>

            <label>부가세
              <select style={input} value={draft.vat || "none"} onChange={event => change({ ...draft, vat: event.target.value })}>
                <option value="none">가산 없음</option><option value="separate">별도 10%</option><option value="included">금액에 포함</option>
              </select>
            </label>
            <p>공급가액 {won(completionTotals(draft.items, draft.vat).supply)} · 부가세 {won(completionTotals(draft.items, draft.vat).tax)}</p>
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
            <button type="submit" value="pdf" disabled={busy} style={{ ...button, width: "100%", marginTop: 10, background: "#183d34", color: "white" }}>
              {busy ? "처리 중…" : "보고서 만들기 · 저장 및 PDF 다운로드"}
            </button>
            {pdfUrl && <p><a href={pdfUrl} download={pdfName}>PDF 다시 다운로드</a></p>}
          </fieldset>
        </form>
      )}
    </section>
  );
}


