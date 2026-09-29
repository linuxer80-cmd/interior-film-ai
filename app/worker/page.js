"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { loadMyWorkerSites, workerDestination, workerLoginUrl } from "../utils/workerSites";

function workDate(value) {
  if (!value) return "미정";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value);
  return Number.isNaN(date.getTime()) ? "미정" : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short",
  }).format(date);
}

import {
  enablePushNotifications,
  getPushSubscriptionStatus,
} from "../utils/pushSubscription";

export default function WorkerPage() {
  const router = useRouter();

  const [loading, setLoading] =
    useState(true);

  const [worker, setWorker] =
    useState(null);

  const [sites, setSites] =
    useState([]);

  const [
    sitesLoading,
    setSitesLoading,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [
    notificationEnabled,
    setNotificationEnabled,
  ] = useState(false);

  const [
    notificationLoading,
    setNotificationLoading,
  ] = useState(false);

  const [
    notificationMessage,
    setNotificationMessage,
  ] = useState("");

  const refreshInFlight = useRef(false);

  useEffect(() => {
    const target = workerDestination(window.location.pathname + window.location.search);
    if (target !== "/worker") {
      // The detail API validates assignment; a stale list must not swallow a push link.
      router.replace(target);
      return;
    }
    loadWorkerPage();
    const refresh = () => {
      if (document.visibilityState === "visible") loadWorkerPage({ background: true });
    };
    const restore = (event) => { if (event.persisted) refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  async function loadWorkerPage({ background = false } = {}) {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!background) setLoading(true);
    setSitesLoading(true);
    setMessage("");
    try {
      const result = await loadMyWorkerSites();
      setWorker(result.worker);
      setSites(result.sites || []);
      // Device subscription checks must not delay assignment display.
      void syncNotificationStatus();
    } catch (error) {
      console.error("시공자 현장 조회 오류:", error);
      if (error.status === 401) {
        setWorker(null);
        setSites([]);
        router.replace(workerLoginUrl());
      } else {
        // Clear stale personal data on denied access, but distinguish every
        // failure from a successful empty list in the UI below.
        setSites([]);
        setMessage(error.message || "배정 현장을 불러오지 못했습니다.");
      }
    } finally {
      refreshInFlight.current = false;
      setSitesLoading(false);
      setLoading(false);
    }
  }

  /* =========================================================
     Push 구독 상태 확인
  ========================================================= */

  async function syncNotificationStatus() {
    try {
      const status =
        await getPushSubscriptionStatus();

      const enabled =
        Boolean(
          status?.supported &&
            status?.permission ===
              "granted" &&
            status?.subscribed,
        );

      setNotificationEnabled(
        enabled,
      );

      return enabled;
    } catch (error) {
      console.error(
        "시공자 Push 상태 확인 오류:",
        error,
      );

      setNotificationEnabled(
        false,
      );

      return false;
    }
  }

  /* =========================================================
     Push 알림 활성화
  ========================================================= */

  async function handleEnableNotifications() {
    if (
      notificationLoading
    ) {
      return;
    }

    setNotificationLoading(
      true,
    );

    setNotificationMessage(
      "",
    );

    try {
      await enablePushNotifications();

      const enabled =
        await syncNotificationStatus();

      if (!enabled) {
        throw new Error(
          "Push 알림 구독을 확인하지 못했습니다.",
        );
      }

      setNotificationMessage(
        "✅ 현장 알림이 켜졌습니다.",
      );
    } catch (error) {
      console.error(
        "시공자 Push 활성화 오류:",
        error,
      );

      setNotificationEnabled(
        false,
      );

      setNotificationMessage(
        `❌ ${
          error?.message ||
          "알림을 켜지 못했습니다."
        }`,
      );
    } finally {
      setNotificationLoading(
        false,
      );
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
        error,
      );
    } finally {
      router.replace(
        "/worker/login",
      );

      router.refresh();
    }
  }

  /* =========================================================
     날짜 표시
  ========================================================= */

  function formatSchedule(
    value,
  ) {
    if (!value) {
      return "-";
    }

    const date =
      new Date(
        value,
      );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return "-";
    }

    return new Intl.DateTimeFormat(
      "ko-KR",
      {
        timeZone:
          "Asia/Seoul",

        month:
          "long",

        day:
          "numeric",

        weekday:
          "short",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false,
      },
    ).format(
      date,
    );
  }

  /* =========================================================
     시간만 표시
  ========================================================= */

  function formatTime(
    value,
  ) {
    if (!value) {
      return "";
    }

    const date =
      new Date(
        value,
      );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return "";
    }

    return new Intl.DateTimeFormat(
      "ko-KR",
      {
        timeZone:
          "Asia/Seoul",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false,
      },
    ).format(
      date,
    );
  }

  /* =========================================================
     현장 역할
  ========================================================= */

  function getRoleInfo(
    role,
  ) {
    if (
      role ===
      "leader"
    ) {
      return {
        label:
          "👑 책임 팀장",

        background:
          "#fff7ed",

        color:
          "#c2410c",

        border:
          "#fed7aa",
      };
    }

    return {
      label:
        "👤 팀원",

      background:
        "#eff6ff",

      color:
        "#1d4ed8",

      border:
        "#bfdbfe",
    };
  }

  function getRoleLabel(
    role,
  ) {
    return getRoleInfo(
      role,
    ).label;
  }

  /* =========================================================
     현장 상태
  ========================================================= */

  function getStatusInfo(
    status,
  ) {
    switch (status) {
      case "in_progress":
        return {
          label:
            "시공 중",

          background:
            "#eff6ff",

          color:
            "#1d4ed8",
        };

      case "completed":
        return {
          label:
            "시공 완료",

          background:
            "#f0fdf4",

          color:
            "#15803d",
        };

      case "cancelled":
        return {
          label:
            "취소",

          background:
            "#fef2f2",

          color:
            "#b91c1c",
        };

      case "scheduled":
      default:
        return {
          label:
            "시공 예정",

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
    site,
  ) {
    return [
      site?.address,
      site?.address_detail,
    ]
      .filter(
        Boolean,
      )
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

          <button type="button" onClick={() => loadWorkerPage()} style={{ marginTop: 16, padding: 12, border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", cursor: "pointer" }}>현장 다시 확인</button>

          <button
            type="button"
            onClick={() => {
              router.replace(
                "/worker/login",
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

                flex:
                  1,
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

          <div
            style={{
              marginTop:
                "16px",

              paddingTop:
                "14px",

              borderTop:
                "1px solid #f1f5f9",
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
                  "12px",
              }}
            >
              <div
                style={{
                  minWidth:
                    0,
                }}
              >
                <div
                  style={{
                    fontSize:
                      "13px",

                    fontWeight:
                      "900",

                    color:
                      "#111827",
                  }}
                >
                  🔔 현장 알림
                </div>

                <div
                  style={{
                    marginTop:
                      "3px",

                    fontSize:
                      "11px",

                    lineHeight:
                      1.5,

                    color:
                      "#64748b",
                  }}
                >
                  새 현장 배정과 일정 알림을 휴대폰으로 받습니다.
                </div>
              </div>

              {notificationEnabled ? (
                <div
                  style={{
                    flex:
                      "0 0 auto",

                    padding:
                      "8px 11px",

                    borderRadius:
                      "9px",

                    background:
                      "#f0fdf4",

                    border:
                      "1px solid #bbf7d0",

                    color:
                      "#15803d",

                    fontSize:
                      "12px",

                    fontWeight:
                      "900",
                  }}
                >
                  ✓ 알림 켜짐
                </div>
              ) : (
                <button
                  type="button"
                  onClick={
                    handleEnableNotifications
                  }
                  disabled={
                    notificationLoading
                  }
                  style={{
                    flex:
                      "0 0 auto",

                    border:
                      "none",

                    borderRadius:
                      "9px",

                    padding:
                      "9px 12px",

                    background:
                      notificationLoading
                        ? "#94a3b8"
                        : "#111827",

                    color:
                      "#ffffff",

                    fontSize:
                      "12px",

                    fontWeight:
                      "900",

                    cursor:
                      notificationLoading
                        ? "default"
                        : "pointer",
                  }}
                >
                  {notificationLoading
                    ? "설정 중..."
                    : "알림 켜기"}
                </button>
              )}
            </div>

            {notificationMessage && (
              <div
                style={{
                  marginTop:
                    "9px",

                  fontSize:
                    "12px",

                  lineHeight:
                    1.5,

                  fontWeight:
                    "700",

                  color:
                    notificationMessage.startsWith(
                      "✅",
                    )
                      ? "#15803d"
                      : "#b91c1c",
                }}
              >
                {
                  notificationMessage
                }
              </div>
            )}
          </div>
        </section>

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
              {message ? "확인 필요" : `${sites.length}건`}
            </div>
          </div>

          <button type="button" onClick={() => loadWorkerPage({ background: true })} disabled={sitesLoading}
            style={{ marginTop: 12, padding: "9px 14px", border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", color: "#334155", fontWeight: 800, cursor: "pointer" }}>
            {sitesLoading ? "확인 중..." : "↻ 현장 새로고침"}
          </button>
          {message && <div role="alert" style={{ marginTop: 12, padding: 14, borderRadius: 10, background: "#fef2f2", color: "#b91c1c", fontSize: 13, lineHeight: 1.6 }}>
            {message}
          </div>}

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

          {!sitesLoading && !message &&
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
                  회사 관리자가 현장에 배정하면 이곳에 일정이 표시됩니다. 알림을 받았는데 보이지 않으면 새로고침 후, 관리자에게 현재 로그인한 계정의 배정을 확인해주세요.
                </div>
              </div>
            )}

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
                  (
                    site,
                  ) => {
                    const status =
                      getStatusInfo(
                        site.site_status,
                      );

                    const address =
                      makeAddress(
                        site,
                      );

                    const role =
                      getRoleInfo(
                        site.worker_role,
                      );

                    return (
                      <article
                        key={
                          site.site_id
                        }
                        onClick={() => {
                          router.push(
                            `/worker/site/${site.site_id}`,
                          );
                        }}
                        style={{
                          cursor:
                            "pointer",

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

                              display:
                                "grid",

                              justifyItems:
                                "end",

                              gap:
                                "6px",
                            }}
                          >
                            <div
                              style={{
                                padding:
                                  "6px 9px",

                                borderRadius:
                                  "999px",

                                background:
                                  role.background,

                                color:
                                  role.color,

                                border:
                                  `1px solid ${role.border}`,

                                fontSize:
                                  "11px",

                                fontWeight:
                                  "900",

                                whiteSpace:
                                  "nowrap",
                              }}
                            >
                              {
                                role.label
                              }
                            </div>

                            <div
                              style={{
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

                                whiteSpace:
                                  "nowrap",
                              }}
                            >
                              {
                                status.label
                              }
                            </div>
                          </div>
                        </div>

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
                            📅 {site.assigned_dates ? "내 작업 날짜" : `${workDate(site.schedule_start)}${site.schedule_end && workDate(site.schedule_end) !== workDate(site.schedule_start) ? ` ~ ${workDate(site.schedule_end)}` : ""}`}
                          </div>
                          {site.assigned_dates ? site.assigned_dates.map((day) => <div key={day.work_date} style={{ marginTop: 4, fontSize: 13 }}>
                            {workDate(day.work_date)} · {day.role === "leader" ? "팀장" : "팀원"}
                          </div>) : null}
                          {site.schedule_notice && <p style={{ color: "#b45309", fontSize: 12, lineHeight: 1.6 }}>{site.schedule_notice}</p>}
                        </div>

                        <InfoRow
                          label="담당"
                          value={getRoleLabel(
                            site.worker_role,
                          )}
                        />

                        {site.region && (
                          <InfoRow
                            label="지역"
                            value={
                              site.region
                            }
                          />
                        )}

                        {address && (
                          <InfoRow
                            label="주소"
                            value={
                              address
                            }
                          />
                        )}

                        {site.work_type && (
                          <InfoRow
                            label="작업"
                            value={
                              site.work_type
                            }
                          />
                        )}

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

                        {site.customer_phone && (
                          <a
                            href={`tel:${site.customer_phone}`}
                            onClick={(
                              event,
                            ) => {
                              event.stopPropagation();
                            }}
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

                            marginTop:
                              "12px",

                            paddingTop:
                              "11px",

                            borderTop:
                              "1px solid #f1f5f9",
                          }}
                        >
                          <span
                            style={{
                              color:
                                "#64748b",

                              fontSize:
                                "11px",

                              fontWeight:
                                "700",
                            }}
                          >
                            현장 상세정보 보기
                          </span>

                          <span
                            style={{
                              color:
                                "#334155",

                              fontSize:
                                "16px",

                              fontWeight:
                                "900",
                            }}
                          >
                            ›
                          </span>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            )}
        </section>

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
          본인에게 배정된 현장 일정만 표시됩니다.
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
