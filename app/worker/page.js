"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { siteStatus } from "../utils/workerCalendar";
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
import WorkerHomeDashboard from "./WorkerHomeDashboard";
import styles from "./WorkerSiteCalendar.module.css";

export default function WorkerPage({ mode = "home" }) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState(null);
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");

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
      window.location.pathname + window.location.search,
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

    const restore = (event) => {
      if (event.persisted) refresh();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, mode]);

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

      void syncNotificationStatus();
    } catch (error) {
      console.error("시공자 현장 조회 오류:", error);
      setSites([]);

      if (error.status === 401) {
        setWorker(null);
        router.replace(workerLoginUrl());
      } else {
        setMessage(error.message || "배정 현장을 불러오지 못했습니다.");
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
          status?.subscribed,
      );

      setNotificationEnabled(enabled);
      return enabled;
    } catch (error) {
      console.error("시공자 Push 상태 확인 오류:", error);
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
        throw new Error("Push 알림 구독을 확인하지 못했습니다.");
      }

      setNotificationMessage("✅ 현장 알림이 켜졌습니다.");
    } catch (error) {
      console.error("시공자 Push 활성화 오류:", error);
      setNotificationEnabled(false);
      setNotificationMessage(
        `❌ ${error?.message || "알림을 켜지 못했습니다."}`,
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

  const visibleSites = sites.filter((site) => {
    if (siteStatus(site) === "cancelled") return false;

    const text = [
      site.site_name,
      site.customer_name,
      site.address || site.site_address,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(search.toLowerCase().trim());
  });

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingPage} role="status">
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
            <h1 className={styles.pageTitle}>시공자 페이지</h1>

            <div className={styles.error} role="alert">
              {message || "시공자 정보를 확인할 수 없습니다."}
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
                onClick={() => router.replace(workerLoginUrl())}
              >
                시공자 로그인
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <p className={styles.eyebrow}>시공자 전용</p>
            <h1 className={styles.pageTitle}>필름장이</h1>
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
        <section
          className={styles.profile}
          aria-label="시공자 정보 및 알림"
        >
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              👷
            </span>

            <div>
              <p className={styles.workerName}>
                {worker.worker_name || "시공자"}
              </p>
              <p className={styles.workerPhone}>
                {worker.worker_phone || "연락처 미등록"}
              </p>
            </div>
          </div>

          {notificationEnabled ? (
            <span className={styles.pushOn}>✓ 알림 켜짐</span>
          ) : (
            <button
              type="button"
              className={styles.pushButton}
              onClick={handleEnableNotifications}
              disabled={notificationLoading}
            >
              {notificationLoading ? "설정 중..." : "🔔 현장 알림 켜기"}
            </button>
          )}

          {notificationMessage && (
            <p
              className={styles.pushMessage}
              role="status"
              style={{
                color: notificationMessage.startsWith("✅")
                  ? "#15803d"
                  : "#b91c1c",
              }}
            >
              {notificationMessage}
            </p>
          )}
        </section>

        {mode === "home" ? (
          <>
            {message && (
              <p role="alert" className={styles.error}>
                {message}
              </p>
            )}

            <WorkerHomeDashboard
              worker={worker}
              sites={sites}
              onOpen={(id, section) =>
                router.push(
                  `/worker/site/${id}${
                    section ? `?section=${section}` : ""
                  }`,
                )
              }
            />
          </>
        ) : (
          <>
            <div className="worker-menu-heading">
              <Link href="/worker">‹ 홈으로</Link>
              <h2>{titles[mode]}</h2>
            </div>

            {mode === "sites" && (
              <WorkerSiteCalendar
                sites={sites}
                loading={sitesLoading}
                error={message}
                onRefresh={() =>
                  loadWorkerPage({ background: true })
                }
                onOpen={(id) => router.push(`/worker/site/${id}`)}
              />
            )}

            {mode === "pay" && (
              <WorkerMonthlyPay
                key={worker.worker_id}
                refreshKey={sites}
              />
            )}

            {["film", "report", "photos"].includes(mode) && (
              <section className="worker-menu-picker">
                <p>작업할 현장을 선택하세요.</p>

                <label>
                  현장 검색
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="현장명 또는 주소"
                  />
                </label>

                {message && (
                  <p role="alert" className={styles.error}>
                    {message}
                  </p>
                )}

                {visibleSites.map((site) => (
                  <Link
                    key={site.site_id}
                    href={`/worker/site/${site.site_id}?section=${mode}`}
                  >
                    <span>
                      <strong>
                        {site.site_name || site.customer_name || "현장"}
                      </strong>
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
                  <p>표시할 현장이 없습니다.</p>
                )}

                <button
                  type="button"
                  disabled={sitesLoading}
                  onClick={() =>
                    loadWorkerPage({ background: true })
                  }
                >
                  {sitesLoading ? "확인 중…" : "현장 새로고침"}
                </button>
              </section>
            )}

            <nav
              className="worker-menu-bottom"
              aria-label="시공자 메뉴"
            >
              {[
                { id: "home", label: "홈" },
                { id: "sites", label: "내 현장" },
                { id: "film", label: "재단" },
                { id: "report", label: "완료보고" },
                { id: "pay", label: "근무금액" },
              ].map((item) => (
                <Link
                  key={item.id}
                  href={
                    item.id === "home"
                      ? "/worker"
                      : `/worker/menu/${item.id}`
                  }
                  aria-current={mode === item.id ? "page" : undefined}
                >
                  {item.label}
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
            background: #fffffff7;
            border-top: 1px solid #eee8dd;
            padding: 12px 5px calc(12px + env(safe-area-inset-bottom));
          }

          .worker-menu-bottom a {
            flex: 1;
            text-decoration: none;
            text-align: center;
            color: #8391a0;
            font-size: 12px;
            padding: 12px 0;
            border-radius: 12px;
          }

          .worker-menu-bottom a[aria-current="page"] {
            background: #edf6ff;
            color: #398bdb;
            font-weight: 700;
          }
        `}</style>
      </div>
    </main>
  );
}
// 파일 끝
