"use client";
import useAdminOverlayBack from "../../lib/useAdminOverlayBack";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { quoteSeed } from "../../lib/consultationQuote";
import MaterialFilmPicker from "../components/MaterialFilmPicker";
import WorkDatePicker from "./WorkDatePicker";
import { koreanDay } from "../utils/workerCalendar";
import CallContentAiInput from "./site-register/CallContentAiInput";
import CustomerChoice from "./site-register/CustomerChoice";
import ScreenshotSiteInput from "./site-register/ScreenshotSiteInput";
import { supabase } from "../../lib/supabase";
import { consultationSupplement } from "../../lib/consultationSupplement.mjs";
import { registrationStatus as getRegistrationStatus, similarRegistrationSites } from "../../lib/siteRegistration.mjs";
import { tradeApi } from "../components/TradeClients";
import { mergeRegistrationMaterials, registrationCustomerFields, registrationAmountValues, normalizeRegistrationDraft, registrationMaterialTypeError } from "../../lib/registrationInputs.mjs";

const registrationSteps = ["상담내용", "현장정보", "확인·저장"];

const emptyForm = {
  work_dates: [],
  customer_name: "",
  customer_phone: "",
  site_name: "",
  address: "",
  address_detail: "",
  region: "",
  work_type: "",
  work_description: "",
  contract_amount: "",
  deposit_amount: "",
  source: "phone",
  memo: "",
};

const emptyCustomer = {
  type: "personal",
  clientId: "",
  contactId: "",
  name: "",
  phone: "",
};

const material = () => ({
  local_id: crypto.randomUUID(),
  film_product_id: null,
  brand: "",
  product_code: "",
  product_name: "",
  unit: "m",
  unit_price: "",
  price_type: "",
  memo: "",
});

