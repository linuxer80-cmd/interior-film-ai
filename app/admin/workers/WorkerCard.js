"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const AttendancePage = dynamic(
  () => import("../../components/AttendancePage"),
  {
    loading: () => (
      <p role="status">
        출퇴근 화면을 불러오는 중입니다…
      </p>
    ),
  }
);

export default function WorkerCard({
  worker,
  compact = false,
  expanded = false,
  onToggle,
  relationshipType = null,
  inviteLoading = false,
  onInvite,
  onLinkSelf,
  onEdit,
  onSaveMemo,
  onActiveChange,
}) {
  const [attendanceOpen, setAttendanceOpen] = useState(false);

  const phoneNumber = String(worker?.phone || "").trim().replace(/[^0-9+]/g, "");
  const callablePhone = /^\+?\d{7,15}$/.test(phoneNumber);

  const [memoOpen, setMemoOpen] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoBusy, setMemoBusy] = useState(false);
  const [memoError, setMemoError] = useState("");
  async function saveMemo() {
    if (memoBusy) return;
    setMemoBusy(true); setMemoError("");
    try { await onSaveMemo(memoDraft); setMemoOpen(false); }
    catch (error) { setMemoError(error.message || "메모를 저장하지 못했습니다."); }
    finally { setMemoBusy(false); }
  }
  const active = worker?.is_active !== false;
  const accountLinked = Boolean(worker?.user_id);

  const specialties = Array.isArray(worker?.specialties)
    ? worker.specialties
    : [];

  if (compact && !expanded) {
    return (
      <button type="button" onClick={onToggle} aria-expanded={false}
        style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
          textAlign:"left",gap:10,padding:"13px 14px",background:"#fff",
          border:"1px solid #e2e8f0",borderRadius:12,color:"#163153",minHeight:65}}>
        <span style={{display:"grid",gap:5,minWidth:0}}>
          <strong style={{fontSize:15}}>{worker.name}</strong>
          <span style={{fontSize:12,color:"#64748b"}}>
            {relationshipType==="employee"?"소속 직원":relationshipType==="freelancer"?"협력 프리랜서":"관계 미설정"}
            {" · "}{accountLinked?"계정 연결":"계정 미연결"}
            {!active?" · 근무 중지":""}
          </span>
        </span>
        <span style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <span style={{fontSize:13,fontWeight:700}}>{Number(worker.daily_wage||0).toLocaleString("ko-KR")}원</span>
          <span aria-hidden="true">⌄</span>
        </span>
      </button>
    );
  }

  return (
    <div
      role={compact ? "dialog" : undefined}
      aria-modal={compact ? true : undefined}
      aria-label={compact ? `${worker.name} 시공자 상세 관리` : undefined}
      onClick={compact ? onToggle : undefined}
      style={compact ? {
        position:"fixed",inset:0,zIndex:1300,background:"rgba(15,23,42,.65)",
        display:"flex",alignItems:"center",justifyContent:"center",
        overflow:"hidden",padding:"12px",boxSizing:"border-box"
      } : {
        padding: "13px",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        background: active ? "#ffffff" : "#f8fafc",
        opacity: active ? 1 : 0.7,
      }}
    >
      <div onClick={event=>event.stopPropagation()}
        style={{position:"relative",width:"100%",maxWidth:580,maxHeight:"calc(100dvh - 24px)",overflowY:"auto",overscrollBehavior:"contain",background:"#fff",borderRadius:18,padding:16,boxSizing:"border-box"}}>
        {compact && <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
          <button type="button" onClick={onToggle} aria-label="시공자 상세 관리 닫기"
            style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
              width:42,height:42,flexShrink:0,border:0,background:"#f1f5f9",
              borderRadius:12,fontSize:22,cursor:"pointer",color:"#334155"}}>×</button>
        </div>}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <div
          style={{
            minWidth: 0,
            flex: "1 1 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "6px",
            }}
          >
            <button
              type="button"
              aria-expanded={attendanceOpen}
              onClick={() =>
                setAttendanceOpen((value) => !value)
              }
              style={{
                border: 0,
                padding: "8px 0",
                minHeight: 44,
                background: "transparent",
                color: "#163153",
                fontSize: 16,
                fontWeight: 800,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {worker?.name || "시공자"} · 출퇴근 보기 ›
            </button>

            {worker?.position && (
              <span
                style={{
                  padding: "3px 7px",
                  borderRadius: "999px",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontSize: "10px",
                  fontWeight: "800",
                }}
              >
                {worker.position}
              </span>
            )}

            {!active && (
              <span
                style={{
                  padding: "3px 7px",
                  borderRadius: "999px",
                  background: "#f1f5f9",
                  color: "#64748b",
                  fontSize: "10px",
                  fontWeight: "800",
                }}
              >
                비활성
              </span>
            )}
          </div>

          {worker?.phone && (
            callablePhone ? (
              <a
                href={`tel:${phoneNumber}`}
                aria-label={`${worker?.name || "시공자"}님에게 전화 걸기 ${worker.phone}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 44,
                  marginTop: 6,
                  color: "#285c94",
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "underline",
                  textUnderlineOffset: 4,
                  overflowWrap: "anywhere",
                }}
              >
                📞 전화 걸기 · {worker.phone}
              </a>
            ) : (
              <div style={{ marginTop: 6, color: "#475569", fontSize: 12 }}>
                📞 {worker.phone}
              </div>
            )
          )}

          <div
            style={{
              marginTop: 9,
              display: "grid",
              gap: 4,
              fontSize: 12,
              color: "#475569",
            }}
          >
            <span>
              기본 일당{" "}
              <strong>
                {worker?.daily_wage == null
                  ? "미설정"
                  : `${Number(worker.daily_wage).toLocaleString("ko-KR")}원`}
              </strong>
            </span>
          </div>

          <div style={{ marginTop: "8px" }}>
            {accountLinked ? (
              <span
                style={{
                  display: "inline-block",
                  padding: "5px 8px",
                  borderRadius: "999px",
                  background: "#f0fdf4",
                  color: "#166534",
                  fontSize: "10px",
                  fontWeight: "800",
                }}
              >
                ✅ 계정 연결됨
              </span>
            ) : (
              <span
                style={{
                  display: "inline-block",
                  padding: "5px 8px",
                  borderRadius: "999px",
                  background: "#fff7ed",
                  color: "#c2410c",
                  fontSize: "10px",
                  fontWeight: "800",
                }}
              >
                계정 미연결
              </span>
            )}
          </div>

          <div style={{marginTop:7}}>
            <span style={{display:"inline-block",padding:"5px 8px",borderRadius:999,fontSize:11,fontWeight:800,
              background:relationshipType==="employee"?"#dbeafe":relationshipType==="freelancer"?"#fef3c7":"#f1f5f9",
              color:relationshipType==="employee"?"#1d4ed8":relationshipType==="freelancer"?"#92400e":"#64748b"}}>
              {relationshipType==="employee"?"소속 직원":relationshipType==="freelancer"?"협력 프리랜서":"관계 미설정"}
            </span>
          </div>

          {specialties.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                marginTop: "8px",
              }}
            >
              {specialties.map((specialty, index) => (
                <span
                  key={`${specialty}-${index}`}
                  style={{
                    padding: "4px 7px",
                    borderRadius: "6px",
                    background: "#f1f5f9",
                    color: "#475569",
                    fontSize: "10px",
                    fontWeight: "700",
                  }}
                >
                  {specialty}
                </span>
              ))}
            </div>
          )}

          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#f8f7f3" }}>
            <button type="button" onClick={() => { setMemoDraft(worker.memo || ""); setMemoError(""); setMemoOpen(true); }} style={{ border: 0, background: "transparent", color: "#285c94", padding: "6px 0", minHeight: 44, fontWeight: 700 }}>
              {worker?.memo ? "시공자 메모 수정 ›" : "+ 시공자 메모 입력"}
            </button>
            {memoOpen && <div>
              <textarea aria-label="시공자 메모" rows={3} maxLength={1000} value={memoDraft} disabled={memoBusy}
                onChange={e => setMemoDraft(e.target.value)} placeholder="예: 싱크대 능숙, 차량 있음"
                style={{ width: "100%", boxSizing: "border-box", fontSize: 16, padding: 10, borderRadius: 8 }} />
              <button type="button" disabled={memoBusy} onClick={saveMemo}>{memoBusy ? "저장 중…" : "메모 저장"}</button>
              <button type="button" disabled={memoBusy} onClick={() => setMemoOpen(false)}>취소</button>
              {memoError && <p role="alert">{memoError}</p>}
            </div>}
            {!memoOpen && worker?.memo && <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13, color: "#475569" }}>{worker.memo}</p>}
          </div>

        </div>

        <div
          style={{
            display: "grid",
            gap: "5px",
            flex: "0 0 auto",
            minWidth: "82px",
          }}
        >
          {!accountLinked && active && (
            <button
              type="button"
              onClick={onLinkSelf}
              style={{
                padding: "7px 9px",
                border: "1px solid #16a34a",
                borderRadius: 8,
                background: "#f0fdf4",
                color: "#166534",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              내 계정 연결
            </button>
          )}

          {!accountLinked && active && onInvite && (
            <button
              type="button"
              disabled={inviteLoading}
              onClick={onInvite}
              style={{
                padding: "7px 9px",
                border: "1px solid #2563eb",
                borderRadius: "8px",
                background: inviteLoading
                  ? "#dbeafe"
                  : "#eff6ff",
                color: "#1d4ed8",
                fontSize: "11px",
                fontWeight: "800",
                cursor: inviteLoading
                  ? "default"
                  : "pointer",
              }}
            >
              {inviteLoading
                ? "생성 중..."
                : "🔗 계정 초대"}
            </button>
          )}

          {accountLinked && (
            <div
              style={{
                padding: "7px 8px",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                background: "#f0fdf4",
                color: "#166534",
                fontSize: "10px",
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              연결 완료
            </div>
          )}

          <button
            type="button"
            aria-expanded={attendanceOpen}
            onClick={() =>
              setAttendanceOpen((value) => !value)
            }
            style={{
              minHeight: 44,
              padding: "7px 10px",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              background: "#eff6ff",
              color: "#1d4ed8",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {attendanceOpen ? "출퇴근 닫기" : "출퇴근 내역"}
          </button>

          <button
            type="button"
            onClick={onEdit}
            style={{
              padding: "7px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              background: "#ffffff",
              color: "#334155",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            수정
          </button>

          <button
            type="button"
            onClick={onActiveChange}
            style={{
              padding: "7px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              background: active ? "#ffffff" : "#111827",
              color: active ? "#64748b" : "#ffffff",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            {active ? "비활성" : "재활성"}
          </button>
        </div>
      </div>

      {attendanceOpen && worker?.id && (
        <div
          style={{
            marginTop: 14,
            borderTop: "1px solid #e2e8f0",
            paddingTop: 14,
          }}
        >
          <AttendancePage
            mode="admin"
            workerId={worker.id}
            embedded
          />
        </div>
      )}
      </div>
    </div>
  );
              }
