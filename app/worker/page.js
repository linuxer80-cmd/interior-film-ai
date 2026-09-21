"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function WorkerPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState(null);

  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  const [message, setMessage] = useState("");

  /* =========================================================
     최초 실행
  ========================================================= */

  useEffect(() => {
    loadWorkerPage();
  }, []);

  /* =========================================================
     전체 로드

     1. 로그인 확인
     2. 시공자 계정 확인
     3. 본인 배정 현장만 조회
  ========================================================= */

  async function loadWorkerPage() {
    setLoading(true);
    setMessage("");

    try {
      /* =====================================================
         1. 로그인 사용자 확인
      ===================================================== */

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
         2. 현재 로그인 계정의 시공자 정보
      ===================================================== */

      const {
        data,
        error,
      } = await supabase.rpc(
        "get_my_worker"
      );

      if (error) {
        throw error;
      }

      const workerData =
        Array.isArray(data)
          ? data[0]
          : data;

      if (!workerData?.worker_id) {
        await supabase.auth.signOut();

        router.replace("/worker/login");
        return;
      }

      if (
        workerData.worker_is_active ===
        false
      ) {
        await supabase.auth.signOut();

        setMessage(
          "현재 사용이 중지된 시공자 계정입니다. 회사 관리자에게 문의해주세요."
        );

        return;
      }

      setWorker(workerData);

      /* =====================================================
         3. 본인에게 배정된 현장만 조회
      ===================================================== */

      await loadAssignedSites();
    } catch (error) {
      console.error(
        "시공자 페이지 로드 오류:",
        error
      );

      setMessage(
        `❌ ${
          error?.message ||
          "시공자 정보를 불러오지 못했습니다."
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     본인 배정 현장 조회

     DB 함수에서 이미
     로그인한 worker_id 기준으로 제한함.

     회사 전체 sites를 직접 SELECT 하지 않음.
  ========================================================= */

  async function loadAssignedSites() {
    setSitesLoading(true);

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "get_my_assigned_sites"
      );

      if (error) {
        throw error;
      }

      setSites(
        Array.isArray(data)
          ? data
          : []
      );
    } catch (error) {
      console.error(
        "배정 현장 조회 오류:",
        error
      );

      setSites([]);

      throw error;
    } finally {
      setSitesLoading(false);
    }
  }

  /* =========================================================
     로그아웃
  ========================================================= */

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error(
        "로그아웃 오류:",
        error
      );
    } finally {
      router.replace("/worker/login");
      router.refresh();
    }
  }

  /* =========================================================
     날짜 표시
  ========================================================= */

  function formatSchedule(
    value
  ) {
    if (!value) {
      return "-";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "-";
    }

    return new Intl.DateTimeFormat(
      "ko-KR",
      {
        timeZone: "Asia/Seoul",
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).format(date);
  }

  /* =========================================================
     시간만 표시
  ========================================================= */

  function formatTime(
    value
  ) {
    if (!value) {
      return "";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    return new Intl.DateTimeFormat(
      "ko-KR",
      {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).format(date);
  }

  /* =========================================================
     현장 역할
  ========================================================= */

  function getRoleLabel(
    role
  ) {
    if (role === "leader") {
      return "책임 팀장";
    }

    return "시공자";
  }

  /* =========================================================
     현장 상태
  ========================================================= */

  function getStatusInfo(
    status
  ) {
    switch (status) {
      case "in_progress":
        return {
          label: "시공 중",
          background:
            "#eff6ff",
          color:
            "#1d4ed8",
        };

      case "completed":
        return {
          label: "시공 완료",
          background:
            "#f0fdf4",
          color:
            "#15803d",
        };

      case "cancelled":
        return {
          label: "취소",
          background:
            "#fef2f2",
          color:
            "#b91c1c",
        };

      case "scheduled":
      default:
        return {
          label: "시공 예정",
          background:
            "#f8fafc",
          color:
            "#475569",
        };
    }
  }

  /* =========================================================
     주소 만들기
  ========================================================= */

  function makeAddress(
    site
  ) {
    return [
      site?.address,
      site?.address_detail,
    ]
      .filter(Boolean)
      .join(" ");
  }

  /* =========================================================
     로딩 화면
  ========================================================= */

  if (loading) {
    return (
      <main
        style={{
          minHeight:
            "100vh",

          background:
            "#f8fafc",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          padding:
            "20px",

          boxSizing:
            "border-box",
        }}
      >
        <div
          style={{
            color:
              "#64748b",

            fontSize:
              "14px",

            fontWeight:
              "700",
          }}
        >
          시공자 정보를 확인하고 있습니다...
        </div>
      </main>
    );
  }

  /* =========================================================
     시공자 정보 없음
  ========================================================= */

  if (!worker) {
    return (
      <main
        style={{
          minHeight:
            "100vh",

          background:
            "#f8fafc",

          padding:
            "20px",

          boxSizing:
            "border-box",
        }}
      >
        <div
          style={{
            width:
              "100%",

            maxWidth:
              "520px",

            margin:
              "60px auto 0",

            background:
              "#ffffff",

            border:
              "1px solid #e2e8f0",

            borderRadius:
              "16px",

            padding:
              "22px",

            boxSizing:
              "border-box",
          }}
        >
          <div
            style={{
              fontSize:
                "18px",

              fontWeight:
                "900",

              color:
                "#111827",
            }}
          >
            시공자 페이지
          </div>

          <div
            style={{
              marginTop:
                "12px",

              color:
                "#b91c1c",

              fontSize:
                "14px",

              lineHeight:
                1.6,

              whiteSpace:
                "pre-wrap",
            }}
          >
            {message ||
              "시공자 정보를 확인할 수 없습니다."}
          </div>

          <button
            type="button"
            onClick={() => {
              router.replace(
                "/worker/login"
              );

              router.refresh();
            }}
            style={{
              width:
                "100%",

              marginTop:
                "18px",

              padding:
                "12px",

              border:
                "none",

              borderRadius:
                "10px",

              background:
                "#111827",

              color:
                "#ffffff",

              fontWeight:
                "800",

              cursor:
                "pointer",
            }}
          >
            로그인으로 이동
          </button>
        </div>
      </main>
    );
  }

  /* =========================================================
     메인
  ========================================================= */

  return (
    <main
      style={{
        minHeight:
          "100vh",

        background:
          "#f8fafc",

        color:
          "#111827",

        paddingBottom:
          "50px",
      }}
    >
      {/* =====================================================
          상단
      ===================================================== */}

      <header
        style={{
          background:
            "#ffffff",

          borderBottom:
            "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            width:
              "100%",

            maxWidth:
              "720px",

            margin:
              "0 auto",

            padding:
              "16px",

            boxSizing:
              "border-box",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "space-between",

            gap:
              "12px",
          }}
        >
          <div>
            <div
              style={{
                fontSize:
                  "12px",

                color:
                  "#64748b",

                fontWeight:
                  "700",
              }}
            >
              시공자 전용
            </div>

            <div
              style={{
                marginTop:
                  "2px",

                fontSize:
                  "20px",

                fontWeight:
                  "900",

                color:
                  "#111827",
              }}
            >
              현장 관리
            </div>
          </div>

          <button
            type="button"
            onClick={
              handleLogout
            }
            style={{
              flex:
                "0 0 auto",

              border:
                "1px solid #cbd5e1",

              borderRadius:
                "9px",

              background:
                "#ffffff",

              color:
                "#475569",

              padding:
                "8px 11px",

              fontSize:
                "12px",

              fontWeight:
                "800",

              cursor:
                "pointer",
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* =====================================================
          본문
      ===================================================== */}

      <div
        style={{
          width:
            "100%",

          maxWidth:
            "720px",

          margin:
            "0 auto",

          padding:
            "16px",

          boxSizing:
            "border-box",
        }}
      >
        {/* ===================================================
            시공자 정보
        =================================================== */}

        <section
          style={{
            background:
              "#ffffff",

            border:
              "1px solid #e2e8f0",

            borderRadius:
              "16px",

            padding:
              "18px",
          }}
        >
          <div
            style={{
              display:
                "flex",

              alignItems:
                "center",

              gap:
                "12px",
            }}
          >
            <div
              style={{
                width:
                  "48px",

                height:
                  "48px",

                flex:
                  "0 0 48px",

                borderRadius:
                  "50%",

                background:
                  "#f1f5f9",

                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "center",

                fontSize:
                  "24px",
              }}
            >
              👷
            </div>

            <div
              style={{
                minWidth:
                  0,
              }}
            >
              <div
                style={{
                  fontSize:
                    "18px",

                  fontWeight:
                    "900",

                  color:
                    "#111827",
                }}
              >
                {worker.worker_name ||
                  "시공자"}
              </div>

              <div
                style={{
                  marginTop:
                    "3px",

                  color:
                    "#64748b",

                  fontSize:
                    "13px",
                }}
              >
                {worker.worker_phone ||
                  "전화번호 없음"}
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================
            내 현장
        =================================================== */}

        <section
          style={{
            marginTop:
              "14px",

            background:
              "#ffffff",

            border:
              "1px solid #e2e8f0",

            borderRadius:
              "16px",

            padding:
              "18px",
          }}
        >
          <div
            style={{
              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "space-between",

              gap:
                "10px",
            }}
          >
            <div
              style={{
                fontSize:
                  "16px",

                fontWeight:
                  "900",

                color:
                  "#111827",
              }}
            >
              📅 내 현장
            </div>

            <div
              style={{
                padding:
                  "5px 9px",

                borderRadius:
                  "999px",

                background:
                  "#f1f5f9",

                color:
                  "#475569",

                fontSize:
                  "11px",

                fontWeight:
                  "800",
              }}
            >
              {sites.length}건
            </div>
          </div>

          {/* ===============================================
              현장 로딩
          =============================================== */}

          {sitesLoading && (
            <div
              style={{
                padding:
                  "28px 10px",

                textAlign:
                  "center",

                color:
                  "#64748b",

                fontSize:
                  "13px",
              }}
            >
              배정된 현장을 불러오는 중입니다...
            </div>
          )}

          {/* ===============================================
              배정 현장 없음
          =============================================== */}

          {!sitesLoading &&
            sites.length ===
              0 && (
              <div
                style={{
                  marginTop:
                    "16px",

                  padding:
                    "28px 12px",

                  border:
                    "1px dashed #cbd5e1",

                  borderRadius:
                    "12px",

                  background:
                    "#f8fafc",

                  textAlign:
                    "center",
                }}
              >
                <div
                  style={{
                    fontSize:
                      "28px",
                  }}
                >
                  🏠
                </div>

                <div
                  style={{
                    marginTop:
                      "8px",

                    color:
                      "#334155",

                    fontSize:
                      "14px",

                    fontWeight:
                      "800",
                  }}
                >
                  배정된 현장이 없습니다.
                </div>

                <div
                  style={{
                    marginTop:
                      "5px",

                    color:
                      "#64748b",

                    fontSize:
                      "12px",

                    lineHeight:
                      1.6,
                  }}
                >
                  회사 관리자가 현장에
                  배정하면 이곳에 일정이
                  표시됩니다.
                </div>
              </div>
            )}

          {/* ===============================================
              본인에게 배정된 현장 목록
          =============================================== */}

          {!sitesLoading &&
            sites.length >
              0 && (
              <div
                style={{
                  display:
                    "grid",

                  gap:
                    "12px",

                  marginTop:
                    "16px",
                }}
              >
                {sites.map(
                  (site) => {
                    const status =
                      getStatusInfo(
                        site.site_status
                      );

                    const address =
                      makeAddress(
                        site
                      );

                    return (
                      <article
                        key={
                          site.site_id
                        }
                        style={{
                          padding:
                            "15px",

                          border:
                            "1px solid #e2e8f0",

                          borderRadius:
                            "13px",

                          background:
                            "#ffffff",
                        }}
                      >
                        {/* 상단 */}

                        <div
                          style={{
                            display:
                              "flex",

                            alignItems:
                              "flex-start",

                            justifyContent:
                              "space-between",

                            gap:
                              "10px",
                          }}
                        >
                          <div
                            style={{
                              minWidth:
                                0,

                              flex:
                                1,
                            }}
                          >
                            <div
                              style={{
                                color:
                                  "#111827",

                                fontSize:
                                  "16px",

                                fontWeight:
                                  "900",

                                wordBreak:
                                  "break-word",
                              }}
                            >
                              {site.site_name ||
                                site.customer_name ||
                                "현장"}
                            </div>

                            {site.customer_name && (
                              <div
                                style={{
                                  marginTop:
                                    "3px",

                                  color:
                                    "#64748b",

                                  fontSize:
                                    "12px",
                                }}
                              >
                                고객{" "}
                                {
                                  site.customer_name
                                }
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              flex:
                                "0 0 auto",

                              padding:
                                "5px 8px",

                              borderRadius:
                                "999px",

                              background:
                                status.background,

                              color:
                                status.color,

                              fontSize:
                                "11px",

                              fontWeight:
                                "800",
                            }}
                          >
                            {
                              status.label
                            }
                          </div>
                        </div>

                        {/* 일정 */}

                        <div
                          style={{
                            marginTop:
                              "13px",

                            padding:
                              "11px",

                            borderRadius:
                              "10px",

                            background:
                              "#f8fafc",
                          }}
                        >
                          <div
                            style={{
                              color:
                                "#111827",

                              fontSize:
                                "13px",

                              fontWeight:
                                "800",
                            }}
                          >
                            📅{" "}
                            {formatSchedule(
                              site.schedule_start
                            )}
                          </div>

                          {site.schedule_end && (
                            <div
                              style={{
                                marginTop:
                                  "4px",

                                color:
                                  "#64748b",

                                fontSize:
                                  "12px",
                              }}
                            >
                              종료 예정{" "}
                              {formatTime(
                                site.schedule_end
                              )}
                            </div>
                          )}
                        </div>

                        {/* 역할 */}

                        <InfoRow
                          label="담당"
                          value={
                            getRoleLabel(
                              site.worker_role
                            )
                          }
                        />

                        {/* 지역 */}

                        {site.region && (
                          <InfoRow
                            label="지역"
                            value={
                              site.region
                            }
                          />
                        )}

                        {/* 주소 */}

                        {address && (
                          <InfoRow
                            label="주소"
                            value={
                              address
                            }
                          />
                        )}

                        {/* 작업 */}

                        {site.work_type && (
                          <InfoRow
                            label="작업"
                            value={
                              site.work_type
                            }
                          />
                        )}

                        {/* 작업 설명 */}

                        {site.work_description && (
                          <div
                            style={{
                              marginTop:
                                "10px",

                              padding:
                                "10px",

                              borderRadius:
                                "9px",

                              background:
                                "#f8fafc",

                              color:
                                "#475569",

                              fontSize:
                                "12px",

                              lineHeight:
                                1.6,

                              whiteSpace:
                                "pre-wrap",
                            }}
                          >
                            {
                              site.work_description
                            }
                          </div>
                        )}

                        {/* 전화 */}

                        {site.customer_phone && (
                          <a
                            href={`tel:${site.customer_phone}`}
                            style={{
                              display:
                                "block",

                              marginTop:
                                "12px",

                              padding:
                                "11px",

                              borderRadius:
                                "10px",

                              background:
                                "#111827",

                              color:
                                "#ffffff",

                              textAlign:
                                "center",

                              textDecoration:
                                "none",

                              fontSize:
                                "13px",

                              fontWeight:
                                "800",
                            }}
                          >
                            📞 고객에게 전화
                          </a>
                        )}
                      </article>
                    );
                  }
                )}
              </div>
            )}
        </section>

        {/* ===================================================
            보안 안내
        =================================================== */}

        <div
          style={{
            marginTop:
              "14px",

            padding:
              "12px",

            borderRadius:
              "10px",

            background:
              "#f1f5f9",

            color:
              "#64748b",

            fontSize:
              "11px",

            lineHeight:
              1.6,

            textAlign:
              "center",
          }}
        >
          본인에게 배정된 현장 일정만
          표시됩니다.
        </div>
      </div>
    </main>
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
        display:
          "flex",

        alignItems:
          "flex-start",

        gap:
          "10px",

        marginTop:
          "10px",

        fontSize:
          "12px",

        lineHeight:
          1.5,
      }}
    >
      <div
        style={{
          width:
            "38px",

          flex:
            "0 0 38px",

          color:
            "#94a3b8",

          fontWeight:
            "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          flex:
            1,

          minWidth:
            0,

          color:
            "#334155",

          fontWeight:
            "700",

          wordBreak:
            "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
              }
