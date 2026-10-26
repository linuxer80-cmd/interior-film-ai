"use client";
import useSiteDraft from "../hooks/useSiteDraft";
import SiteDirections from "../../worker/SiteDirections";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  formatWon,
  getLeader,
  getMembers,
} from "./siteDetailUtils";

/* =========================================================
   값 처리
========================================================= */

function valueOrEmpty(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
}

function hasAmount(value) {
  return !(
    value === null ||
    value === undefined ||
    value === ""
  );
}

/* =========================================================
   현장 기본정보
========================================================= */

const statusOptions = [["consulting","상담 중"],["scheduled","시공 예정"],["in_progress","시공 중"],["completed","완료"],["cancelled","취소"]];
const basicFields = ["status","customer_name", "customer_phone", "site_name", "address", "address_detail", "region", "work_type", "work_description", "contract_amount", "deposit_amount", "memo"];
const basicDraft = site => Object.fromEntries(basicFields.map(key => [key, valueOrEmpty(key === "status" ? site?.status || "consulting" : site?.[key])]));

export default function SiteBasicInfo({
  site,
  updateSiteBasicInfo,
  materialSummary,
  onEditSchedule,
  editRequest = 0,
  onDraftState,
  onRequestDiscard,
  onEditingChange,
}) {
  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    form,
    setForm,
  ] = useState({
    status: "consulting",
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

    memo: "",
  });

  const baseline = useRef(basicDraft(site));
  const dirty = editing && JSON.stringify(form) !== JSON.stringify(baseline.current);
  useEffect(() => { onEditingChange?.(editing || saving); return () => onEditingChange?.(false); }, [editing, saving, onEditingChange]);
  useSiteDraft(onDraftState, "basic", {
    label: "현장 기본정보", dirty, pending: saving, discard: cancelEditing,
  });

  /* =======================================================
     현장 정보 → 수정폼 동기화
  ======================================================= */

  useEffect(() => {
    if (!site || editing || saving) {
      return;
    }

    baseline.current = basicDraft(site);
    setForm(baseline.current);
  }, [
    site?.id,
    site?.status,
    site?.customer_name,
    site?.customer_phone,
    site?.site_name,
    site?.address,
    site?.address_detail,
    site?.region,
    site?.work_type,
    site?.work_description,
    site?.contract_amount,
    site?.deposit_amount,
    site?.memo,
  ]);

  // Open only for a new explicit request; preserve an existing edit draft.
  useEffect(() => {
    if (site && editRequest && !editing && !saving) startEditing();
  }, [editRequest]);

  if (!site) {
    return null;
  }

  const leader =
    getLeader(site);

  const members =
    getMembers(site);

  const memberNames =
    members
      .map(
        (item) =>
          item?.workers?.name,
      )
      .filter(Boolean)
      .join(", ");

  const fullAddress = [
    site.address,
    site.address_detail,
  ]
    .filter(Boolean)
    .join(" ");

  /* =======================================================
     입력 변경
  ======================================================= */

  function updateField(
    field,
    value,
  ) {
    setForm(
      (prev) => ({
        ...prev,
        [field]: value,
      }),
    );
  }

  /* =======================================================
     수정 시작
  ======================================================= */

  function startEditing() {
    baseline.current = basicDraft(site);
    setForm(baseline.current);

    setMessage("");
    setEditing(true);
  }

  /* =======================================================
     수정 취소
  ======================================================= */

  function cancelEditing() {
    if (saving) {
      return;
    }

    baseline.current = basicDraft(site);
    setForm(baseline.current);

    setMessage("");
    setEditing(false);
  }

  /* =======================================================
     저장
  ======================================================= */

  async function saveBasicInfo(
    event,
  ) {
    event.preventDefault();

    if (
      typeof updateSiteBasicInfo !==
      "function"
    ) {
      setMessage(
        "❌ 기본정보 저장 기능이 연결되지 않았습니다.",
      );

      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const result =
        await updateSiteBasicInfo({
          siteId:
            site.id,
          status: form.status,
          expectedStatus: baseline.current.status,

          customer_name:
            form.customer_name,

          customer_phone:
            form.customer_phone,

          site_name:
            form.site_name,

          address:
            form.address,

          address_detail:
            form.address_detail,

          region:
            form.region,

          work_type:
            form.work_type,

          work_description:
            form.work_description,

          contract_amount:
            form.contract_amount,

          deposit_amount:
            form.deposit_amount,

          memo:
            form.memo,
        });

      if (
        !result?.success
      ) {
        setMessage(
          `❌ ${
            result?.error ||
            "저장에 실패했습니다."
          }`,
        );

        return;
      }

      setMessage(
        "✅ 기본정보가 저장되었습니다.",
      );

      baseline.current = { ...form };
      setEditing(false);
    } catch (error) {
      console.error(
        "현장 기본정보 저장 오류:",
        error,
      );

      setMessage(
        `❌ ${
          error?.message ||
          "저장 중 오류가 발생했습니다."
        }`,
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     조회 화면
  ======================================================= */

  const workDates = Array.isArray(site.work_dates)
      ? [...new Set(site.work_dates.filter(Boolean))].sort()
      : [];
    const scheduleLabel = workDates.length
      ? workDates.join(" · ")
      : site.schedule_start
        ? `${site.schedule_start}${site.schedule_end && site.schedule_end !== site.schedule_start ? ` ~ ${site.schedule_end}` : ""}`
        : site.schedule_date || "미정";
  if (!editing) {
    return (
      <section
        style={{
          marginTop: "14px",
          paddingTop: "14px",
          borderTop:
            "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "10px",
            marginBottom: "4px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: "900",
              color: "#111827",
            }}
          >
            👤 현장 기본정보
          </div>

          <button
            type="button"
            onClick={
              startEditing
            }
            style={{
              flex: "0 0 auto",
              padding:
                "7px 10px",
              border:
                "1px solid #cbd5e1",
              borderRadius:
                "8px",
              background:
                "#ffffff",
              color:
                "#334155",
              fontSize:
                "12px",
              fontWeight:
                "800",
              cursor:
                "pointer",
            }}
          >
            현장정보 수정
          </button>
        </div>

        {message && (
          <MessageBox
            message={
              message
            }
          />
        )}

        <DetailRow label="시공일" value={<><span>{scheduleLabel}</span>{onEditSchedule && <button type="button" onClick={onEditSchedule} style={{...inputStyle,marginTop:8,color:"#285340",fontWeight:800,cursor:"pointer"}}>시공 일정 변경 →</button>}</>} />

        <DetailRow
          label="고객"
          value={
            site.customer_name ||
            "미정"
          }
        />

        <DetailRow
          label="전화번호"
          value={
            site.customer_phone
              ? <a href={`tel:${site.customer_phone.replace(/[^+0-9]/g, "")}`} style={{ color: "#285340", textDecoration: "underline", display: "inline-flex", alignItems: "center", minHeight: 44 }}>{site.customer_phone} · 전화</a>
              : "미정"
          }
        />

        <DetailRow
          label="주소"
          value={<SiteDirections site={{...site,site_id:site.id}} navigationOnly />}
        />

        <details style={{ marginTop: 10 }}>
          <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: "#315d49", fontWeight: 800 }}>작업 내용·금액 자세히 보기 ▾</summary>
        <DetailRow
          label="현장명"
          value={
            site.site_name ||
            "미정"
          }
        />

        <DetailRow
          label="지역"
          value={
            site.region ||
            "미정"
          }
        />

        <DetailRow
          label="시공 종류"
          value={
            site.work_type ||
            "미정"
          }
        />

        <DetailRow
          label="작업 내용"
          value={
            site.work_description ||
            "미정"
          }
        />

        <DetailRow
          label="계약금액"
          value={
            hasAmount(
              site.contract_amount,
            )
              ? formatWon(
                  site.contract_amount,
                )
              : "미정"
          }
        />

        <DetailRow
          label="계약금 / 선금"
          value={
            hasAmount(
              site.deposit_amount,
            )
              ? formatWon(
                  site.deposit_amount,
                )
              : "미정"
          }
        />

        <DetailRow
          label="팀장"
          value={
            leader?.workers?.name ||
            "미배정"
          }
        />

        <DetailRow
          label="담당자"
          value={
            memberNames ||
            "미배정"
          }
        />

        {materialSummary && <DetailRow label="자재" value={materialSummary} />}

        <DetailRow
          label="메모"
          value={
            site.memo ||
            "미정"
          }
        />
        </details>
      </section>
    );
  }

  /* =======================================================
     수정 화면
  ======================================================= */

  return (
    <section
      style={{
        marginTop: "14px",
        paddingTop: "14px",
        borderTop:
          "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: "900",
          color: "#111827",
          marginBottom: "10px",
        }}
      >
        현장정보 수정
      </div>

      <p style={{ color: "#65766b", fontSize: 13 }}>이 영역은 ‘기본정보 저장’으로 저장합니다. 거래처는 별도의 ‘거래처 연결’ 영역에서 저장합니다.</p>
      <p role="status" style={{ color: "#315d49", fontSize: 13 }}>{saving ? "기본정보 저장 중…" : dirty ? "기본정보 · 저장하지 않은 변경이 있습니다." : "기본정보 · 변경 사항 없음"}</p>
      {onEditSchedule && <div style={{padding:14,margin:"14px 0",border:"1px solid #d9e2d8",borderRadius:14,background:"#eef4ec"}}>
        <strong style={{display:"block",color:"#285340"}}>시공 일정</strong>
        <p style={{margin:"8px 0",lineHeight:1.7}}>{scheduleLabel}</p>
        <button type="button" onClick={onEditSchedule} disabled={saving} style={{...inputStyle,color:"#285340",fontWeight:800,cursor:"pointer"}}>시공 일정 변경 →</button>
        <p style={{margin:"8px 0 0",fontSize:13,color:"#53665a"}}>날짜 선택 화면에서 시공일을 추가·변경·삭제할 수 있습니다. 기본정보를 수정했다면 먼저 저장해주세요.</p>
      </div>}
      <form
        onSubmit={
          saveBasicInfo
        }
      >
        <Field label="현장 상태">
          <select aria-label="현장 상태" value={form.status} onChange={event=>updateField("status",event.target.value)} disabled={saving} style={inputStyle}>
            {statusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        {form.status === "completed" && <p style={{fontSize:13,color:"#65766b"}}>현장 상태만 완료로 변경합니다. 완료보고서 제출·검수는 별도로 진행해주세요.</p>}
        {form.status === "cancelled" && <p style={{fontSize:13,color:"#9a4939"}}>저장하면 취소 현장으로 이동합니다. 배정된 시공자에게 취소 안내가 발송될 수 있습니다.</p>}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: "8px",
          }}
        >
          <Field
            label="고객명"
          >
            <input
              type="text"
              value={
                form.customer_name
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "customer_name",
                  event.target
                    .value,
                )
              }
              placeholder="미정"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>

          <Field
            label="전화번호"
          >
            <input
              type="tel"
              value={
                form.customer_phone
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "customer_phone",
                  event.target
                    .value,
                )
              }
              placeholder="010-0000-0000"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>
        </div>

        <Field
          label="현장명"
        >
          <input
            type="text"
            value={
              form.site_name
            }
            onChange={(
              event,
            ) =>
              updateField(
                "site_name",
                event.target
                  .value,
              )
            }
            placeholder="예: 검단 ○○아파트"
            disabled={
              saving
            }
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="주소"
        >
          <input
            type="text"
            value={
              form.address
            }
            onChange={(
              event,
            ) =>
              updateField(
                "address",
                event.target
                  .value,
              )
            }
            placeholder="현장 주소"
            disabled={
              saving
            }
            style={
              inputStyle
            }
          />
        </Field>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: "8px",
          }}
        >
          <Field
            label="상세주소"
          >
            <input
              type="text"
              value={
                form.address_detail
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "address_detail",
                  event.target
                    .value,
                )
              }
              placeholder="동 / 호수"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>

          <Field
            label="지역"
          >
            <input
              type="text"
              value={
                form.region
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "region",
                  event.target
                    .value,
                )
              }
              placeholder="예: 인천 서구"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>
        </div>

        <Field
          label="시공 종류"
        >
          <input
            type="text"
            value={
              form.work_type
            }
            onChange={(
              event,
            ) =>
              updateField(
                "work_type",
                event.target
                  .value,
              )
            }
            placeholder="예: 아파트 인테리어필름"
            disabled={
              saving
            }
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="작업 내용"
        >
          <textarea
            value={
              form.work_description
            }
            onChange={(
              event,
            ) =>
              updateField(
                "work_description",
                event.target
                  .value,
              )
            }
            placeholder="예: 싱크대, 방문·문틀, 신발장"
            disabled={
              saving
            }
            rows={3}
            style={{
              ...inputStyle,
              resize:
                "vertical",
              lineHeight:
                "1.5",
            }}
          />
        </Field>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: "8px",
          }}
        >
          <Field
            label="계약금액"
          >
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={
                form.contract_amount
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "contract_amount",
                  event.target
                    .value,
                )
              }
              placeholder="미정"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>

          <Field
            label="계약금 / 선금"
          >
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={
                form.deposit_amount
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "deposit_amount",
                  event.target
                    .value,
                )
              }
              placeholder="미정"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>
        </div>

        <Field
          label="메모"
        >
          <textarea
            value={
              form.memo
            }
            onChange={(
              event,
            ) =>
              updateField(
                "memo",
                event.target
                  .value,
              )
            }
            placeholder="상담 내용이나 현장 메모"
            disabled={
              saving
            }
            rows={4}
            style={{
              ...inputStyle,
              resize:
                "vertical",
              lineHeight:
                "1.5",
            }}
          />
        </Field>

        {message && (
          <MessageBox
            message={
              message
            }
          />
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: "8px",
            marginTop: "12px",
          }}
        >
          <button
            type="button"
            onClick={() => onRequestDiscard ? onRequestDiscard("basic", cancelEditing) : (!dirty || window.confirm("기본정보 변경을 취소할까요?")) && cancelEditing()}
            disabled={
              saving
            }
            style={{
              padding:
                "11px 12px",
              border:
                "1px solid #cbd5e1",
              borderRadius:
                "9px",
              background:
                "#ffffff",
              color:
                "#475569",
              fontSize:
                "13px",
              fontWeight:
                "800",
              cursor:
                saving
                  ? "not-allowed"
                  : "pointer",
              opacity:
                saving
                  ? 0.6
                  : 1,
            }}
          >
            기본정보 변경 취소
          </button>

          <button
            type="submit"
            disabled={
              saving
            }
            style={{
              padding:
                "11px 12px",
              border:
                "none",
              borderRadius:
                "9px",
              background:
                "#2563eb",
              color:
                "#ffffff",
              fontSize:
                "13px",
              fontWeight:
                "900",
              cursor:
                saving
                  ? "not-allowed"
                  : "pointer",
              opacity:
                saving
                  ? 0.65
                  : 1,
            }}
          >
            {saving
              ? "기본정보 저장 중…"
              : "기본정보 저장"}
          </button>
        </div>
      </form>
    </section>
  );
}

