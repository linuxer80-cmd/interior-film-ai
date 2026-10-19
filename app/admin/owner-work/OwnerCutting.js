"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { reportRequest } from "../../utils/reportClient";
import styles from "./OwnerWork.module.css";
const CuttingWorkspace = dynamic(
  () => import("../../worker/cutting/CuttingWorkspace"),
  { loading: () => <p>재단 도구를 불러오고 있습니다…</p> },
);
const loadSite = ({ siteId }) =>
  reportRequest(
    `/api/admin/owner-work?siteId=${encodeURIComponent(siteId)}&cutting=1`,
  );
export default function OwnerCutting({ siteId }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.panel}>
      <div className={styles.row}>
        <h2>현장 재단</h2>
        <button
          className={styles.action}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "재단 도구 접기" : "재단 도구 열기"}
        </button>
      </div>
      <p className={styles.muted}>
        이 현장의 필름과 반출 중인 롤을 불러와 관리자 화면에서 재단합니다.
      </p>
      {open && (
        <CuttingWorkspace
          key={siteId}
          siteId={siteId}
          loadSite={loadSite}
          embedded
        />
      )}
    </section>
  );
}
