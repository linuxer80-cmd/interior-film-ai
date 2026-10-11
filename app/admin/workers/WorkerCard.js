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
  inviteLoading = false,
  onInvite,
  onLinkSelf,
  onEdit,
  onActiveChange,
}) {
  const [attendanceOpen, setAttendanceOpen] = useState(false);

  const active = worker?.is_active !== false;
  const accountLinked = Boolean(worker?.user_id);

  const specialties = Array.isArray(worker?.specialties)
    ? worker.specialties
    : [];

  return (
    <div
      style={{
        padding: "13px",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        background: active ? "#ffffff" : "#f8fafc",
        opacity: active ? 1 : 0.7,
      }}
    >
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
            <div
              style={{
                marginTop: "6px",
                color: "#475569",
                fontSize: "12px",
              }}
            >
              📞 {worker.phone}
            </div>
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

          {worker?.memo && (
            <div
              style={{
                marginTop: "8px",
                color: "#64748b",
                fontSize: "11px",
                lineHeight: "1.5",
                whiteSpace: "pre-wrap",
              }}
            >
              {worker.memo}
            </div>
          )}
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

          {!accountLinked && active && (
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
  );
              }
