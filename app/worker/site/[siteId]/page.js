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
  const [materials, setMaterials] = useState([]);
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

        setMessage(
          "이 현장을 볼 수 없거나 현재 배정되어 있지 않습니다."
        );

        return;
      }

      setSite(siteData);

      /* =====================================================
         예정 자재 조회

         DB 함수에서:
         - 로그인한 시공자 확인
         - 해당 현장 배정 여부 확인
         - planned 자재만 반환
         - 단가/금액은 반환하지 않음
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
    } catch (error) {
      console.error(
        "시공자 현장 상세 조회 오류:",
        error
      );

      setSite(null);
      setMaterials([]);

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

    return new Intl.NumberFormat(
      "ko-KR",
      {
        maximumFractionDigits: 2,
      }
    ).format(number);
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
              📅{" "}
              {formatDateTime(
                site.schedule_start
              )}
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
                {formatDateTime(
                  site.schedule_end
                )}
              </div>
            )}
          </div>

          <InfoRow
            label="담당"
            value={getRoleLabel(
              site.my_role
            )}
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

          {/* 예정 자재 없음 */}

          {materials.length === 0 && (
            <div
              style={{
                marginTop: "12px",
                padding: "18px 12px",
                border:
                  "1px dashed #cbd5e1",
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

          {/* 예정 자재 목록 */}

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

                  const quantityText =
                    [
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
                        borderRadius:
                          "11px",
                        background:
                          "#f8fafc",
                      }}
                    >
                      {/* 브랜드 */}

                      {material.brand && (
                        <div
                          style={{
                            color:
                              "#64748b",
                            fontSize:
                              "11px",
                            fontWeight:
                              "800",
                          }}
                        >
                          {material.brand}
                        </div>
                      )}

                      {/* 제품코드 / 제품명 */}

                      <div
                        style={{
                          display: "flex",
                          alignItems:
                            "flex-start",
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
                              color:
                                "#111827",
                              fontSize:
                                "15px",
                              fontWeight:
                                "900",
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
                                  marginTop:
                                    "3px",
                                  color:
                                    "#64748b",
                                  fontSize:
                                    "12px",
                                  fontWeight:
                                    "700",
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

                        {/* 수량 */}

                        {quantityText && (
                          <div
                            style={{
                              flex:
                                "0 0 auto",
                              padding:
                                "6px 9px",
                              borderRadius:
                                "8px",
                              background:
                                "#ffffff",
                              border:
                                "1px solid #e2e8f0",
                              color:
                                "#111827",
                              fontSize:
                                "13px",
                              fontWeight:
                                "900",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {quantityText}
                          </div>
                        )}
                      </div>

                      {/* 메모 */}

                      {material.memo && (
                        <div
                          style={{
                            marginTop:
                              "10px",
                            padding:
                              "9px 10px",
                            borderRadius:
                              "8px",
                            background:
                              "#ffffff",
                            color:
                              "#475569",
                            fontSize:
                              "12px",
                            lineHeight:
                              1.6,
                            whiteSpace:
                              "pre-wrap",
                            wordBreak:
                              "break-word",
                          }}
                        >
                          메모{" "}
                          {material.memo}
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
            관리자에서 등록한 예정 사용
            자재입니다.
          </div>
        </section>

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
            현장 작업
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
            다음 단계에서 고객 요청사진,
            시공사진 및 완료보고 기능을
            연결합니다.
          </div>
        </section>

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

function SectionTitle({
  children,
}) {
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
