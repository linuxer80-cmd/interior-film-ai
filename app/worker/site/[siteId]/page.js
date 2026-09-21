"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

export default function WorkerSiteDetailPage() {
  const router = useRouter();
  const params = useParams();

  const siteId = params?.siteId;

  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState(null);
  const [message, setMessage] = useState("");

  /* =========================================================
     최초 실행
  ========================================================= */

  useEffect(() => {
    if (!siteId) {
      return;
    }

    loadSiteDetail();
  }, [siteId]);

  /* =========================================================
     현장 상세 조회

     DB의 get_my_worker_site_detail()에서
     로그인한 시공자에게 배정된 현장인지 확인한다.

     다른 현장 ID를 직접 주소창에 입력해도
     데이터가 반환되지 않는다.
  ========================================================= */

  async function loadSiteDetail() {
    setLoading(true);
    setMessage("");

    try {
      /* 로그인 확인 */

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        router.replace("/worker/login");
        return;
      }

      /* 배정된 현장 상세 조회 */

      const { data, error } = await supabase.rpc(
        "get_my_worker_site_detail",
        {
          p_site_id: siteId,
        }
      );

      if (error) {
        throw error;
      }

      const siteData = Array.isArray(data)
        ? data[0]
        : data;

      if (!siteData?.site_id) {
        setSite(null);
        setMessage(
          "이 현장을 볼 수 없거나 현재 배정되어 있지 않습니다."
        );
        return;
      }

      setSite(siteData);
    } catch (error) {
      console.error(
        "시공자 현장 상세 조회 오류:",
        error
      );

      setSite(null);

      setMessage(
        `❌ ${
          error?.message ||
          "현장 정보를 불러오지 못했습니다."
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     날짜 + 시간
  ========================================================= */

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  /* =========================================================
     상태
  ========================================================= */

  function getStatusInfo(status) {
    switch (status) {
      case "in_progress":
        return {
          label: "시공 중",
          background: "#eff6ff",
          color: "#1d4ed8",
        };

      case "completed":
        return {
          label: "시공 완료",
          background: "#f0fdf4",
          color: "#15803d",
        };

      case "cancelled":
        return {
          label: "취소",
          background: "#fef2f2",
          color: "#b91c1c",
        };

      case "scheduled":
      default:
        return {
          label: "시공 예정",
          background: "#f8fafc",
          color: "#475569",
        };
    }
  }

  /* =========================================================
     역할
  ========================================================= */

  function getRoleLabel(role) {
    if (role === "leader") {
      return "책임 팀장";
    }

    return "시공자";
  }

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            color: "#64748b",
            fontSize: "14px",
            fontWeight: "800",
          }}
        >
          현장 정보를 불러오고 있습니다...
        </div>
      </main>
    );
  }

  /* =========================================================
     접근 불가 / 현장 없음
  ========================================================= */

  if (!site) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f8fafc",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "620px",
            margin: "40px auto 0",
          }}
        >
          <button
            type="button"
            onClick={() => {
              router.push("/worker");
            }}
            style={{
              border: "none",
              background: "transparent",
              color: "#475569",
              fontSize: "14px",
              fontWeight: "800",
              cursor: "pointer",
              padding: "6px 0",
            }}
          >
            ← 내 현장으로
          </button>

          <div
            style={{
              marginTop: "16px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "32px",
              }}
            >
              🏠
            </div>

            <div
              style={{
                marginTop: "12px",
                color: "#111827",
                fontSize: "17px",
                fontWeight: "900",
              }}
            >
              현장 정보를 볼 수 없습니다.
            </div>

            <div
              style={{
                marginTop: "8px",
                color: "#64748b",
                fontSize: "13px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {message ||
                "현재 배정된 현장이 아닙니다."}
            </div>

            <button
              type="button"
              onClick={() => {
                router.push("/worker");
              }}
              style={{
                width: "100%",
                marginTop: "20px",
                border: "none",
                borderRadius: "10px",
                background: "#111827",
                color: "#ffffff",
                padding: "12px",
                fontSize: "13px",
                fontWeight: "800",
                cursor: "pointer",
              }}
            >
              내 현장 목록으로
            </button>
          </div>
        </div>
      </main>
    );
  }

  const status = getStatusInfo(site.status);

  /* =========================================================
     메인
  ========================================================= */

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#111827",
        paddingBottom: "50px",
      }}
    >
      {/* 상단 */}

      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "720px",
            margin: "0 auto",
            padding: "13px 16px",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              router.push("/worker");
            }}
            style={{
              flex: "0 0 auto",
              width: "38px",
              height: "38px",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              background: "#ffffff",
              color: "#111827",
              fontSize: "20px",
              fontWeight: "900",
              cursor: "pointer",
            }}
          >
            ←
          </button>

          <div
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                color: "#64748b",
                fontSize: "11px",
                fontWeight: "700",
              }}
            >
              시공자 전용
            </div>

            <div
              style={{
                marginTop: "2px",
                color: "#111827",
                fontSize: "18px",
                fontWeight: "900",
              }}
            >
              현장 상세
            </div>
          </div>
        </div>
      </header>

      {/* 본문 */}

      <div
        style={{
          width: "100%",
          maxWidth: "720px",
          margin: "0 auto",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        {/* 현장 제목 */}

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  color: "#111827",
                  fontSize: "20px",
                  fontWeight: "900",
                  wordBreak: "break-word",
                }}
              >
                {site.site_name ||
                  site.customer_name ||
                  "현장"}
              </div>

              {site.customer_name && (
                <div
                  style={{
                    marginTop: "5px",
                    color: "#64748b",
                    fontSize: "13px",
                    fontWeight: "700",
                  }}
                >
                  고객 {site.customer_name}
                </div>
              )}
            </div>

            <div
              style={{
                flex: "0 0 auto",
                padding: "6px 10px",
                borderRadius: "999px",
                background: status.background,
                color: status.color,
                fontSize: "11px",
                fontWeight: "900",
              }}
            >
              {status.label}
            </div>
          </div>

          <div
            style={{
              marginTop: "15px",
              padding: "13px",
              borderRadius: "11px",
              background: "#f8fafc",
            }}
          >
            <div
              style={{
                color: "#64748b",
                fontSize: "11px",
                fontWeight: "700",
              }}
            >
              시공 일정
            </div>

            <div
              style={{
                marginTop: "5px",
                color: "#111827",
                fontSize: "14px",
                fontWeight: "900",
              }}
            >
              📅 {formatDateTime(site.schedule_start)}
            </div>

            {site.schedule_end && (
              <div
                style={{
                  marginTop: "6px",
                  color: "#64748b",
                  fontSize: "12px",
                }}
              >
                종료 예정{" "}
                {formatDateTime(site.schedule_end)}
              </div>
            )}
          </div>

          <InfoRow
            label="담당"
            value={getRoleLabel(site.my_role)}
          />

          <InfoRow
            label="지역"
            value={site.region}
          />

          <InfoRow
            label="주소"
            value={site.address}
          />

          <InfoRow
            label="시공"
            value={site.work_type}
          />
        </section>

        {/* 작업 내용 */}

        {site.work_description && (
          <section
            style={{
              marginTop: "14px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "18px",
            }}
          >
            <SectionTitle>
              🛠️ 작업 내용
            </SectionTitle>

            <div
              style={{
                marginTop: "12px",
                padding: "13px",
                borderRadius: "10px",
                background: "#f8fafc",
                color: "#334155",
                fontSize: "13px",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {site.work_description}
            </div>
          </section>
        )}

        {/* 고객 연락 */}

        {site.customer_phone && (
          <section
            style={{
              marginTop: "14px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "18px",
            }}
          >
            <SectionTitle>
              📞 고객 연락
            </SectionTitle>

            <div
              style={{
                marginTop: "10px",
                color: "#334155",
                fontSize: "14px",
                fontWeight: "800",
              }}
            >
              {site.customer_phone}
            </div>

            <a
              href={`tel:${site.customer_phone}`}
              style={{
                display: "block",
                marginTop: "12px",
                padding: "13px",
                borderRadius: "10px",
                background: "#111827",
                color: "#ffffff",
                textAlign: "center",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "900",
              }}
            >
              📞 고객에게 전화
            </a>
          </section>
        )}

        {/* 다음 기능 자리 */}

        <section
          style={{
            marginTop: "14px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "18px",
          }}
        >
          <SectionTitle>
            📋 현장 작업
          </SectionTitle>

          <div
            style={{
              marginTop: "12px",
              padding: "14px",
              borderRadius: "10px",
              background: "#f8fafc",
              color: "#64748b",
              fontSize: "12px",
              lineHeight: 1.7,
            }}
          >
            다음 단계에서 이곳에 예정 자재,
            요청사진, 시공사진 및 완료보고 기능을
            연결합니다.
          </div>
        </section>

        {/* 보안 안내 */}

        <div
          style={{
            marginTop: "14px",
            padding: "12px",
            borderRadius: "10px",
            background: "#f1f5f9",
            color: "#64748b",
            fontSize: "11px",
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          본인에게 배정된 현장 정보만
          조회할 수 있습니다.
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   섹션 제목
========================================================= */

function SectionTitle({ children }) {
  return (
    <div
      style={{
        color: "#111827",
        fontSize: "15px",
        fontWeight: "900",
      }}
    >
      {children}
    </div>
  );
}

/* =========================================================
   정보 한 줄
========================================================= */

function InfoRow({
  label,
  value,
}) {
  if (!value) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        marginTop: "12px",
        fontSize: "13px",
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          width: "46px",
          flex: "0 0 46px",
          color: "#94a3b8",
          fontWeight: "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          color: "#334155",
          fontWeight: "800",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
            }
