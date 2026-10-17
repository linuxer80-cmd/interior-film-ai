"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { siteStatus, koreanDay, isPastWorkerSchedule } from "../utils/workerCalendar";
import { supabase } from "../../lib/supabase";
import {
  loadMyWorkerSites,
  workerDestination,
  workerLoginUrl,
} from "../utils/workerSites";
import {
  enablePushNotifications,
  getPushSubscriptionStatus,
} from "../utils/pushSubscription";
import WorkerSiteCalendar from "./WorkerSiteCalendar";
import WorkerMonthlyPay from "./WorkerMonthlyPay";
import WorkerAvatar from "../components/WorkerAvatar";
import WorkerHomeDashboard from "./WorkerHomeDashboard";
import ToolIllustration from "../components/ui/ToolIllustration";
import styles from "./WorkerSiteCalendar.module.css";

export default function WorkerPage({ mode = "home" }) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [reportCompany, setReportCompany] = useState("all");
  const [reportFilter, setReportFilter] = useState("todo");
  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState(null);
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [notificationEnabled, setNotificationEnabled] =
    useState(false);
  const [notificationLoading, setNotificationLoading] =
    useState(false);
  const [notificationMessage, setNotificationMessage] =
    useState("");

  const refreshInFlight = useRef(false);

  const titles = {
    sites: "내 현장",
    film: "필름 · 재단",
    report: "완료보고",
    pay: "근무금액",
    photos: "시공 사진",
  };

  useEffect(() => {
    const target = workerDestination(
      window.location.pathname + window.location.search
    );

    if (mode === "home" && target !== "/worker") {
      router.replace(target);
      return;
    }

    loadWorkerPage();

    const refresh = () => {
      if (document.visibilityState === "visible") {
        loadWorkerPage({ background: true });
      }
    };

    const restore = event => {
      if (event.persisted) refresh();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener(
        "visibilitychange",
        refresh
      );
    };
  }, [router, mode]);

  async function loadWorkerPage({
    background = false,
  } = {}) {
    if (refreshInFlight.current) return;

    refreshInFlight.current = true;

    if (!background) setLoading(true);

    setSitesLoading(true);
    setMessage("");

    try {
      const result = await loadMyWorkerSites();

      setWorker(result.worker);
      setSites(result.sites || []);

      void syncNotificationStatus();
    } catch (error) {
      console.error("시공자 현장 조회 오류:", error);
      setSites([]);

      if (error.status === 401) {
        setWorker(null);
        router.replace(workerLoginUrl());
      } else {
        setMessage(
          error.message ||
            "배정 현장을 불러오지 못했습니다."
        );
      }
    } finally {
      refreshInFlight.current = false;
      setSitesLoading(false);
      setLoading(false);
    }
  }

  async function syncNotificationStatus() {
    try {
      const status = await getPushSubscriptionStatus();

      const enabled = Boolean(
        status?.supported &&
          status?.permission === "granted" &&
          status?.subscribed
      );

      setNotificationEnabled(enabled);
      return enabled;
    } catch (error) {
      console.error(
        "시공자 Push 상태 확인 오류:",
        error
      );
      setNotificationEnabled(false);
      return false;
    }
  }

  async function handleEnableNotifications() {
    if (notificationLoading) return;

    setNotificationLoading(true);
    setNotificationMessage("");

    try {
      await enablePushNotifications();

      if (!(await syncNotificationStatus())) {
        throw new Error(
          "Push 알림 구독을 확인하지 못했습니다."
        );
      }

      setNotificationMessage(
        "✅ 현장 알림이 켜졌습니다."
      );
    } catch (error) {
      console.error(
        "시공자 Push 활성화 오류:",
        error
      );
      setNotificationEnabled(false);
      setNotificationMessage(
        `❌ ${
          error?.message ||
          "알림을 켜지 못했습니다."
        }`
      );
    } finally {
      setNotificationLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("로그아웃 오류:", error);
    } finally {
      router.replace("/worker/login");
      router.refresh();
    }
  }

  const today = koreanDay();
  const reportSites = sites.filter(site => isPastWorkerSchedule(site, today));
  const reportCompanies = [...new Map(reportSites.filter(site => siteStatus(site) !== "cancelled" && site.company_id).map(site => [site.company_id, site.company_name || "업체명 확인 필요"])).entries()];

  const visibleSites = (mode === "report" ? reportSites : sites).filter(site => {
    if (mode === "report" && reportCompany !== "all" && site.company_id !== reportCompany) return false;
    if (mode === "report" && reportFilter === "todo" && ["approved","accepted"].includes(site.report_review_status)) return false;
    if (mode === "report" && reportFilter === "approved" && !["approved","accepted"].includes(site.report_review_status)) return false;
    if (siteStatus(site) === "cancelled") {
      return false;
    }

    const text = [
      site.site_name,
      site.customer_name,
      site.company_name,
      site.address || site.site_address,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(
      search.toLowerCase().trim()
    );
  });

  if (loading) {
    return (
      <main className={styles.page}>
        <div
          className={styles.loadingPage}
          role="status"
        >
          내 현장 일정을 불러오고 있습니다...
        </div>
      </main>
    );
  }

  if (!worker) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <section className={styles.accountError}>
            <h1 className={styles.pageTitle}>
              시공자 페이지
            </h1>

            <div
              className={styles.error}
              role="alert"
            >
              {message ||
                "시공자 정보를 확인할 수 없습니다."}
            </div>

            <div className={styles.accountActions}>
              <button
                type="button"
                className={styles.logout}
                onClick={() => loadWorkerPage()}
              >
                현장 다시 확인
              </button>

              <button
                type="button"
                className={styles.pushButton}
                onClick={() =>
                  router.replace(workerLoginUrl())
                }
              >
                시공자 로그인
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const homeProfile = (
<section
          className={styles.profile}
          aria-label="시공자 정보 및 알림"
        >
          <div className={styles.identity}>
            <WorkerAvatar className={styles.avatar} refreshKey={worker} />

            <div>
              <p className={styles.workerName}>
                {worker.worker_name || "시공자"}
              </p>
              <p className={styles.workerPhone}>
                {worker.worker_phone ||
                  "연락처 미등록"}
              </p>
            </div>
          </div>

          {notificationEnabled ? (
            <span className={styles.pushOn}>
              ✓ 알림 켜짐
            </span>
          ) : (
            <button
              type="button"
              className={styles.pushButton}
              onClick={handleEnableNotifications}
              disabled={notificationLoading}
            >
              {notificationLoading
                ? "설정 중..."
                : "🔔 현장 알림 켜기"}
            </button>
          )}

          {notificationMessage && (
            <p
              className={styles.pushMessage}
              role="status"
              style={{
                color:
                  notificationMessage.startsWith("✅")
                    ? "#15803d"
                    : "#b91c1c",
              }}
            >
              {notificationMessage}
            </p>
          )}
        </section>
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <p className={styles.eyebrow}>
              시공자 전용
            </p>
            <h1 className={styles.pageTitle}>
              필름장이
            </h1>
          </div>

          <button
            type="button"
            className={styles.logout}
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className={styles.content}>
        {mode !== "home" && homeProfile}

        {mode === "home" ? (
          <>
            {message && (
              <p
                role="alert"
                className={styles.error}
              >
                {message}
              </p>
            )}

            <WorkerHomeDashboard
              homeProfile={homeProfile}
              worker={worker}
              sites={sites}
              onOpen={(id, section) =>
                router.push(
                  `/worker/site/${id}${
                    section
                      ? `?section=${section}`
                      : ""
                  }`
                )
              }
            />
          </>
        ) : (
          <>
            <div className="worker-menu-heading">
              <Link href="/worker" data-ui-link="action">
                ‹ 홈으로
              </Link>
              <h2>{titles[mode]}</h2>
            </div>

            {mode === "sites" && (
              <WorkerSiteCalendar
                sites={sites}
                loading={sitesLoading}
                error={message}
                onRefresh={() =>
                  loadWorkerPage({
                    background: true,
                  })
                }
                onOpen={id =>
                  router.push(
                    `/worker/site/${id}`
                  )
                }
              />
            )}

            {mode === "pay" && (
              <WorkerMonthlyPay
                key={worker.worker_id}
                refreshKey={sites}
              />
            )}

            {["film", "report", "photos"].includes(
              mode
            ) && (
              <section className="worker-menu-picker">
                {mode === "film" && <Link href="/worker/notebook" data-ui-link="action" style={{display:"block",marginBottom:16}}>📒 실측수첩 · 치수 기록하고 재단하기 →</Link>}
                {mode === "film" && (
                  <div
                    style={{
                      marginBottom: 20,
                      padding: 16,
                      borderRadius: 16,
                      background: "#edf6ff",
                      border:
                        "1px solid #c9e1f7",
                    }}
                  >
                    <strong
                      style={{
                        color: "#173456",
                        fontSize: 17,
                      }}
                    >
                      ✂️ 현장 없이 재단하기
                    </strong>

                    <p
                      style={{
                        margin: "8px 0 14px",
                      }}
                    >
                      필름 코드와 롤 길이를 직접
                      입력해 재단할 수 있습니다.
                    </p>

                    <Link
                      href="/worker/cutting"
                      style={{
                        display: "block",
                        padding: "14px 16px",
                        borderRadius: 12,
                        background: "#243f52",
                        color: "#fff",
                        textAlign: "center",
                        textDecoration: "none",
                        fontWeight: 800,
                      }}
                     data-ui-link="action">
                      재단앱 사용 →
                    </Link>
                  </div>
                )}

                <p>
                  {mode === "film"
                    ? "현장 필름으로 재단하려면 아래 현장을 선택하세요."
                    : mode === "report"
                      ? "마지막 배정일이 지난 현장입니다. 오늘 작업한 현장은 내일부터 표시됩니다."
                      : "작업할 현장을 선택하세요."}
                </p>

                {mode === "report" && (
                  <div style={{marginBottom:16}}>
                    <label htmlFor="report-company">협력 업체 선택</label>
                    <select id="report-company" value={reportCompany}
                      onChange={event=>{setReportCompany(event.target.value);setSearch("");}}
                      style={{display:"block",width:"100%",padding:"13px",marginTop:8,
                        border:"1px solid #cbd5e1",borderRadius:12,background:"#fff",fontSize:15}}>
                      <option value="all">전체 업체 ({reportCompanies.length})</option>
                      {reportCompanies.map(([id,name])=><option key={id} value={id}>{name}</option>)}
                    </select>
                  </div>
                )}

                {mode === "report" && (
                  <div role="group" aria-label="완료보고 상태" style={{display:"flex",gap:8,marginBottom:12}}>
                    {[
                      ["todo","보고·확인 필요"],
                      ["approved","승인 완료"],
                      ["all","전체"]
                    ].map(([id,label])=>(
                      <button key={id} type="button" aria-pressed={reportFilter===id}
                        onClick={()=>setReportFilter(id)}
                        style={{flex:1,padding:"11px 6px",borderRadius:12,
                          border:"1px solid #cbd5e1",fontSize:13,fontWeight:700,
                          background:reportFilter===id?"#193758":"#fff",
                          color:reportFilter===id?"#fff":"#334155"}}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <label>
                  현장 검색
                  <input
                    value={search}
                    onChange={event =>
                      setSearch(
                        event.target.value
                      )
                    }
                    placeholder="현장명 또는 주소"
                  />
                </label>

                {message && (
                  <p
                    role="alert"
                    className={styles.error}
                  >
                    {message}
                  </p>
                )}

                {visibleSites.map(site => (
                  <Link
                    key={site.site_id}
                    href={`/worker/site/${site.site_id}?section=${mode}`}
                  >
                    <span>
                      {mode === "report" && <small style={{color:"#2563eb",fontWeight:800}}>협력 업체 · {site.company_name || "업체명 확인 필요"}</small>}
                      <strong>
                        {site.site_name ||
                          site.customer_name ||
                          "현장"}
                      </strong>
                      {mode === "report" && <small style={{fontSize:12,color:["approved","accepted"].includes(site.report_review_status)?"#047857":"#64748b"}}>{["approved","accepted"].includes(site.report_review_status)?"승인 완료":site.report_review_status==="pending"?"관리자 확인 대기":site.report_review_status==="rejected"?"반려 · 수정 필요":"보고 작성 필요"}</small>}
                      <small>
                        {site.address ||
                          site.site_address ||
                          "현장 상세에서 주소 확인"}
                      </small>
                    </span>
                    <b aria-hidden="true">›</b>
                  </Link>
                ))}

                {!visibleSites.length && (
                  <p>
                    {mode === "report" ? "현재 조건에 맞는 지난 시공 현장이 없습니다." : "표시할 현장이 없습니다."}
                  </p>
                )}

                <button
                  type="button"
                  disabled={sitesLoading}
                  onClick={() =>
                    loadWorkerPage({
                      background: true,
                    })
                  }
                >
                  {sitesLoading
                    ? "확인 중…"
                    : "현장 새로고침"}
                </button>
              </section>
            )}

            <nav
              className="worker-menu-bottom"
              aria-label="시공자 메뉴"
            >
              {[
                { id: "home", label: "홈", href: "/worker", icon: "home" },
                { id: "notebook", label: "실측수첩", href: "/worker/notebook", icon: "notebook" },
                { id: "sites", label: "내 현장", href: "/worker/menu/sites", icon: "camera" },
                { id: "attendance", label: "근무기록", href: "/worker/attendance", icon: "attendance" },
                { id: "samples", label: "필름 샘플", href: "/samples?from=worker", icon: "customer" },
                { id: "more", label: "더보기", href: "/worker/more" },
              ].map(item => (
                <Link key={item.id} href={item.href} aria-current={mode === item.id ? "page" : undefined}>
                  {item.icon ? <ToolIllustration kind={item.icon} size={36} className="film-nav-image" /> : <span aria-hidden="true" style={{fontSize:30}}>▦</span>}
                  <small>{item.label}</small>
                </Link>
              ))}
            </nav>
          </>
        )}

        <style jsx global>{`
          main:has(.worker-menu-heading) {
            background: #fcf9f2;
            padding-bottom: 100px;
          }

          .worker-menu-heading {
            display: flex;
            align-items: center;
            gap: 18px;
            margin: 20px 0;
            color: #173456;
          }

          .worker-menu-heading a {
            color: #4388c7;
            text-decoration: none;
            font-size: 14px;
          }

          .worker-menu-heading h2 {
            font-size: 23px;
            margin: 0;
          }

          .worker-menu-picker {
            background: #fff;
            border: 1px solid #eee8dd;
            border-radius: 24px;
            padding: 20px;
          }

          .worker-menu-picker p {
            font-size: 14px;
            color: #7a8998;
          }

          .worker-menu-picker label {
            display: block;
            font-size: 12px;
            color: #708599;
          }

          .worker-menu-picker input {
            display: block;
            box-sizing: border-box;
            width: 100%;
            border: 1px solid #dde6ee;
            border-radius: 13px;
            padding: 13px;
            font-size: 16px;
            margin: 8px 0 18px;
          }

          .worker-menu-picker > a {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
            border: 1px solid #eee8dd;
            border-radius: 16px;
            padding: 17px;
            margin: 10px 0;
            text-decoration: none;
            color: #173456;
          }

          .worker-menu-picker strong,
          .worker-menu-picker small {
            display: block;
          }

          .worker-menu-picker strong {
            font-size: 17px;
          }

          .worker-menu-picker small {
            margin-top: 7px;
            font-size: 12px;
            color: #7e8e9d;
          }

          .worker-menu-picker b {
            color: #7ca5c9;
            font-size: 23px;
          }

          .worker-menu-picker button {
            padding: 12px 16px;
            border: 0;
            border-radius: 12px;
            background: #eaf4ff;
            color: #377fc2;
            cursor: pointer;
          }

          .worker-menu-bottom {
            position: fixed;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: min(100%, 900px);
            display: flex;
            z-index: 40;
            background: #fffdf9f7;
            border-top: 1px solid #eee8dd;
            padding: 8px 6px
              calc(
                9px +
                env(safe-area-inset-bottom)
              );
          }

          .worker-menu-bottom a {
            flex: 1;
            text-decoration: none;
            text-align: center;
            color: #756f66;
            font-size: 12px;
            padding: 5px 2px;
            min-height: 59px;
            border-radius: 12px;
          }

          .worker-menu-bottom
            a[aria-current="page"] {
            background: #eae2d6;
            color: #243648;
            font-weight: 700;
          }
        `}</style>
      </div>
    </main>
  );
                  }

