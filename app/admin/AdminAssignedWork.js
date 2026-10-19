"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { loadMyWorkerSites } from "../utils/workerSites";
import WorkReportForm from "../components/WorkReportForm";
import styles from "./AssignedWork.module.css";

const AttendancePage = dynamic(() => import("../components/AttendancePage"));
const CuttingWorkspace = dynamic(() => import("../worker/cutting/CuttingWorkspace"));

export default function AdminAssignedWork({ siteId, companyId, section, onNavigate, onSubmitted }) {
  const [context, setContext] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [report, setReport] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++sequence.current;
    // Recheck assignment before showing a privileged workflow after navigation.
    setLoading(true);
    setError("");
    try {
      const list = await loadMyWorkerSites();
      const mine = list.sites?.find(item => item.site_id === siteId && item.company_id === companyId);
      const details = mine ? await loadMyWorkerSites({ siteId }) : null;
      if (version === sequence.current) setContext(details);
    } catch (cause) {
      if (version === sequence.current) setError(cause.message);
    } finally {
      if (version === sequence.current) setLoading(false);
    }
  }, [siteId, companyId]);
  useEffect(() => {
    refresh();
    const resume = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", resume);
    window.addEventListener("site-assignment-changed", refresh);
    document.addEventListener("visibilitychange", resume);
    return () => {
      sequence.current++;
      window.removeEventListener("focus", resume);
      window.removeEventListener("site-assignment-changed", refresh);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh, section]);
  const mine = context?.site;
  const visible = ["info", "materials", "report"].includes(section);
  if (loading && !context) return <p hidden={!visible} className={styles.muted}>본인 현장 배정을 확인하고 있습니다…</p>;
  if (error) return <div hidden={!visible} className={styles.card} role="alert"><p>내 시공 배정을 확인하지 못했습니다. {error}</p><button onClick={refresh}>다시 확인</button></div>;
  if (!mine) return section === "info" ? <div className={styles.notice}>현장 관리자 · 본인을 팀장 또는 시공팀원으로 배정하면 이 화면에 본인 시공 기능이 표시됩니다.</div> : null;
  return <section hidden={!visible} className={styles.work} aria-label="관리자 본인 시공">
    <div className={styles.card}>
      <div className={styles.row}><div><small className={styles.muted}>일정 배정으로 참여 확정</small><h3>내 시공 · {mine.my_role === "leader" ? "책임 팀장" : "시공팀원"}</h3></div><button onClick={refresh}>배정 새로고침</button></div>
      {section === "info" && <><p>관리자 계정으로 본인의 작업을 기록합니다. 저장 권한은 현재 현장 배정을 다시 확인합니다.</p><div className={styles.actions}><button onClick={() => setAttendance(v => !v)} aria-expanded={attendance}>내 출퇴근</button><button onClick={() => onNavigate("materials")}>자재 반출·반납</button><button onClick={() => onNavigate("expenses")}>내 경비</button><button onClick={() => onNavigate("report")}>내 완료보고</button></div></>}
      {section === "materials" && <><p>아래 창고 롤에서 반출·반납하고, 현장에 지정된 필름으로 재단합니다. 방염 구분은 선택한 롤의 정보를 따릅니다.</p><button onClick={() => setCutting(v => !v)} aria-expanded={cutting}>{cutting ? "재단 도구 접기" : "이 화면에서 재단하기"}</button></>}
      {section === "report" && <><p>본인 시공 내용·완료 사진·경비를 저장합니다. 제출 가능 여부는 기존 완료보고 권한 검증을 따릅니다.</p><button onClick={() => setReport(true)}>{report ? "작성 중인 내 완료보고" : "내 완료보고 작성"}</button></>}
    </div>
    {attendance && <div hidden={section !== "info"}><AttendancePage embedded mode="worker" /></div>}
    {cutting && <div hidden={section !== "materials"}><CuttingWorkspace key={siteId} siteId={siteId} embedded /></div>}
    {report && <div hidden={section !== "report"}><WorkReportForm key={siteId} siteId={siteId} site={mine} active={section === "report"} onSubmitted={() => { setReport(false); onSubmitted?.(); }} /></div>}
  </section>;
}
