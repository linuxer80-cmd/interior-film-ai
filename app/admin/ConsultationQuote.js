"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  quoteTotals,
  validateQuote,
} from "../../lib/consultationQuote";
import { quoteHtml } from "../../lib/consultationQuotePrint";

const headings = {
  title: "견적서 제목",
  company_name: "상호",
  business_number: "사업자번호",
  company_phone: "업체 연락처",
  customer_name: "고객 성함",
  customer_phone: "고객 연락처",
  address: "주소",
  work_date: "시공 예정일",
  duration: "공사기간",
  customer_note: "고객 비고",
  other_schedule: "타 공정 일정 (도배·바닥·청소 등)",
  footer: "안내사항·입금계좌",
};

const columns = {
  name: "시공 항목",
  detail: "상세내역",
  unit_price: "단가 (원)",
  quantity: "수량",
  unit: "단위",
  film_no: "film no.",
  note: "비고",
};

async function request(siteId, body, signal) {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw Error("관리자로 다시 로그인해주세요.");
  }

  const response = await fetch(
    `/api/admin/consultation-quote?siteId=${encodeURIComponent(siteId)}`,
    {
      method: body ? "POST" : "GET",
      signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw Error(result.error || "견적서 처리 실패");
  }

  return result;
}

export default function ConsultationQuote({
  siteId,
  onDirtyChange,
}) {
  const [draft, setDraft] = useState(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  const lock = useRef(false);
  const controller = useRef(null);

  useEffect(() => {
    onDirtyChange?.(dirty || busy);
  }, [dirty, busy, onDirtyChange]);

  useEffect(() => {
    const warn = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", warn);

    return () =>
      window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function load(signal) {
    setBusy(true);
    setMessage("");

    try {
      const result = await request(siteId, null, signal);

      if (!signal.aborted) {
        setDraft(result.document);
        setRevision(result.revision);
        setDirty(false);
      }
    } catch (error) {
      if (!signal.aborted) setMessage(error.message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    controller.current = new AbortController();
    setDraft(null);
    load(controller.current.signal);

    return () => controller.current.abort();
  }, [siteId]);

  function change(next) {
    setDraft(next);
    setDirty(true);
    setMessage("");
  }

  async function save() {
    if (lock.current || busy) return;

    try {
      const document = validateQuote(draft);

      lock.current = true;
      setBusy(true);

      const result = await request(
        siteId,
        { document, revision },
        controller.current.signal
      );

      if (!controller.current.signal.aborted) {
        setDraft(result.document);
        setRevision(result.revision);
        setDirty(false);
        setMessage("견적서를 저장했습니다.");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        setMessage(error.message);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function preview() {
    try {
      const document = validateQuote(draft);
      const popup = window.open("", "_blank");

      if (!popup) throw Error("팝업을 허용해주세요.");

      popup.opener = null;
      popup.document.write(quoteHtml(document));
      popup.document.close();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const total = draft ? quoteTotals(draft.items) : null;

  return (
    <section className="consultation-quote">
      <h3>상담 견적서</h3>

      <p>
        상담 내용으로 항목을 준비합니다. 단가는 직접 입력하세요.
        미입력 금액은 0원으로 확정하지 않습니다.
        견적서 저장은 현장 상태·계약금액을 변경하지 않습니다.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (
            !dirty ||
            window.confirm(
              "저장하지 않은 수정을 버리고 저장본을 불러올까요?"
            )
          ) {
            load(controller.current.signal);
          }
        }}
      >
        저장본 다시 불러오기
      </button>

      {message && <p role="status">{message}</p>}
      {busy && <p>처리 중…</p>}

      {draft && (
        <fieldset disabled={busy}>
          <p>
            {revision
              ? `저장본 ${revision}`
              : "상담 내용으로 작성한 초안"}
            {dirty ? " · 저장 필요" : ""}
          </p>

          <div className="quote-fields">
            {Object.entries(headings).map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  rows={key === "footer" ? 3 : 1}
                  maxLength={2000}
                  value={draft[key]}
                  onChange={(event) =>
                    change({
                      ...draft,
                      [key]: event.target.value,
                    })
                  }
                />
              </label>
            ))}
          </div>

          <p>
            업체 정보·안내 문구는 저장하면 다음 견적서에도
            기본값으로 사용합니다.
          </p>

          {draft.items.map((row, index) => (
            <div className="quote-row" key={index}>
              <strong>{index + 1}번 항목</strong>

              <div className="quote-fields">
                {Object.entries(columns).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type={
                        ["quantity", "unit_price"].includes(key)
                          ? "number"
                          : "text"
                      }
                      min="0"
                      step={key === "quantity" ? "0.001" : "1"}
                      maxLength={2000}
                      value={row[key]}
                      onChange={(event) =>
                        change({
                          ...draft,
                          items: draft.items.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  [key]: event.target.value,
                                }
                              : item
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  change({
                    ...draft,
                    items: draft.items.filter(
                      (_, i) => i !== index
                    ),
                  })
                }
              >
                항목 삭제
              </button>
            </div>
          ))}

          <button
            type="button"
            disabled={draft.items.length >= 60}
            onClick={() =>
              change({
                ...draft,
                items: [
                  ...draft.items,
                  Object.fromEntries(
                    Object.keys(columns).map((key) => [key, ""])
                  ),
                ],
              })
            }
          >
            + 시공 항목 추가
          </button>

          <label>
            부가세 표시
            <select
              value={draft.vat}
              onChange={(event) =>
                change({
                  ...draft,
                  vat: event.target.value,
                })
              }
            >
              <option value="separate">
                부가세 별도 (10%)
              </option>
              <option value="included">부가세 포함</option>
              <option value="none">표시 안 함</option>
            </select>
          </label>

          <p>
            <strong>
              {total.complete
                ? `항목 합계 ${total.amount.toLocaleString("ko-KR")}원`
                : `입력된 금액 소계 ${total.amount.toLocaleString("ko-KR")}원 · 미완성`}
            </strong>
          </p>

          <button type="button" onClick={save}>
            견적서 저장
          </button>{" "}

          <button type="button" onClick={preview}>
            견적서 미리보기 / 인쇄·PDF
          </button>
        </fieldset>
      )}

      <style jsx>{`
        .consultation-quote {
          padding: 16px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 14px;
          margin: 16px 0;
        }
        .consultation-quote p {
          font-size: 13px;
          line-height: 1.6;
        }
        .consultation-quote fieldset {
          border: 0;
          padding: 0;
          min-width: 0;
        }
        .quote-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .quote-fields label {
          min-width: 0;
        }
        .consultation-quote input,
        .consultation-quote textarea,
        .consultation-quote select {
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 9px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font: inherit;
        }
        .consultation-quote button {
          padding: 10px;
          margin: 6px 0;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #eff6ff;
          color: #1e3a8a;
          min-height: 44px;
        }
        .quote-row {
          border: 1px solid #ddd;
          padding: 12px;
          margin: 12px 0;
          border-radius: 8px;
        }
        @media (max-width: 480px) {
          .quote-fields {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
