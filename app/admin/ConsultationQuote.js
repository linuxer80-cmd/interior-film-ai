"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  quoteTotals,
  validateQuote,
} from "../../lib/consultationQuote";
import QuoteFilmNumber, { useSiteQuoteFilms } from "../components/QuoteFilmNumber";
import QuoteFileActions from "../components/QuoteFileActions";
import CompletionEstimate from "./CompletionEstimate";
import { completionTotals } from "../../lib/completionEstimate.mjs";

const headings = {
  title: "견적서 제목",
  company_name: "상호",
  business_number: "사업자번호",
  company_phone: "업체 연락처",
  customer_name: "고객 성함",
  customer_phone: "고객 연락처",
  address: "주소",
  work_date: "시공일",
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
  film_no: "필름 번호",
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

function AreaConsultationQuote({
  siteId,
  onDirtyChange,
}) {
  const siteFilms = useSiteQuoteFilms(siteId);
  const [draft, setDraft] = useState(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [delivery, setDelivery] = useState(false);
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
    setDelivery(false);
    setDirty(true);
    setMessage("");
  }

  async function save(showPreview = false) {
    if (lock.current || busy) return;

    try {
      const document = validateQuote(draft);
      if(showPreview && !quoteTotals(document.items).complete) throw Error("수량·단가가 빠진 항목을 확인해주세요. 작성 중 저장은 가능합니다.");

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
        setDelivery(showPreview);
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

  const total = draft ? quoteTotals(draft.items) : null;
  const fileDraft = useMemo(() => draft ? {
    header: { company_name: draft.company_name, company_phone: draft.company_phone,
      business_number: draft.business_number, customer_name: draft.customer_name,
      address: draft.address, work_date: draft.work_date },
    vat: draft.vat,
    items: draft.items.map(row => ({ ...row,
      name: [row.name, row.detail, row.film_no ? "필름: " + row.film_no : "", row.note].filter(Boolean).join("\n"),
      amount: Math.round(Number(row.quantity) * Number(row.unit_price)) })),
    note: [draft.title, draft.customer_phone ? "고객 연락처: " + draft.customer_phone : "",
      draft.duration ? "공사기간: " + draft.duration : "", draft.customer_note,
      draft.other_schedule ? "타 공정 일정: " + draft.other_schedule : "", draft.footer].filter(Boolean).join("\n")
  } : null, [draft]);


  const billTotal=fileDraft ? completionTotals(fileDraft.items,fileDraft.vat) : null;
  return (
    <section className="consultation-quote">
      <h3>부위별 견적서</h3>

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

          <div hidden={delivery}>
          <details><summary>고객·현장·업체 정보 / 비고·계좌 수정</summary>
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

          </details>
          {draft.items.map((row, index) => (
            <div className="quote-row" key={index}>
              <strong>{index + 1}번 항목</strong>

              <div className="quote-fields">
                {Object.entries(columns).filter(([key])=>!["unit","film_no","note"].includes(key)).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    {key === "film_no" ? <QuoteFilmNumber value={row.film_no || ""}
                      {...siteFilms} onChange={value => change({ ...draft, items: draft.items.map((item, i) => i === index ? { ...item, film_no: value } : item) })} /> : <input
                      type={
                        ["quantity", "unit_price"].includes(key)
                          ? "number"
                          : "text"
                      }
                      min="0"
                      step={key === "quantity" ? "0.001" : "1"}
                      maxLength={2000}
                      value={row[key]}
                      placeholder={key === "quantity" ? "수량 입력 (예: 1)" : key === "unit_price" ? "단가 입력" : ""}
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
                    />}
                  </label>
                ))}
              </div>

              <p style={{textAlign:"right"}}>금액 <strong>{Math.round(Number(row.quantity || 0)*Number(row.unit_price || 0)).toLocaleString("ko-KR")}원</strong></p>
              <details><summary>단위·필름번호·비고 / 항목 삭제</summary>
              <div className="quote-fields">{["unit","film_no","note"].map(key=><label key={key}>{columns[key]}{key==="film_no" ? <QuoteFilmNumber value={row.film_no || ""} {...siteFilms} onChange={value=>change({...draft,items:draft.items.map((r,i)=>i===index?{...r,film_no:value}:r)})}/> : <input value={row[key]} maxLength={2000} onChange={event=>change({...draft,items:draft.items.map((r,i)=>i===index?{...r,[key]:event.target.value}:r)})}/>}</label>)}</div>
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
              </button></details>
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
                    Object.keys(columns).map((key) => [key, key === "quantity" ? "1" : ""])
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
                ? `견적 합계 ${billTotal.total.toLocaleString("ko-KR")}원`
                : `입력된 금액 소계 ${total.amount.toLocaleString("ko-KR")}원 · 미완성`}
            </strong>
          </p>

          <p>공급가액 {billTotal.supply.toLocaleString("ko-KR")}원 · 부가세 {billTotal.tax.toLocaleString("ko-KR")}원</p>
          {!total.complete && <p role="status" style={{ color: "#b45309" }}>
            {draft.items.map((row, index) => {
              const missing = [["quantity", "수량"], ["unit_price", "단가"]]
                .filter(([key]) => String(row[key] ?? "").trim() === "")
                .map(([, label]) => label);
              return missing.length ? `${index + 1}번 ${row.name || "항목"}: ${missing.join("·")} 입력 필요` : "";
            }).filter(Boolean).join(" / ")}
          </p>}

          <button type="button" onClick={()=>save(true)} style={{width:"100%",background:"#285340",color:"white"}}>견적서 저장 후 미리보기 →</button>
          <button type="button" onClick={()=>save(false)}>작성 중인 견적서 저장</button>
          </div>
          {delivery && <QuoteFileActions draft={fileDraft} filename={(draft.customer_name || "고객") + "_부위별견적서"} disabled={busy || dirty || !total?.complete} preview onEdit={()=>setDelivery(false)} />}
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
        .consultation-quote summary { padding:12px 0; min-height:44px; cursor:pointer; }
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

export default function ConsultationQuote({ siteId, onDirtyChange, initialChatDraft, requestedType }) {
  const [quoteType,setQuoteType]=useState(null);
  const [visited,setVisited]=useState({});
  const [dirtyTypes,setDirtyTypes]=useState({});
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const type=params.get("site")===String(siteId) && ["area","cost"].includes(params.get("quoteType")) ? params.get("quoteType") : initialChatDraft ? "cost" : null;
    setQuoteType(type);setVisited(type?{[type]:true}:{});setDirtyTypes({});
  },[siteId]);
  useEffect(()=>{if(requestedType && ["area","cost"].includes(requestedType.type)){setQuoteType(requestedType.type);setVisited(previous=>({...previous,[requestedType.type]:true}));}},[requestedType]);
  const areaStatus=useCallback(value=>setDirtyTypes(previous=>({...previous,area:value})),[]);
  const costStatus=useCallback(value=>setDirtyTypes(previous=>({...previous,cost:value})),[]);
  useEffect(()=>{onDirtyChange?.(Object.values(dirtyTypes).some(Boolean));},[dirtyTypes,onDirtyChange]);
  function selectType(type){setQuoteType(type);setVisited(previous=>({...previous,[type]:true}));}
  return <section>
    {quoteType===null ? <><h3>어떤 견적서를 작성할까요?</h3><div role="group" aria-label="견적서 작성 방식" style={{display:"grid",gap:10,marginTop:16}}>
      {[["area","부위별 견적서","문·싱크대 등 시공 부위별로 계산"],["cost","인건비·자재비 견적서","공수·필름 물량·경비로 계산"]].map(([type,title,description])=><button key={type} type="button" onClick={()=>selectType(type)} style={{padding:16,border:"1px solid #d9ddd5",borderRadius:14,background:"#fffefa",color:"#294e40",textAlign:"left",minHeight:76}}><strong style={{display:"block",fontSize:17}}>{title}</strong><span style={{display:"block",marginTop:5,fontSize:13}}>{description}{visited[type]?" · 작성 내용 이어보기":""}</span></button>)}
    </div><p style={{fontSize:13,color:"#69756d"}}>두 견적서 모두 시공 전·후 언제든 작성할 수 있으며 각각 저장됩니다.</p></> : <button type="button" onClick={()=>setQuoteType(null)} style={{minHeight:44,padding:"10px 14px",border:"1px solid #d9ddd5",borderRadius:12,background:"#fffefa",color:"#294e40"}}>← 견적서 선택</button>}
    {visited.area && <div hidden={quoteType!=="area"}><AreaConsultationQuote key={siteId} siteId={siteId} onDirtyChange={areaStatus}/></div>}
    {visited.cost && <div hidden={quoteType!=="cost"}><CompletionEstimate key={siteId} siteId={siteId} onDirtyChange={costStatus} initialChatDraft={initialChatDraft}/></div>}
  </section>;
}
