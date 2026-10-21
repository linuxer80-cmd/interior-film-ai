"use client";

import { useState } from "react";
import SiteDirections from "../../SiteDirections";
import WorkerTeam from "./WorkerTeam";
import styles from "./WorkerSiteInfo.module.css";

export default function WorkerSiteInfo({ site, siteId, materials = [], materialsMessage = "", initialDate, active }) {
  const [notice, setNotice] = useState("");
  const address = [site.address, site.address_detail].filter(Boolean).join(" ");
  const phone = String(site.customer_phone || "").replace(/[^+0-9]/g, "");
  const dateText = value => {
    if (!value) return "미정";
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value);
    return Number.isNaN(date.getTime()) ? "미정" : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
  };
  const allDates = Array.isArray(site.work_dates) ? [...new Set(site.work_dates)].sort() : null;
  async function copyAddress() {
    try { await navigator.clipboard.writeText(address); setNotice("주소를 복사했습니다."); }
    catch { setNotice("주소를 길게 눌러 복사해주세요."); }
  }
  return <div className={styles.info}>
    <section className={styles.location} aria-label="위치와 연락처">
      <h2>위치·연락처</h2>
      <SiteDirections site={site} workDate={initialDate} compact />
      {address && <button type="button" className={styles.copy} onClick={copyAddress}>주소 복사</button>}
      <Row label="고객" value={site.customer_name} />
      {phone ? <a className={styles.call} href={`tel:${phone}`}>고객 전화 · {site.customer_phone}</a> : <p className={styles.muted}>고객 연락처 미등록</p>}
      {notice && <p role="status" className={styles.muted}>{notice}</p>}
    </section>
    <section className={styles.section} aria-label="시공 일정과 작업자">
      <h2>시공 일정·작업자</h2>
      {site.assigned_dates?.length ? <div className={styles.dates}>{site.assigned_dates.map(day => <div className={styles.date} key={day.work_date}><strong>{dateText(day.work_date)}</strong><span>{day.role === "leader" ? "책임 팀장" : "팀원"}</span></div>)}</div> : <Row label="내 작업일" value={`${dateText(site.schedule_start)}${site.schedule_end && site.schedule_end !== site.schedule_start ? ` ~ ${dateText(site.schedule_end)}` : ""}`} />}
      {site.schedule_notice && <p className={styles.notice}>{site.schedule_notice}</p>}
      <details open={initialDate ? true : undefined} className={styles.details}>
        <summary>전체 일정·함께하는 시공자</summary>
        <Row label="전체 작업일" value={allDates ? allDates.length ? allDates.map(dateText).join(" · ") : "일정 미등록" : `${dateText(site.schedule_start)}${site.schedule_end && site.schedule_end !== site.schedule_start ? ` ~ ${dateText(site.schedule_end)}` : ""}`} />
        <WorkerTeam key={siteId} siteId={siteId} dates={site.assigned_dates} initialDate={initialDate} active={active} />
      </details>
    </section>
    <section className={styles.section} aria-label="시공 내용">
      <h2>시공 내용</h2>
      <Row label="시공 구분" value={site.work_type} />
      <div className={styles.description}><small>작업 범위·상세 내용</small><p>{site.work_description || "상세 시공 내용 미등록"}</p></div>
    </section>
    <section className={styles.section} aria-label="사용할 필름 안내">
      <h2>사용할 필름</h2>
      {materialsMessage ? <p role="alert">{materialsMessage}</p> : !materials.length ? <p className={styles.muted}>등록된 자재가 없습니다.</p> : materials.map(material => <div className={styles.film} key={material.material_id || material.id}>
        <strong>{[material.brand, material.product_code || material.product_name || material.code].filter(Boolean).join(" ") || "제품 확인 필요"}</strong>
        <Row label="방염 구분" value={material.price_type === "fire" ? "방염" : material.price_type === "non_fire" ? "비방염" : "미등록"} />
        <Row label="예정 사용량" value={Number(material.quantity) > 0 ? `${material.quantity}${material.unit || ""}` : "미등록"} />
        {material.memo && <p className={styles.memo}>{material.memo}</p>}
      </div>)}
      <p className={styles.muted}>반출·반납과 재고는 상단 ‘자재·재단’에서 확인하세요.</p>
    </section>
    <section className={styles.section} aria-label="현장 메모와 전달사항"><h2>현장 메모·전달사항</h2><p className={styles.memo}>{site.memo?.trim() || "등록된 전달사항이 없습니다."}</p></section>
  </div>;
}
function Row({ label, value }) { return <div className={styles.row}><span>{label}</span><div>{value || "미등록"}</div></div>; }
