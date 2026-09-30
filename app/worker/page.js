"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { loadMyWorkerSites, workerDestination, workerLoginUrl } from "../utils/workerSites";
import { enablePushNotifications, getPushSubscriptionStatus } from "../utils/pushSubscription";
import WorkerSiteCalendar from "./WorkerSiteCalendar";
import WorkerMonthlyPay from "./WorkerMonthlyPay";
import styles from "./WorkerSiteCalendar.module.css";

export default function WorkerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState(null);
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const refreshInFlight = useRef(false);

  useEffect(() => {
    const target = workerDestination(window.location.pathname + window.location.search);
    if (target !== "/worker") {
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
      const enabled = Boolean(status?.supported && status?.permission === "granted" && status?.subscribed);
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
      if (!await syncNotificationStatus()) throw new Error("Push 알림 구독을 확인하지 못했습니다.");
      setNotificationMessage("✅ 현장 알림이 켜졌습니다.");
    } catch (error) {
      console.error("시공자 Push 활성화 오류:", error);
      setNotificationEnabled(false);
      setNotificationMessage(`❌ ${error?.message || "알림을 켜지 못했습니다."}`);
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

  if (loading) return <main className={styles.page}><div className={styles.loadingPage} role="status">내 현장 일정을 불러오고 있습니다...</div></main>;
  if (!worker) return <main className={styles.page}><div className={styles.content}><section className={styles.accountError}>
    <h1 className={styles.pageTitle}>시공자 페이지</h1>
    <div className={styles.error} role="alert">{message || "시공자 정보를 확인할 수 없습니다."}</div>
    <div className={styles.accountActions}>
      <button type="button" className={styles.logout} onClick={() => loadWorkerPage()}>현장 다시 확인</button>
      <button type="button" className={styles.pushButton} onClick={() => router.replace(workerLoginUrl())}>시공자 로그인</button>
    </div>
  </section></div></main>;

  return <main className={styles.page}>
    <header className={styles.header}><div className={styles.headerInner}>
      <div><p className={styles.eyebrow}>시공자 전용</p><h1 className={styles.pageTitle}>현장 관리</h1></div>
      <button type="button" className={styles.logout} onClick={handleLogout}>로그아웃</button>
    </div></header>
    <div className={styles.content}>
      <section className={styles.profile} aria-label="시공자 정보 및 알림">
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">👷</span>
          <div><p className={styles.workerName}>{worker.worker_name || "시공자"}</p><p className={styles.workerPhone}>{worker.worker_phone || "연락처 미등록"}</p></div>
        </div>
        {notificationEnabled ? <span className={styles.pushOn}>✓ 알림 켜짐</span> : <button type="button" className={styles.pushButton} onClick={handleEnableNotifications} disabled={notificationLoading}>{notificationLoading ? "설정 중..." : "🔔 현장 알림 켜기"}</button>}
        {notificationMessage && <p className={styles.pushMessage} role="status" style={{ color: notificationMessage.startsWith("✅") ? "#15803d" : "#b91c1c" }}>{notificationMessage}</p>}
      </section>
      <WorkerMonthlyPay key={worker.worker_id} refreshKey={sites} />
      <WorkerSiteCalendar sites={sites} loading={sitesLoading} error={message}
        onRefresh={() => loadWorkerPage({ background: true })}
        onOpen={(id) => router.push(`/worker/site/${id}`)} />
    </div>
  </main>;
}
