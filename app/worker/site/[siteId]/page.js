"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import WorkerRequestPhotos from "./WorkerRequestPhotos";
import WorkerWorkReport from "./WorkerWorkReport";

export default function WorkerSiteDetailPage() {
  const router = useRouter();
  const params = useParams();

  const siteId = params?.siteId;

  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [message, setMessage] = useState("");

  // 완료보고 상태
  const [reportLoading, setReportLoading] = useState(true);
  const [reportStatus, setReportStatus] = useState(null);

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
     완료보고 상태 조회
  ========================================================= */

  async function loadReportStatus() {
    setReportLoading(true);

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const accessToken =
        sessionData?.session?.access_token;

      if (!accessToken) {
        setReportStatus(null);
        return;
      }

      const response = await fetch(
        `/api/worker/site-work-report?siteId=${encodeURIComponent(
          siteId
        )}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error ||
            "완료보고 상태를 확인하지 못했습니다."
        );
      }

      if (!result?.hasReport || !result?.report) {
        setReportStatus({
          hasReport: false,
          report: null,
        });

        return;
      }

      setReportStatus({
        hasReport: true,
        report: result.report,
      });
    } catch (error) {
      console.error(
        "완료보고 상태 조회 오류:",
        error
      );

      // 완료보고 상태 조회가 실패했다고 해서
      // 현장 상세 전체를 막지는 않는다.
      // 단, 중복 제출은 서버 POST에서 다시 차단된다.
      setReportStatus(null);
    } finally {
      setReportLoading(false);
    }
  }

  /* =========================================================
     현장 상세 + 예정 자재 조회
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

      /* =====================================================
         배정된 현장 상세 조회
      ===================================================== */

      const {
        data: siteResult,
        error: siteError,
      } = await supabase.rpc(
        "get_my_worker_site_detail",
        {
          p_site_id: siteId,
        }
      );

      if (siteError) {
        throw siteError;
      }

      const siteData = Array.isArray(siteResult)
        ? siteResult[0]
        : siteResult;

      if (!siteData?.site_id) {
        setSite(null);
        setMaterials([]);
        setReportStatus(null);

        setMessage(
          "이 현장을 볼 수 없거나 현재 배정되어 있지 않습니다."
        );

        return;
      }

      setSite(siteData);

      /* =====================================================
         예정 자재 조회
      ===================================================== */

      const {
        data: materialResult,
        error: materialError,
      } = await supabase.rpc(
        "get_my_worker_site_materials",
        {
          p_site_id: siteId,
        }
      );

      if (materialError) {
        throw materialError;
      }

      setMaterials(
        Array.isArray(materialResult)
          ? materialResult
          : []
      );

      /* =====================================================
         완료보고 상태 조회
      ===================================================== */

      await loadReportStatus();
    } catch (error) {
      console.error(
        "시공자 현장 상세 조회 오류:",
        error
      );

      setSite(null);
      setMaterials([]);
      setReportStatus(null);

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
     수량 표시
  ========================================================= */

  function formatQuantity(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "";
    }

    const number = Number(value);

    if (Number.isNaN(number)) {
      return String(value);
    }

    return new Intl.NumberFormat("ko-KR", {
      maximumFractionDigits: 2,
    }).format(number);
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
      {/* =====================================================
          상단
      ===================================================== */}

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

      {/* =====================================================
          본문
      ===================================================== */}

      <div
        style={{
          width: "100%",
          maxWidth: "720px",
          margin: "0 auto",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        {/* ===================================================
            현장 기본정보
        =================================================== */}

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

          {/* 일정 */}

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

        {/* ===================================================
            작업 내용
        =================================================== */}

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

        {/* ===================================================
            예정 자재
        =================================================== */}

        <section
          style={{
            marginTop: "14px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <SectionTitle>
              📦 예정 자재
            </SectionTitle>

            <div
              style={{
                flex: "0 0 auto",
                padding: "5px 9px",
                borderRadius: "999px",
                background: "#f1f5f9",
                color: "#475569",
                fontSize: "11px",
                fontWeight: "800",
              }}
            >
              {materials.length}건
            </div>
          </div>

          {materials.length === 0 && (
            <div
              style={{
                marginTop: "12px",
                padding: "18px 12px",
                border: "1px dashed #cbd5e1",
                borderRadius: "10px",
                background: "#f8fafc",
                color: "#64748b",
                fontSize: "12px",
                lineHeight: 1.6,
                textAlign: "center",
              }}
            >
              등록된 예정 자재가 없습니다.
            </div>
          )}

          {materials.length > 0 && (
            <div
              style={{
                display: "grid",
                gap: "10px",
                marginTop: "12px",
              }}
            >
              {materials.map(
                (material, index) => {
                  const quantity =
                    formatQuantity(
                      material.quantity
                    );

                  const quantityText = [
                    quantity,
                    material.unit,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div
                      key={
                        material.material_id ||
                        `${material.product_code}-${index}`
                      }
                      style={{
                        padding: "14px",
                        border:
                          "1px solid #e2e8f0",
                        borderRadius: "11px",
                        background: "#f8fafc",
                      }}
                    >
                      {material.brand && (
                        <div
                          style={{
                            color: "#64748b",
                            fontSize: "11px",
                            fontWeight: "800",
                          }}
                        >
                          {material.brand}
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent:
                            "space-between",
                          gap: "12px",
                          marginTop:
                            material.brand
                              ? "5px"
                              : 0,
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
                              fontSize: "15px",
                              fontWeight: "900",
                              wordBreak:
                                "break-word",
                            }}
                          >
                            {material.product_code ||
                              material.product_name ||
                              "자재"}
                          </div>

                          {material.product_name &&
                            material.product_name !==
                              material.product_code && (
                              <div
                                style={{
                                  marginTop: "3px",
                                  color: "#64748b",
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  wordBreak:
                                    "break-word",
                                }}
                              >
                                {
                                  material.product_name
                                }
                              </div>
                            )}
                        </div>

                        {quantityText && (
                          <div
                            style={{
                              flex: "0 0 auto",
                              padding: "6px 9px",
                              borderRadius: "8px",
                              background: "#ffffff",
                              border:
                                "1px solid #e2e8f0",
                              color: "#111827",
                              fontSize: "13px",
                              fontWeight: "900",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {quantityText}
                          </div>
                        )}
                      </div>

                      {material.memo && (
                        <div
                          style={{
                            marginTop: "10px",
                            padding: "9px 10px",
                            borderRadius: "8px",
                            background: "#ffffff",
                            color: "#475569",
                            fontSize: "12px",
                            lineHeight: 1.6,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          메모 {material.memo}
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          )}

          <div
            style={{
              marginTop: "10px",
              color: "#94a3b8",
              fontSize: "10px",
              lineHeight: 1.5,
            }}
          >
            관리자에서 등록한 예정 사용 자재입니다.
          </div>
        </section>
        {/* ===================================================
            고객 요청사진
        =================================================== */}

        <WorkerRequestPhotos siteId={siteId} />

        {/* ===================================================
            고객 연락
        =================================================== */}

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

        {/* ===================================================
            현장 작업 / 완료보고

            처리 순서:

            1. 현장 completed
            2. 현장 cancelled
            3. 일반 member
            4. 완료보고 상태 조회 중
            5. pending
            6. approved
            7. rejected
            8. 보고서 없음 → leader 작성폼
        =================================================== */}

        {site.status === "completed" ? (
          /* =================================================
             현장 자체가 시공 완료 상태
          ================================================= */

          <section
            style={{
              marginTop: "14px",
              background: "#ffffff",
              border: "1px solid #bbf7d0",
              borderRadius: "16px",
              padding: "18px",
            }}
          >
            <SectionTitle>
              ✅ 시공 완료
            </SectionTitle>

            <div
              style={{
                marginTop: "12px",
                padding: "14px",
                borderRadius: "10px",
                background: "#f0fdf4",
                color: "#166534",
                fontSize: "12px",
                fontWeight: "800",
                lineHeight: 1.7,
              }}
            >
              이 현장은 시공 완료 처리되었습니다.
            </div>
          </section>
        ) : site.status === "cancelled" ? (
          /* =================================================
             취소 현장
          ================================================= */

          <section
            style={{
              marginTop: "14px",
              background: "#ffffff",
              border: "1px solid #fecaca",
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
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: "12px",
                fontWeight: "800",
                lineHeight: 1.7,
              }}
            >
              취소된 현장에는 완료보고를 등록할 수 없습니다.
            </div>
          </section>
        ) : site.my_role !== "leader" ? (
          /* =================================================
             일반 시공자
          ================================================= */

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
              📋 완료보고
            </SectionTitle>

            <div
              style={{
                marginTop: "12px",
                padding: "14px",
                borderRadius: "10px",
                background: "#f8fafc",
                color: "#64748b",
                fontSize: "12px",
                fontWeight: "800",
                lineHeight: 1.7,
              }}
            >
              완료보고는 이 현장의 책임 팀장이 등록합니다.
            </div>
          </section>
        ) : reportLoading ? (
          /* =================================================
             완료보고 상태 조회 중
          ================================================= */

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
              📋 완료보고
            </SectionTitle>

            <div
              style={{
                marginTop: "12px",
                padding: "14px",
                borderRadius: "10px",
                background: "#f8fafc",
                color: "#64748b",
                fontSize: "12px",
                fontWeight: "800",
                lineHeight: 1.7,
              }}
            >
              완료보고 상태를 확인하고 있습니다...
            </div>
          </section>
        ) : reportStatus?.hasReport &&
          reportStatus?.report?.review_status === "pending" ? (
          /* =================================================
             관리자 검수 대기
          ================================================= */

          <section
            style={{
              marginTop: "14px",
              background: "#ffffff",
              border: "1px solid #fde68a",
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
                <SectionTitle>
                  🟠 완료보고 제출 완료
                </SectionTitle>

                <div
                  style={{
                    marginTop: "5px",
                    color: "#92400e",
                    fontSize: "12px",
                    fontWeight: "900",
                  }}
                >
                  관리자 검수 대기
                </div>
              </div>

              <div
                style={{
                  flex: "0 0 auto",
                  padding: "6px 9px",
                  borderRadius: "999px",
                  background: "#fffbeb",
                  color: "#92400e",
                  border: "1px solid #fde68a",
                  fontSize: "10px",
                  fontWeight: "900",
                }}
              >
                검수 대기
              </div>
            </div>

            <div
              style={{
                marginTop: "14px",
                padding: "14px",
                borderRadius: "10px",
                background: "#fffbeb",
                color: "#92400e",
                fontSize: "12px",
                fontWeight: "700",
                lineHeight: 1.7,
              }}
            >
              완료보고가 정상적으로 제출되었습니다.
              <br />
              관리자가 시공 내용과 사진을 확인하고 있습니다.
              <br />
              실제 시공금액 확인 및 승인 전에는 AI
              견적자료로 등록되지 않습니다.
            </div>

            {reportStatus?.report?.work_summary && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "13px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    color: "#94a3b8",
                    fontSize: "10px",
                    fontWeight: "800",
                  }}
                >
                  제출한 시공 내용
                </div>

                <div
                  style={{
                    marginTop: "5px",
                    color: "#334155",
                    fontSize: "12px",
                    fontWeight: "800",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {reportStatus.report.work_summary}
                </div>
              </div>
            )}

            {reportStatus?.report?.completed_at && (
              <div
                style={{
                  marginTop: "10px",
                  color: "#94a3b8",
                  fontSize: "10px",
                  lineHeight: 1.5,
                }}
              >
                제출일시{" "}
                {formatDateTime(
                  reportStatus.report.completed_at
                )}
              </div>
            )}
          </section>
        ) : reportStatus?.hasReport &&
          reportStatus?.report?.review_status === "approved" ? (
          /* =================================================
             관리자 승인 완료
          ================================================= */

          <section
            style={{
              marginTop: "14px",
              background: "#ffffff",
              border: "1px solid #bbf7d0",
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
                <SectionTitle>
                  🟢 완료보고 승인 완료
                </SectionTitle>

                <div
                  style={{
                    marginTop: "5px",
                    color: "#166534",
                    fontSize: "12px",
                    fontWeight: "900",
                  }}
                >
                  관리자 검수 완료
                </div>
              </div>

              <div
                style={{
                  flex: "0 0 auto",
                  padding: "6px 9px",
                  borderRadius: "999px",
                  background: "#f0fdf4",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                  fontSize: "10px",
                  fontWeight: "900",
                }}
              >
                승인 완료
              </div>
            </div>

            <div
              style={{
                marginTop: "14px",
                padding: "14px",
                borderRadius: "10px",
                background: "#f0fdf4",
                color: "#166534",
                fontSize: "12px",
                fontWeight: "800",
                lineHeight: 1.7,
              }}
            >
              관리자가 완료보고 검수를 완료했습니다.
            </div>

            {reportStatus?.report?.review_memo && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "13px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    color: "#94a3b8",
                    fontSize: "10px",
                    fontWeight: "800",
                  }}
                >
                  관리자 메모
                </div>

                <div
                  style={{
                    marginTop: "5px",
                    color: "#334155",
                    fontSize: "12px",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {reportStatus.report.review_memo}
                </div>
              </div>
            )}

            {reportStatus?.report?.reviewed_at && (
              <div
                style={{
                  marginTop: "10px",
                  color: "#94a3b8",
                  fontSize: "10px",
                }}
              >
                검수일시{" "}
                {formatDateTime(
                  reportStatus.report.reviewed_at
                )}
              </div>
            )}
          </section>
        ) : reportStatus?.hasReport &&
          reportStatus?.report?.review_status === "rejected" ? (
          /* =================================================
             관리자 보완 요청
          ================================================= */

          <section
            style={{
              marginTop: "14px",
            }}
          >
            <div
              style={{
                marginBottom: "12px",
                background: "#ffffff",
                border: "1px solid #fecaca",
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
                  <SectionTitle>
                    🔴 완료보고 보완 필요
                  </SectionTitle>

                  <div
                    style={{
                      marginTop: "5px",
                      color: "#b91c1c",
                      fontSize: "12px",
                      fontWeight: "900",
                    }}
                  >
                    관리자가 보완을 요청했습니다.
                  </div>
                </div>

                <div
                  style={{
                    flex: "0 0 auto",
                    padding: "6px 9px",
                    borderRadius: "999px",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    border: "1px solid #fecaca",
                    fontSize: "10px",
                    fontWeight: "900",
                  }}
                >
                  보완 필요
                </div>
              </div>

              {reportStatus?.report?.review_memo ? (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "14px",
                    borderRadius: "10px",
                    background: "#fef2f2",
                    color: "#991b1b",
                    fontSize: "12px",
                    fontWeight: "700",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  관리자 요청사항
                  <br />
                  {reportStatus.report.review_memo}
                </div>
              ) : (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "14px",
                    borderRadius: "10px",
                    background: "#fef2f2",
                    color: "#991b1b",
                    fontSize: "12px",
                    fontWeight: "700",
                    lineHeight: 1.7,
                  }}
                >
                  완료보고 내용을 확인한 후 다시 제출해주세요.
                </div>
              )}
            </div>

            <WorkerWorkReport
              siteId={siteId}
              site={site}
              onSubmitted={async () => {
                await loadSiteDetail();
              }}
            />
          </section>
        ) : (
          /* =================================================
             완료보고 없음

             책임 팀장에게 작성폼 표시
          ================================================= */

          <section
            style={{
              marginTop: "14px",
            }}
          >
            <WorkerWorkReport
              siteId={siteId}
              site={site}
              onSubmitted={async () => {
                await loadSiteDetail();
              }}
            />
          </section>
        )}

        {/* ===================================================
            검수 전 안내

            보고서가 아직 없는 책임 팀장에게만 표시한다.

            pending 상태에서는 위 검수대기 카드에서
            이미 안내하므로 중복 표시하지 않는다.
        =================================================== */}

        {site.my_role === "leader" &&
          site.status !== "cancelled" &&
          site.status !== "completed" &&
          !reportLoading &&
          !reportStatus?.hasReport && (
            <div
              style={{
                marginTop: "10px",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #fde68a",
                background: "#fffbeb",
                color: "#92400e",
                fontSize: "11px",
                lineHeight: 1.7,
              }}
            >
              제출한 완료보고와 시공사진은 관리자 검수 후
              처리됩니다. 관리자가 실제 시공금액을 확인하고
              승인하기 전에는 AI 견적자료로 등록되지 않습니다.
            </div>
          )}

        {/* ===================================================
            보안 안내
        =================================================== */}

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
          본인에게 배정된 현장 정보만 조회할 수 있습니다.
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
