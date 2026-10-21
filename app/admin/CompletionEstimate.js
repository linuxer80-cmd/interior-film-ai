"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QuoteFileActions from "../components/QuoteFileActions";
import { chatCompletionDraft } from "../../lib/chatQuoteDraft.mjs";
import { supabase } from "../../lib/supabase";

import { completionLabels as labels, headerFields, completionTotals, editCompletionItem, summarizeMeals, includedCompletionItem, normalizeLaborNames, withManualCompletionItems } from "../../lib/completionEstimate.mjs";

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
  initialChatDraft,
  onDirtyChange,
}) {
  const [draft, setDraft] = useState(null);
  const fileDraft = useMemo(() => draft ? { ...draft,
    items: draft.items.filter(includedCompletionItem).map(row => ({
      ...row, quantity: Number(row.quantity), amount: Number(row.amount)
    })) } : null, [draft]);

  const [automatic, setAutomatic] = useState(null);
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [defaults, setDefaults] = useState({note:"",bank_account:""});
  const [defaultsSaving, setDefaultsSaving] = useState(false);

  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("");
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const lock = useRef(false);
  const chatApplied = useRef(false);
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

      const applyChat = initialChatDraft && !result.saved && !chatApplied.current;
      const source = applyChat ? chatCompletionDraft(result.automatic,initialChatDraft) : result.saved || result.automatic;
      if(applyChat)chatApplied.current=true;
      const normalized = normalizeLaborNames(summarizeMeals(source.items));
      const items = withManualCompletionItems(normalized);
      setDraft({ ...source, items });
      setDefaults(result.defaults || {note:"",bank_account:""});
      setAutomatic(result.automatic);
      setWarning(result.warning || "");
      setDirty(Boolean(applyChat) || Boolean(result.saved) && JSON.stringify(normalized) !== JSON.stringify(source.items));
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

  async function saveDefaults() {
    if(defaultsSaving || busy) return;
    setDefaultsSaving(true); setError(""); setMessage("");
    try {
      const result = await request(siteId, {action:"saveDefaults",note:defaults.note,bank_account:defaults.bank_account}, controller.current.signal);
      if(controller.current.signal.aborted) return;
      setDefaults(result.defaults);
      change({...draft, header:{...draft.header,bank_account:result.defaults.bank_account},
        note:draft.useDefaultNote ? result.defaults.note : draft.note});
      setMessage("업체 기본 비고와 계좌번호를 저장했습니다. 다음 새 견적서부터 자동 적용됩니다.");
    } catch(err) { if(err.name !== "AbortError") setError(err.message); }
    finally {setDefaultsSaving(false);}
  }

  async function save(event) {
    event.preventDefault();
    event.stopPropagation();

    if (lock.current || !draft || busy || defaultsSaving) return;

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
          useDefaultNote: draft.useDefaultNote === true,
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
      <h3 style={{ margin: "0 0 8px" }}>인건비·자재비 견적서</h3>

      <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
        현장 내역을 불러온 뒤 관리자가 제품·사용량·공수·청구 단가·금액을 수정할 수 있습니다. 필름의 최초 단가는 인테리어업자 판매단가 기준입니다.
      </p>

      <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>수정 내용은 이 견적서에만 저장됩니다. 완료보고·재고·실제 원가는 변경되지 않습니다. 금액을 직접 입력하면 단가는 비워지고 입력한 금액이 적용됩니다.</p>

      {initialChatDraft && draft && !chatApplied.current && !busy && <button type="button" style={button} onClick={()=>{
        if(!window.confirm("현재 견적 내용 대신 채팅 초안을 불러올까요? 저장하기 전에는 기존 저장본이 변경되지 않습니다."))return;
        chatApplied.current=true;
        change(chatCompletionDraft(draft,initialChatDraft));
      }}>채팅 초안으로 견적 내용 바꾸기</button>}

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

      <details style={{marginBottom:12}}><summary style={{cursor:"pointer",padding:"10px 0"}}>저장본 다시 불러오기</summary>
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
      </button></details>

      {draft && (
        <form key={siteId} noValidate onSubmit={save}>
          <fieldset
            disabled={busy || defaultsSaving}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div><p style={{ fontSize: 12, color: "#64748b" }}>
              {draft.version
                ? `저장본 ${draft.version} · ${new Date(
                    draft.updated_at,
                  ).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}`
                : "자동 작성 초안 · 아직 저장되지 않았습니다."}
              {dirty && " · 수정사항 저장 필요"}
            </p>

            <details style={{marginBottom:12}}><summary style={{cursor:"pointer",padding:"10px 0"}}>자동 입력 다시 적용</summary>
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
              투입 인원 {draft.header?.crew_count || "미확인"}명
            </p>

            <button type="button" style={{ ...button, marginTop: 10 }} disabled={!automatic}
              onClick={() => {
                if (!window.confirm("필름 물량과 인테리어업자 판매단가를 적용할까요? 직접 수정한 필름 항목은 대체됩니다.")) return;
                change({ ...draft, items: [
                  ...automatic.items.filter(row => row.category === "film").map(row => ({ ...row })),
                  ...draft.items.filter(row => row.category !== "film"),
                ] });
              }}>필름 수량·인테리어업자 단가 적용</button>
            <p style={{fontSize:13,color:"#64748b"}}>
              기존 저장 견적서는 위 버튼으로 인테리어업자 판매단가를 적용한 뒤 저장해주세요. 필름 수량은 반출량에서 반입량을 뺀 사용량입니다. 반입량을 아직 입력하지 않았다면 현장 자재에서 반입량을 확인한 뒤 최신 현장 내역을 불러와주세요.
            </p>

            </details>
            <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", padding: "10px 0", fontWeight: 700 }}>업체·현장 정보 확인 / 수정</summary>
            <p>{draft.header?.customer_name || "거래처 미입력"} · {draft.header?.site_name || "현장명 미입력"}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              {Object.entries(headerFields).filter(([key]) => key !== 'person_days' && key !== 'bank_account').map(([key, label]) => <label key={key}>{label}
                <input style={input} maxLength={500} value={draft.header?.[key] ?? ""}
                  onChange={event => change({ ...draft, header: { ...draft.header, [key]: event.target.value } })} />
              </label>)}
            </div>
            </details>

            </div>{[
              { title: "필름 물량", categories: ["film"] },
              { title: "인건비", categories: ["labor"] },
              { title: "경비", categories: ["meal", "supplies", "overhead", "expense"] },
            ].map((group, groupIndex) => (
              <section key={group.title} style={{ marginTop: 20, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                <h4 style={{ margin: "0 0 8px" }}>{group.title}</h4>
                {group.categories.map(category => {
                  const label = labels[category];
                  return <div key={category}>

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
                      <input aria-label="항목명" style={{...input,fontWeight:700,border:0,padding:"6px 0"}} maxLength={500} value={row.name} placeholder="항목명을 입력하세요" onChange={event=>edit(index,"name",event.target.value)} />
                      {<>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          marginTop: 8,
                        }}
                      >
                        <label>
                          {category === "film" ? "청구 사용량" : category === "labor" ? "청구 공수" : "수량"} ({row.unit || "개"})
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

                        <label>단가 (원)
                          <input style={input} type="number" min="0" max="1000000000" step="any" value={row.unit_price ?? ""} placeholder="청구 단가" onChange={event=>edit(index,"unit_price",event.target.value === "" ? null : event.target.value)} />
                        </label>
                      </div>
                      </>}
                      <label>단위<input style={input} maxLength={20} value={row.unit} onChange={event=>edit(index,"unit",event.target.value)} /></label>
                      <label>
                        청구 금액 (원)
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


                      <details style={{marginTop:8}}><summary style={{cursor:"pointer",padding:"8px 0"}}>분류 변경 / 항목 삭제</summary>
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
                          name: category === "meal" ? "식대 합계" : category === "labor" ? "인건비" : "",
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
            <div>

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
            <details style={{marginTop:12}}><summary style={{cursor:"pointer",padding:"10px 0"}}>계좌·비고 설정</summary>
            <label>입금 계좌 (은행 · 계좌번호 · 예금주)
              <input style={input} maxLength={500} value={draft.header?.bank_account || ""}
                onChange={event => change({...draft,header:{...draft.header,bank_account:event.target.value}})} />
            </label>
            <details style={{marginTop:16}}>
              <summary>업체 기본 비고·계좌 설정</summary>
              <label>기본 계좌번호
                <input style={input} maxLength={500} value={defaults.bank_account}
                  onChange={event=>setDefaults({...defaults,bank_account:event.target.value})} />
              </label>
              <label>고정 비고
                <textarea style={input} rows={4} maxLength={3000} value={defaults.note}
                  onChange={event=>setDefaults({...defaults,note:event.target.value})} />
              </label>
              <button type="button" style={button} disabled={defaultsSaving} onClick={saveDefaults}>
                {defaultsSaving ? "저장 중…" : "업체 기본값 저장"}
              </button>
            </details>
            <p><label>
              <input type="checkbox" checked={draft.useDefaultNote === true}
                onChange={event => change({...draft,useDefaultNote:event.target.checked,
                  note:event.target.checked ? defaults.note : draft.note})} />
              업체 고정 비고 사용
            </label></p>
            <label>
              비고
              <textarea
                style={input}
                rows={3}
                maxLength={3000}
                readOnly={draft.useDefaultNote === true}
                value={draft.note}
                onChange={(event) =>
                  change({ ...draft, note: event.target.value })
                }
              />
            </label>

            </details></div><div
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

            <div style={{position:"sticky",bottom:0,background:"#fff",padding:"12px 0",borderTop:"1px solid #e2e8f0",zIndex:2}}><strong>합계 {won(completionTotals(draft.items, draft.vat).total)}</strong><button
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
              {busy ? "처리 중…" : "저장하고 PDF 받기"}
            </button>
            </div>{pdfUrl && <p><a href={pdfUrl} download={pdfName} data-ui-link="action">PDF 다시 다운로드</a></p>}
            <QuoteFileActions draft={fileDraft} filename={(draft.header?.site_name || "현장") + "_인건비자재비견적서"} disabled={busy || !fileDraft?.items.length} />
          </fieldset>
        </form>
      )}
    </section>
  );
}