/* =========================================================
   입력 필드
========================================================= */

function Field({
  label,
  children,
}) {
  return (
    <div
      style={{
        marginTop: "9px",
      }}
    >
      <label
        style={{
          display: "block",
          marginBottom: "5px",
          color: "#475569",
          fontSize: "12px",
          fontWeight: "800",
        }}
      >
        {label}
      </label>

      {children}
    </div>
  );
}

/* =========================================================
   상세정보 한 줄
========================================================= */

function DetailRow({
  label,
  value,
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "90px 1fr",
        gap: "10px",
        padding: "10px 0",
        borderBottom:
          "1px solid #f1f5f9",
        fontSize: "13px",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontWeight: "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#111827",
          fontWeight: "700",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value || "미정"}
      </div>
    </div>
  );
}

/* =========================================================
   메시지
========================================================= */

function MessageBox({
  message,
}) {
  const success =
    message.startsWith("✅");

  return (
    <div
      role={success ? "status" : "alert"}
      style={{
        marginTop: "10px",
        padding: "9px 10px",
        borderRadius: "8px",
        background:
          success
            ? "#f0fdf4"
            : "#fef2f2",
        color:
          success
            ? "#166534"
            : "#b91c1c",
        fontSize: "12px",
        fontWeight: "700",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {message}
    </div>
  );
}

/* =========================================================
   공통 입력 스타일
========================================================= */

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  border:
    "1px solid #cbd5e1",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
  outline: "none",
};

