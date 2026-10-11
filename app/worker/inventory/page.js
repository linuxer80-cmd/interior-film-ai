"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  reportRequest,
} from "../../utils/reportClient";

import "../../components/laborMarket.css";

export default function WorkerInventory() {
  const [data, setData] = useState(null);
  const [siteId, setSiteId] = useState("");
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

  const length = value =>
    Number(
      Number(value || 0).toFixed(3)
    ).toLocaleString("ko-KR");

  return (
    <main className="labor-shell">
      <nav>
        <Link href="/worker">
          ‹ 시공자 홈
        </Link>

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
            <label>
              담당 현장

              <select
                value={siteId}
                onChange={event =>
                  setSiteId(event.target.value)
                }
              >
                <option value="">
                  현장을 선택해주세요
                </option>

                {data.sites.map(site => (
                  <option
                    key={site.id}
                    value={site.id}
                  >
                    {site.company_name}
                    {" · "}
                    {site.site_name}
                  </option>
                ))}
              </select>
            </label>
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
      >
        내 현장 보기 ›
      </Link>
    </main>
  );
}