export default function SiteRegisterModal({
  open,
  companyId,
  onClose,
  createSite,
  loading = false,
}) {
  const [consultation, setConsultation] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [materials, setMaterials] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [inputMode, setInputMode] = useState("direct");
  const [confirmed, setConfirmed] = useState(false);
  const registrationStatus = getRegistrationStatus(confirmed, form.work_dates);
  const [consultationText, setConsultationText] = useState("");
  const [nextAction, setNextAction] = useState("quote");
  const [candidates, setCandidates] = useState([]);
  const [duplicateChoice, setDuplicateChoice] = useState("");
  const [checking, setChecking] = useState(false);
  const [analysisConflicts,setAnalysisConflicts] = useState([]);
  const registrationRequest = useRef(null);
  const [callBusy, setCallBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [saveFinished,setSaveFinished]=useState(false);
  const [step, setStep] = useState(0);
  const panelRef = useRef(null);
  const [editTarget, setEditTarget] = useState(null);
  const reviewDraft = normalizeRegistrationDraft({...form,materials});

  const lock = useRef(false);
  const checkLock = useRef(false);
  const screenshotApplyRef = useRef(null);
  const pendingLink = useRef(null);

  const previews = useMemo(
    () => photos.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    })),
    [photos]
  );

  useEffect(
    () => () => {
      previews.forEach((item) =>
        URL.revokeObjectURL(item.url)
      );
    },
    [previews]
  );

  useEffect(() => {
    if (!open) return;

    setStep(0);
    setEditTarget(null);
    setConfirmed(false);setConsultationText("");setNextAction("quote");setCandidates([]);setDuplicateChoice("");setAnalysisConflicts([]);registrationRequest.current=crypto.randomUUID();
    setInputMode("direct");
    setConsultation(null);
    setForm({ ...emptyForm, work_dates: [] });
    setCustomer({ ...emptyCustomer });
    setMaterials([]);
    setPhotos([]);
    setMessage("");
    setSaved(null);setSaveFinished(false);
    pendingLink.current = null;
  }, [open]);

  useEffect(() => {
    registrationRequest.current=crypto.randomUUID();
  }, [form,materials,photos,consultationText,duplicateChoice,consultation,customer,confirmed]);

  useEffect(() => {
    panelRef.current?.scrollTo({top:0, behavior:"instant"});
  }, [step]);

  useEffect(() => {
    if (!editTarget || !open) return;
    const frame = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector(`[data-registration-edit="${editTarget.key}"]`);
      if (!target) return;
      let ancestor = target.parentElement;
      while (ancestor && ancestor !== panelRef.current) {
        if (ancestor.tagName === "DETAILS") ancestor.open = true;
        ancestor = ancestor.parentElement;
      }
      target.focus({preventScroll:true});
      target.scrollIntoView({block:"start",behavior:"instant"});
    });
    return () => cancelAnimationFrame(frame);
  }, [editTarget, step, open]);

  function editReviewItem(key) {
    setMessage("");
    if (key === "dates") {
      setConfirmed(true);
      setStep(2);
    } else {
      setStep(1);
    }
    setEditTarget({key});
  }

  async function nextStep() {
    if (blocked || checkLock.current) return;
    setMessage("");
    if (step === 0) {
      if (inputMode === "screenshot" && screenshotApplyRef.current && !screenshotApplyRef.current()) return;
      if (!form.work_description.trim() && consultationText.trim()) field("work_description",consultationText.trim());
      setStep(1);return;
    }
    const materialError = registrationMaterialTypeError(reviewDraft.materials);
    if (materialError) {editReviewItem("materials");setMessage(materialError);return;}
    if (!form.site_name.trim() && !form.address.trim() && !form.customer_phone.trim()) {setMessage("현장명·주소·전화번호 중 하나를 입력해주세요.");return;}
    if (customer.type === "business" && !customer.clientId) {setMessage("거래처를 선택해주세요.");return;}
    if ([form.contract_amount, form.deposit_amount].some(value => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))) {setMessage("금액은 0 이상의 숫자로 입력해주세요.");return;}
    if (!companyId) {setMessage("업체 정보를 확인하지 못했습니다. 다시 열어주세요.");return;}
    checkLock.current=true;setChecking(true);
    try {
      const rows=[];
      for(let offset=0;offset<20000;offset+=500){
        const {data,error}=await supabase.from("sites").select("id,site_name,customer_name,customer_phone,address,address_detail,region,status,work_type,work_description,memo,contract_amount,deposit_amount,work_dates,schedule_date,schedule_start,schedule_end").eq("company_id",companyId).order("id").range(offset,offset+499);
        if(error)throw error;
        rows.push(...(data||[]));
        if((data||[]).length<500){
          const matches=similarRegistrationSites(rows,form);
          if(!matches.length && (!form.site_name.trim() || !form.address.trim())) {setMessage("기존 현장을 찾지 못했습니다. 새 현장은 현장명과 주소를 입력해주세요.");return;}
          setCandidates(matches);setDuplicateChoice("");setStep(2);return;
        }
      }
      throw Error("기존 현장 조회 범위를 초과했습니다. 관리자에게 문의해주세요.");
    } catch(error){setMessage("기존 현장 확인 실패: "+error.message);}
    finally{checkLock.current=false;setChecking(false);}
  }

  const blocked = busy || loading || screenshotBusy || callBusy || checking;
  const closeRegistration = useAdminOverlayBack(open, onClose, () => !blocked && (!!saved || window.confirm("현장 등록창을 닫을까요? 저장하지 않은 입력은 사라집니다.")), 1500);

  function field(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function choose(next) {
    setCustomer(next);

    setForm((previous) => registrationCustomerFields(previous, next));
  }

  function applyAnalysis(data, origin = "call") {
    if (!data || typeof data !== "object") return;
    const extractedAmounts=registrationAmountValues(data);
    const materialDraft=normalizeRegistrationDraft({materials:data.materials});

    setConsultation((previous) => {
      const next = quoteSeed(data);

      return {
        ...next,
        items: [
          ...new Map(
            [
              ...(previous?.items || []),
              ...next.items,
            ].map((item) => [JSON.stringify(item), item])
          ).values(),
        ],
        other_schedule: [
          previous?.other_schedule,
          next.other_schedule,
        ]
          .filter(Boolean)
          .filter((value, index, array) =>
            array.indexOf(value) === index
          )
          .join("\n"),
      };
    });

    setAnalysisConflicts(Object.keys(emptyForm).filter(key => !["work_dates","contract_amount","deposit_amount","source"].includes(key) && !(customer.type === "business" && ["customer_name","customer_phone"].includes(key)) && data[key] != null && String(data[key]).trim() && String(form[key] || "").trim() && String(form[key]).trim() !== String(data[key]).trim()).map(key=>({key,before:form[key],after:String(data[key]).trim()})).concat(Object.entries(extractedAmounts).filter(([key,value])=>form[key] != null && String(form[key]).trim()!=="" && Number(form[key])!==Number(value)).map(([key,value])=>({key,before:form[key],after:value}))));
    setForm((previous) => {
      const next = {
        ...previous,
        source: origin === "screenshot" ? "other" : "phone",
      };
      for (const [key,value] of Object.entries(extractedAmounts)) {
        if (previous[key] == null || String(previous[key]).trim()==='') next[key]=value;
      }

      Object.keys(emptyForm)
        .filter((key) =>
          ![
            "work_dates",
            "contract_amount",
            "deposit_amount",
          ].includes(key)
        )
        .forEach((key) => {
          if (
            customer.type === "business" &&
            ["customer_name", "customer_phone"].includes(key)
          ) {
            return;
          }

          if (
            data[key] != null &&
            String(data[key]).trim() &&
            (
              key === "source" ||
              !String(previous[key] ?? "").trim()
            )
          ) {
            next[key] = String(data[key]).trim();
          }
        });

      next.work_dates = [
        ...new Set([
          ...previous.work_dates,
          ...(
            Array.isArray(data.work_dates)
              ? data.work_dates
              : [data.date]
          )
            .filter(Boolean)
            .map(koreanDay)
            .filter(Boolean),
        ]),
      ].sort();

      // Preserve unspecified material preferences even when an earlier memo is kept.
      next.memo = normalizeRegistrationDraft({...next,materials:data.materials}).memo;
      return next;
    });

    if (Array.isArray(materialDraft.materials)) {
      setMaterials((previous) => mergeRegistrationMaterials(previous,
        materialDraft.materials
          .filter((item) =>
            item && typeof item === "object"
          )
          .map((item) => ({
            ...material(),
            ...Object.fromEntries(
              [
                "brand",
                "product_code",
                "product_name",
                "unit",
                "memo",
                "price_type",
              ]
                .filter((key) => item[key] != null)
                .map((key) => [key, String(item[key])])
            ),
          })),
      ));
    }

    setMessage("분석 내용을 반영했습니다. 현장정보를 확인해주세요.");
  }

  async function finishLink() {
    await tradeApi(pendingLink.current);
    pendingLink.current = null;

    window.dispatchEvent(new Event("trade-clients-changed"));
    setMessage("현장과 거래처 연결을 저장했습니다.");setSaveFinished(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (step < 2 && !saved) { await nextStep(); return; }

    if (lock.current || blocked) return;

    lock.current = true;
    setBusy(true);
    setMessage("");

    try {
      if (saved) {
        if (pendingLink.current) await finishLink();
        return;
      }

      if ((!duplicateChoice || duplicateChoice === "new") && (!form.site_name.trim() || !form.address.trim())) throw Error("새 현장은 현장명과 주소를 입력해주세요.");
      if (candidates.length && !duplicateChoice) throw Error("기존 현장에 상담을 추가할지, 별도 현장으로 등록할지 선택해주세요.");
      if (
        customer.type === "business" &&
        !customer.clientId
      ) {
        throw Error("거래처를 선택해주세요.");
      }

      const days = [
        ...new Set(
          (confirmed || (duplicateChoice && duplicateChoice !== "new") ? form.work_dates : [])
            .filter(Boolean)
            .map(koreanDay)
            .filter(Boolean)
        ),
      ].sort();

      if (days.length > 366) {
        throw Error(
          "시공일은 최대 366일까지 선택할 수 있습니다."
        );
      }

      let customerName = form.customer_name;
      let customerPhone = form.customer_phone;

      if (customer.type === "business") {
        const data = await tradeApi();

        const client = data.clients?.find(
          (item) => item.id === customer.clientId
        );

        const person = data.contacts?.find(
          (item) =>
            item.id === customer.contactId &&
            item.client_id === customer.clientId
        );

        if (
          !client ||
          (customer.contactId && !person)
        ) {
          throw Error(
            "거래처 또는 담당자가 변경됐습니다. 다시 선택해주세요."
          );
        }

        customerName = client.name;
        customerPhone = person?.phone || client.phone || "";
      }

      const materialError = registrationMaterialTypeError(reviewDraft.materials);
      if (materialError) {editReviewItem("materials");throw new Error(materialError);}
      const result = await createSite({
        ...reviewDraft,
        registration_flow: true,
        registration_request_id: registrationRequest.current,
        existing_site_id: duplicateChoice && duplicateChoice !== "new" ? duplicateChoice : null,
        consultation_text: consultationText,
        memo: [reviewDraft.memo, confirmed && !days.length ? "시공 확정·일정 조율 중" : ""].filter(Boolean).join("\n"),
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_type: customer.type,
        work_dates: days,
        schedule_date: days[0] || null,
        schedule_start: days.length
          ? new Date(`${days[0]}T00:00:00+09:00`).toISOString()
          : null,
        schedule_end: days.length
          ? new Date(
              `${days.at(-1)}T17:00:00+09:00`
            ).toISOString()
          : null,
        status: registrationStatus,
        consultation_quote_seed: consultation
          ? {
              ...consultation,
              work_date: days.join(", "),
            }
          : null,
        materials: reviewDraft.materials
          .filter((item) =>
            item.product_code.trim() ||
            item.product_name.trim()
          )
          .map((item) => ({
            ...item,
            quantity: 0,
            total_price:
              item.unit_price === "" ? null : 0,
          })),
        request_photos: photos,
      });

      if (result?.site?.id && (result.success || !result.merged)) {
        setSaved(result.site);

        if (customer.type === "business" && !result.merged) {
          pendingLink.current = {
            action: "link",
            siteId: result.site.id,
            clientId: customer.clientId,
            contactId: customer.contactId || null,
            revision: 0,
            requestId: crypto.randomUUID(),
          };
        }
      }

      if (!result?.success) {
        if (pendingLink.current) {
          try {
            await tradeApi(pendingLink.current);
            pendingLink.current = null;

            window.dispatchEvent(
              new Event("trade-clients-changed")
            );
          } catch {
            // 같은 요청으로 거래처 연결을 다시 시도합니다.
          }
        }

        throw Error(
          result?.error || "현장 등록에 실패했습니다."
        );
      }

      if (pendingLink.current) {
        await finishLink();
      } else {
        window.dispatchEvent(
          new Event("trade-clients-changed")
        );
        setSaveFinished(true);
        setMessage(result.merged ? "누락된 정보를 채우고 상담·자재·사진을 추가했습니다. 다른 내용은 현장 메모에서 확인해주세요." : "현장을 저장했습니다.");
      }
    } catch (error) {
      setMessage(error.message || "저장에 실패했습니다.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const selectedExisting=candidates.find(site=>site.id===duplicateChoice);
  const supplementPreview=selectedExisting ? consultationSupplement(selectedExisting,{...reviewDraft,consultation_text:consultationText}) : {filled:[],conflicts:[]};
  const summaryValue=(field,value)=>field.endsWith('_amount') ? `${Number(value).toLocaleString('ko-KR')}원 + 부가세 ${Math.round(Number(value)*.1).toLocaleString('ko-KR')}원 / 합계 ${Math.round(Number(value)*1.1).toLocaleString('ko-KR')}원` : String(value ?? '');

  if (!open) return null;

  const inputs = (items) =>
    items.map(([key, label, type = "text"]) => (
      <label key={key}>
        {label}
        <input
          type={type}
          min={type === "number" ? 0 : undefined}
          value={form[key]}
          readOnly={
            customer.type === "business" &&
            ["customer_name", "customer_phone"].includes(key)
          }
          onChange={(event) => field(key, event.target.value)}
        />
      </label>
    ));

  return (
    <div
      className="site-register-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="현장 등록"
    >
      <div className="site-register-panel" ref={panelRef}>
        <header>
          <h2>
            현장 등록
          </h2>
          <button
            type="button"
            disabled={blocked}
            onClick={closeRegistration}
          >
            닫기
          </button>
        </header>

        <form onSubmit={submit} noValidate>
          <fieldset
            disabled={blocked || !!saved}
            className="site-register-fields"
          >
            <nav className="registration-steps" aria-label="현장 등록 단계">
              <strong aria-live="polite">{step + 1} / {registrationSteps.length} · {registrationSteps[step]}</strong>
              <progress aria-label="등록 진행 단계" value={step + 1} max={registrationSteps.length} />
            </nav>
            <div hidden={step !== 0}>

            <div className="input-methods" role="group" aria-label="현장 입력 방법">
              {[["direct", "직접 입력"], ["screenshot", "문자·카톡"], ["call", "통화녹음"]].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={inputMode === value}
                  onClick={() => setInputMode(value)}>{label}</button>
              ))}
            </div>
            <p className="intro">{inputMode === "direct" ? "아는 내용만 적어주세요." : "분석 후 현장정보를 확인하세요."}</p>
            <div hidden={inputMode !== "screenshot"}>
              <ScreenshotSiteInput applyPendingRef={screenshotApplyRef} onApply={(data) => applyAnalysis(data, "screenshot")}
                disabled={busy || loading || callBusy || !!saved} onBusyChange={setScreenshotBusy} />
            </div>
            <div hidden={inputMode !== "call"}>
              <CallContentAiInput onApply={applyAnalysis}
                disabled={busy || loading || screenshotBusy || !!saved} onBusyChange={setCallBusy} />
            </div>

            {inputMode === "direct" ? (
              <label>상담내용 (선택)<textarea rows={4} placeholder="예: 방문 3개, 싱크대 필름 시공 문의" value={consultationText} onChange={event=>setConsultationText(event.target.value)} /></label>
            ) : (
              <details><summary>추가 상담 메모 (선택)</summary><label>추가 내용<textarea rows={3} value={consultationText} onChange={event=>setConsultationText(event.target.value)} placeholder="분석한 내용 외에 추가할 사항" /></label></details>
            )}
            </div>
            <div hidden={step !== 1}>
            <section data-registration-edit="site" tabIndex={-1} style={{scrollMarginTop:100}}>
              <h3>현장명과 주소</h3>
              {inputs([["site_name", "현장명"], ["address", "주소"]])}
            </section>


              <section data-registration-edit="customer" tabIndex={-1} style={{scrollMarginTop:100}}><h3>고객 · 상세주소 (선택)</h3>
              <div className="site-register-grid">
                {inputs([["address_detail", "상세주소"], ["region", "지역"]])}
              </div>
              <CustomerChoice value={customer} onChange={choose} disabled={blocked || !!saved} />
              {customer.type === "business" ? (customer.clientId && <p role="status">{form.customer_name} · {form.customer_phone || "거래처 연락처 미등록"}</p>) : <div className="site-register-grid">
                {inputs([["customer_name", customer.type === "business" ? "업체명" : "고객명"], ["customer_phone", "연락처", "tel"]])}
              </div>}
              </section>

            <section data-registration-edit="work" tabIndex={-1} style={{scrollMarginTop:100}}>
              <h3>작업 내용</h3>

              {inputs([["work_type", "시공 종류"]])}

              <label>
                상세 작업내용
                <textarea
                  rows={3}
                  value={form.work_description}
                  onChange={(event) =>
                    field("work_description", event.target.value)
                  }
                />
              </label>
            </section>

            <details className="registration-optional"><summary>현장 메모 (선택)</summary>
              <label>
                메모
                <textarea
                  rows={3}
                  value={form.memo}
                  onChange={(event) =>
                    field("memo", event.target.value)
                  }
                />
              </label>
            </details>
            <details className="registration-optional"><summary>추가 정보 입력 · 자재·사진·금액</summary>

            <section data-registration-edit="materials" tabIndex={-1} style={{scrollMarginTop:100}}>
              <h3>시공 자재 (선택)</h3>

              <button
                type="button"
                onClick={() =>
                  setMaterials((previous) => [
                    ...previous,
                    material(),
                  ])
                }
              >
                + 자재 추가
              </button>

              {materials.map((item, index) => (
                <div
                  className="site-register-material"
                  key={item.local_id}
                >
                  <strong>자재 {index + 1}</strong>

                  <button
                    type="button"
                    onClick={() =>
                      setMaterials((previous) =>
                        previous.filter((row) =>
                          row.local_id !== item.local_id
                        )
                      )
                    }
                  >
                    삭제
                  </button>

                  <MaterialFilmPicker value={item} disabled={blocked || !!saved}
                    onChange={(patch) => setMaterials((previous) => previous.map((row) =>
                      row.local_id === item.local_id ? { ...row, ...patch } : row))} />

                  <label>방염 구분 (필수)<select required value={item.price_type || ""} onChange={event => setMaterials(previous => previous.map(row => row.local_id === item.local_id ? {...row, price_type:event.target.value, unit_price:""} : row))}><option value="">선택해주세요</option><option value="fire">방염</option><option value="non_fire">비방염</option></select></label>
                  <details key={item.film_product_id || "manual"} open={!item.film_product_id}>
                  <summary>제품 정보·단가·메모 수정</summary>
                  <p className="intro">단가는 비워두면 등록된 매입단가를 적용합니다.</p>
                  {[
                    ["brand", "브랜드"],
                    ["product_name", "제품명 / 색상"],
                    ["unit_price", "원가 단가 (선택)"],
                    ["memo", "자재 메모"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        type={
                          key === "unit_price"
                            ? "number"
                            : "text"
                        }
                        min={key === "unit_price" ? 0 : undefined}
                        value={item[key]}
                        onChange={(event) =>
                          setMaterials((previous) =>
                            previous.map((row) =>
                              row.local_id === item.local_id
                                ? {
                                    ...row,
                                    [key]: event.target.value,
                                    ...(key === "brand" ? { film_product_id: null } : {}),
                                  }
                                : row
                            )
                          )
                        }
                      />
                    </label>
                  ))}

                  <label>
                    단위
                    <select
                      value={item.unit}
                      onChange={(event) =>
                        setMaterials((previous) =>
                          previous.map((row) =>
                            row.local_id === item.local_id
                              ? {
                                  ...row,
                                  unit: event.target.value,
                                }
                              : row
                          )
                        )
                      }
                    >
                      <option value="m">m</option>
                      <option value="m2">㎡</option>
                      <option value="roll">롤</option>
                      <option value="ea">개</option>
                    </select>
                  </label>
                  </details>
                </div>
              ))}
            </section>


            <section data-registration-edit="photos" tabIndex={-1} style={{scrollMarginTop:100}}>
              <h3>현장 사진 (선택)</h3>

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const selected = Array.from(
                    event.target.files || []
                  ).filter((file) =>
                    file.type.startsWith("image/")
                  );

                  setPhotos((previous) => [
                    ...previous,
                    ...selected,
                  ]);

                  event.target.value = "";
                }}
              />

              <div className="site-register-grid">
                {previews.map((item, index) => (
                  <div key={item.url}>
                    <img
                      src={item.url}
                      alt={`요청사진 ${index + 1}`}
                      style={{
                        width: "100%",
                        height: 140,
                        objectFit: "cover",
                      }}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setPhotos((previous) =>
                          previous.filter(
                            (_, photoIndex) =>
                              index !== photoIndex
                          )
                        )
                      }
                    >
                      사진 삭제
                    </button>
                  </div>
                ))}
              </div>
            </section>


            <section data-registration-edit="amount" tabIndex={-1} style={{scrollMarginTop:100}}>
              <h3>계약 금액 (선택)</h3>

              <div className="site-register-grid">
                {inputs([
                  ["contract_amount", "계약금액", "number"],
                  ["deposit_amount", "계약금 / 선금", "number"],
                ])}
              </div>

              <label>
                접수 경로
                <select
                  value={form.source}
                  onChange={(event) =>
                    field("source", event.target.value)
                  }
                >
                  {[
                    ["phone", "전화"],
                    ["ai_estimate", "AI 견적"],
                    ["lead", "고객 상담"],
                    ["direct", "직접 등록"],
                    ["other", "기타"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </section>


            </details>
            {analysisConflicts.length>0 && <section><h3>상담 분석 내용이 기존 입력과 다릅니다</h3><p>기존 입력을 유지했습니다. 바꿀 항목만 선택해주세요.</p>{analysisConflicts.map(item=><div className="review-row" key={item.key}><p>{item.before} → {item.after}</p><button type="button" onClick={()=>{field(item.key,item.after);setAnalysisConflicts(rows=>rows.filter(row=>row.key!==item.key));}}>분석값 적용</button></div>)}</section>}
            </div>
            <div hidden={step !== 2}>
              {candidates.length>0 && <section><h3>같은 현장인지 확인해주세요</h3><p className="intro">같은 현장이면 빈 항목을 채우고 새 내용을 추가합니다.</p>{candidates.map(candidate=><button className="duplicate-option" type="button" key={candidate.id} aria-pressed={duplicateChoice===candidate.id} onClick={()=>setDuplicateChoice(candidate.id)}>{candidate.site_name || candidate.customer_name} · {[candidate.address,candidate.address_detail].filter(Boolean).join(" ")}<br/>이 현장에 상담 추가</button>)}<button className="duplicate-option" type="button" aria-pressed={duplicateChoice==="new"} onClick={()=>setDuplicateChoice("new")}>별도 공사입니다 · 새 현장으로 등록</button></section>}
              {(!duplicateChoice || duplicateChoice==="new") && <section data-registration-edit="dates" tabIndex={-1} style={{scrollMarginTop:100}}><h3>어떤 상태로 저장할까요?</h3><div className="input-methods"><button type="button" aria-pressed={!confirmed} onClick={()=>{setConfirmed(false);setNextAction("quote");}}>상담중</button><button type="button" aria-pressed={confirmed} onClick={()=>{setConfirmed(true);setNextAction("schedule");}}>시공확정</button></div>{confirmed && <><WorkDatePicker value={form.work_dates} onChange={value=>field("work_dates",value)} disabled={blocked || !!saved}/><p className="intro">날짜 미정이면 상담중으로 저장하고 ‘시공 확정·일정 조율 중’ 메모를 남깁니다.</p></>}<label>저장 후 할 일<select value={nextAction} onChange={event=>setNextAction(event.target.value)}><option value="quote">부위별 견적서 작성</option><option value="schedule">일정·시공자 배정</option><option value="info">현장 보기</option></select></label></section>}

              {duplicateChoice && duplicateChoice!=="new" ? <section><h3>기존 현장에 추가할 내용</h3>
                <p>빈 항목은 채우고, 기존 값이 다르면 확인 메모로 남깁니다.</p>
                {supplementPreview.filled.map(item=><div className="review-row" key={item.field}><strong>{item.label}</strong><span>{summaryValue(item.field,item.value)}</span></div>)}
                {[['작업 내용', [form.work_type,form.work_description,consultationText,reviewDraft.memo].filter(Boolean).join('\n')],
                  ['견적 항목',consultation?.items?.map(row=>[row.name,row.detail].filter(Boolean).join(' · ')).join('\n')],
                  ['자재',reviewDraft.materials.filter(m=>m.product_code||m.product_name).map(m=>[m.brand,m.product_code,m.price_type==='fire'?'방염':m.price_type==='non_fire'?'비방염':'방염 구분 확인 필요'].filter(Boolean).join(' · ')).join('\n')],
                  ['사진',photos.length ? `${photos.length}장 추가` : '']].filter(([,value])=>value).map(([label,value])=><div className="review-row" key={label}><strong>{label}</strong><p style={{whiteSpace:'pre-wrap'}}>{value}</p></div>)}
                {supplementPreview.conflicts.length>0 && <details><summary>기존 정보와 다른 내용 {supplementPreview.conflicts.length}개</summary>{supplementPreview.conflicts.map(item=><p key={item.field}>{item.label}: {summaryValue(item.field,item.before)} → {summaryValue(item.field,item.after)}<br/>기존 값을 유지하고 메모에 남깁니다.</p>)}</details>}
              </section> : <section>
                <h3>저장 전 확인</h3>

                {[
                  ["현장·주소", [form.site_name, form.address, form.address_detail, form.region].filter(Boolean).join(" · "), "site"],
                  ["시공 날짜", confirmed && form.work_dates.length ? form.work_dates.join(", ") : "일정 미정", "dates"],
                  ["고객", [form.customer_name, form.customer_phone].filter(Boolean).join(" · ") || "미입력", "customer"],
                  ["작업 내용", [form.work_type, form.work_description, reviewDraft.memo].filter(Boolean).join("\n") || "미입력", "work"],
                  ["시공 자재", reviewDraft.materials.filter(m=>m.product_code.trim()||m.product_name.trim()).map(m=>[m.brand,m.product_code,m.product_name,m.price_type==='fire'?'방염':m.price_type==='non_fire'?'비방염':'방염 구분 확인 필요'].filter(Boolean).join(" ")).join("\n") || "미정 · 나중에 등록", "materials"],
                  ["현장 사진", photos.length + "장", "photos"],
                  ["계약 금액", "계약금액 " + (form.contract_amount === "" ? "미정" : Number(form.contract_amount).toLocaleString("ko-KR")+"원") + " / 선금 " + (form.deposit_amount === "" ? "미정" : Number(form.deposit_amount).toLocaleString("ko-KR")+"원"), "amount"],
                ].map(([label,value,target])=><div className="review-row" key={label}>
                  <div><strong>{label}</strong><p>{value}</p></div>
                  <button type="button" aria-label={`${label} 수정`} onClick={()=>editReviewItem(target)}>수정</button>
                </div>)}
                <p>저장 상태: <strong>{registrationStatus === "scheduled" ? "시공 예정" : "상담 중"}</strong></p>
              </section>}
            </div>
          </fieldset>

          {message && (
            <p
              role="alert"
              style={{
                whiteSpace: "pre-wrap",
                color: "#b91c1c",
              }}
            >
              {message}
            </p>
          )}

          {saved && (
            <p>
              현장은 이미 등록됐습니다. 다시 등록하지 마세요.{" "}
              {pendingLink.current
                ? "아래 버튼으로 거래처 연결만 다시 시도하세요."
                : "현장 상세에서 추가정보를 확인해주세요."}
            </p>
          )}

          {saved && !pendingLink.current && <section style={{padding:16}}><h3>{saveFinished ? "저장 완료" : "현장은 등록됐습니다 · 후속 저장 내역 확인 필요"}</h3><a data-ui-link="action" href={`/admin?${new URLSearchParams({tab:"sites",site:saved.id,section:duplicateChoice && duplicateChoice!=="new" ? "info" : nextAction,...(nextAction === "quote" ? {quoteType:"area"} : {})})}`}>{duplicateChoice && duplicateChoice!=="new" ? "현장 보기" : nextAction === "quote" ? "부위별 견적서 작성" : nextAction === "schedule" ? "일정·시공자 배정" : "현장 보기"} →</a></section>}
          <footer>
            <div className="save-summary"><strong>{duplicateChoice && duplicateChoice!=="new" ? "기존 현장에 상담 추가" : registrationStatus === "scheduled" ? "시공 예정" : "상담 중"}</strong><span>{duplicateChoice && duplicateChoice!=="new" ? "기존 현장 상태 유지" : confirmed && form.work_dates.length ? `시공일 ${form.work_dates.length}일 선택` : "일정 미정"}</span></div>
            {step > 0 && !saved && <button type="button" disabled={blocked} onClick={()=>{setMessage("");setStep(current=>current-1);}}>이전</button>}
            {step === 1 && <p className="intro">새 현장: 현장명·주소 / 기존 현장: 전화번호로도 검색</p>}
            {step === 2 && confirmed && !form.work_dates.length && <p className="intro">날짜 미정으로 저장할 수 있습니다. 일정은 현장 상세에서 나중에 정해주세요.</p>}
            {(!saved || pendingLink.current) && (
              <button type="submit" disabled={blocked}>
                {blocked
                  ? (screenshotBusy || callBusy ? "AI 분석 중…" : checking ? "기존 현장 확인 중…" : "저장 중…")
                  : saved
                    ? "거래처 연결 재시도"
                    : step === 2 ? (duplicateChoice && duplicateChoice!=="new" ? "상담 추가 저장" : "확인 완료 · 현장 저장") : "다음 · " + registrationSteps[step + 1]}
              </button>
            )}
          </footer>
        </form>
      </div>

      <style jsx>{`
        .registration-optional > summary { padding: 14px 0; min-height:44px; cursor:pointer; font-weight:700; }
        .duplicate-option { display:block; width:100%; text-align:left; white-space:normal; margin:8px 0; }
        .duplicate-option[aria-pressed=true] { background:#285340; color:white; }

        .site-register-overlay {
          position: fixed;
          inset: 0;
          background: #0008;
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
        }
        .site-register-panel {
          background: #f7f5ee;
          border-radius: 20px;
          width: 100%;
          max-width: 760px;
          height: 94dvh;
          overflow: auto;
          overscroll-behavior: contain;
          color: #253e4d;
          padding: 0 20px;
          box-sizing: border-box;
        }
        header, footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        header {
          position: sticky;
          top: 0;
          background: #f7f5ee;
          z-index: 2;
          padding: 18px 0;
        }
        h2 {
          margin: 0;
        }
        h3 {
          margin-top: 0;
        }
        .site-register-fields {
          border: 0;
          padding: 0;
          margin: 0;
          min-width: 0;
        }
        section {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 16px;
          margin: 16px 0;
        }
        .site-register-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .site-register-material {
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 12px;
          margin-top: 12px;
        }
        .site-register-panel :global(label) {
          display: block;
          margin: 10px 0;
          font-weight: 700;
        }
        .site-register-panel :global(input:not([type="radio"])),
        .site-register-panel :global(select),
        .site-register-panel :global(textarea) {
          display: block;
          box-sizing: border-box;
          width: 100%;
          padding: 12px;
          margin-top: 6px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          font-size: 16px;
          background: white;
          color: #111827;
        }
        button {
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: white;
          cursor: pointer;
        }
        button:disabled {
          opacity: .5;
          cursor: default;
        }
        button[type="submit"] {
          background: #243648;
          color: white;
        }
        p {
          line-height: 1.6;
        }
        footer {
          position: sticky;
          bottom: 0;
          display: grid;
          background: #f7f5ee;
          border-top: 1px solid #e4e2d9;
          padding: 14px 0 max(14px, env(safe-area-inset-bottom));
          z-index: 3;
        }
        .registration-steps { display: grid; gap: 8px; margin: 6px 0 16px; font-size: 15px; }
        .registration-steps progress { width: 100%; height: 8px; accent-color: #2563eb; }
        .review-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
        .review-row p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
        .review-row button { flex-shrink: 0; }
        .registration-steps span { flex: 1; padding: 10px 4px; text-align: center; border-radius: 9px; background: #eae8e0; color: #657078; }
        .registration-steps span[aria-current="step"] { background: #dbeafe; color: #1d4ed8; font-weight: 800; }
        .site-register-fields > div[hidden] { display: none; }
        .input-methods { display: flex; gap: 4px; background: #eae8e0; padding: 5px; border-radius: 16px; }
        .input-methods button { flex: 1; border: 0; background: transparent; color: #657078; font-weight: 700; padding: 14px 4px; }
        .input-methods button[aria-pressed="true"] { background: white; color: #253e4d; box-shadow: 0 2px 6px #253e4d10; }
        .intro { font-size: 14px; color: #66727c; margin: 12px 0; }
        .status-options { display: flex; gap: 10px; }
        .status-options button { flex: 1; font-weight: 700; }
        .status-options button[aria-pressed="true"] { background: #eaf3ff; border-color: #548ac0; color: #285c94; }
        .additional-info { margin: 20px 0; background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 18px; }
        summary { cursor: pointer; font-weight: 700; line-height: 1.8; }
        summary span { display: block; font-size: 13px; color: #68757e; font-weight: 400; }
        .save-summary { display: flex; justify-content: space-between; font-size: 14px; }
        .save-summary span { color: #68757e; }
        footer button { width: 100%; min-height: 54px; font-size: 18px; font-weight: 700; border-radius: 14px; }
        .site-register-panel :global(input[type="file"]::file-selector-button) { border: 0; border-radius: 10px; background: #eaf3ff; color: #285c94; padding: 12px; margin-right: 10px; font-weight: 700; cursor: pointer; }
        button:focus-visible, summary:focus-visible { outline: 3px solid #548ac0; outline-offset: 3px; }
        @media (max-width: 600px) {
          .site-register-overlay { padding: 0; }
          .site-register-panel { height: 100dvh; max-height: 100dvh; border-radius: 0; padding: 0 16px; }
          header { padding-top: max(16px, env(safe-area-inset-top)); }
          h2 { font-size: 24px; }
          section { padding: 16px; }
        }
      `}</style>
    </div>
  );
                    }


