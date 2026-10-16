"use client";

import HomeReturnButton from "../../components/HomeReturnButton";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  reportRequest,
} from "../../utils/reportClient";

import "../../components/laborMarket.css";

export default function WorkerInventory() {
  const [data, setData] = useState(null);
  const [siteId, setSiteId] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    setBusy(true);
    setData(null);
    setError("");

    const path =
      "/api/worker-stock" +
      (siteId
        ? `?siteId=${encodeURIComponent(siteId)}`
        : "");

    reportRequest(path)
      .then(result => {
        if (active) setData(result);
      })
      .catch(error => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });

    return () => {
      active = false;
    };
  }, [siteId, reload]);

  const choices = data?.sites || [];
  const companies = [...new Map(choices.map(site => [site.company_id,site.company_name || "업체명 확인 필요"])).entries()];
  const filteredSites = companyId === "all" ? choices : choices.filter(site => site.company_id === companyId);

  const length = value =>
    Number(
      Number(value || 0).toFixed(3)
    ).toLocaleString("ko-KR");

  return (
    <main className="labor-shell">
      <nav>
        <HomeReturnButton />

        <button
          disabled={busy}
          onClick={() => setReload(n => n + 1)}
        >
          새로고침
        </button>
      </nav>

      <h1>담당 현장 자재 재고</h1>

      <p>
        오늘 이후 팀장으로 배정된 현장의
        사용 필름만 확인합니다.
      </p>

      {busy && (
        <p role="status">
          현장 재고를 확인하는 중…
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          {data.state === "no_leader_site" ? (
            <aside>
              현재 팀장으로 배정된 현장이 없습니다.
              현장 배정을 관리자에게 확인해주세요.
            </aside>
          ) : (
            <div style={{display:"grid",gap:14}}>
              <label>
                협력 업체
                <select value={companyId}
                  onChange={event=>{setCompanyId(event.target.value);setSiteId("");}}
                  style={{display:"block",width:"100%",marginTop:8}}>
                  <option value="all">전체 업체 ({companies.length})</option>
                  {companies.map(([id,name])=>(
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                담당 현장
                <select value={siteId}
                  onChange={event=>setSiteId(event.target.value)}
                  style={{display:"block",width:"100%",marginTop:8}}>
                  <option value="">현장을 선택해주세요 ({filteredSites.length}개)</option>
                  {filteredSites.map(site=>(
                    <option key={site.id} value={site.id}>
                      {companyId==="all" ? (site.company_name+" · ") : ""}
                      {site.site_name}
                    </option>
                  ))}
                </select>
              </label>
              {!siteId && <p style={{fontSize:13,color:"#64748b",margin:0}}>
                {companyId==="all" ? "전체 협력 업체의 담당 현장을 표시합니다." : "선택한 업체의 담당 현장만 표시합니다."}
                재고는 현장을 선택하면 조회됩니다.
              </p>}
            </div>
          )}

          {data.selectedSite && (
            <aside>
              <strong>
                {data.selectedSite.company_name}
              </strong>

              <p>
                {data.selectedSite.site_name}
              </p>

              <small>
                팀장 배정일{" "}
                {data.selectedSite.work_dates.join(", ")}
              </small>
            </aside>
          )}

          {data.message && (
            <aside role="status">
              {data.message}
            </aside>
          )}

          {data.state === "available" && (
            <>
              <small>
                표시된 재고는 업체가 앱에 기록한
                가져갈 수 있는 길이입니다.
                현장에 예약된 물량을 의미하지 않습니다.
              </small>

              {data.materials.map(material => (
                <article key={material.id}>
                  <small>
                    {material.brand ||
                      "브랜드 미등록"}
                  </small>

                  <h2>
                    {material.product_code ||
                      material.product_name ||
                      "필름"}
                  </h2>

                  <p>
                    현장 등록 수량{" "}
                    {length(material.quantity)}
                    {material.unit || ""}
                  </p>

                  <p>
                    현재 재고{" "}
                    <strong>
                      {length(material.available_m)}m
                    </strong>
                  </p>

                  {material.available_m === 0 && (
                    <small>
                      앱에 기록된 가져갈 수 있는
                      재고가 없습니다.
                      관리자에게 확인해주세요.
                    </small>
                  )}
                </article>
              ))}
            </>
          )}
        </>
      )}

      <Link
        className="site-link"
        href="/worker/menu/sites"
       data-ui-link="action">
        내 현장 보기 ›
      </Link>
    </main>
  );
}
