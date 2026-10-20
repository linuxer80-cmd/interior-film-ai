"use client";

import { useEffect, useState } from "react";
import { siteDirectionsLinks } from "../utils/siteDirections";
import WorkerCommute from "./WorkerCommute";
import SiteNearbyPlaces from "./SiteNearbyPlaces";
import styles from "./WorkerSiteCalendar.module.css";

export default function SiteDirections({
  site,
  workDate,
  compact = false,
  navigationOnly = false,
}) {
  const [userAgent, setUserAgent] = useState("");
  const [openedAddress, setOpenedAddress] = useState("");

  useEffect(() => {
    const agent = navigator.userAgent;

    setUserAgent(
      /Macintosh/.test(agent) &&
      navigator.maxTouchPoints > 1
        ? "iPad"
        : agent,
    );
  }, []);

  const address = String(site?.address || "").trim();

  const fullAddress = [
    address,
    site?.address_detail,
  ].filter(Boolean).join(" ");

  const links = siteDirectionsLinks(address, userAgent);

  return (
    <div>
      <div className={styles.addressRow}>
        <span className={styles.address}>
          {fullAddress || site?.region || "주소 미등록"}
        </span>

        {links && (
          <a
            className={styles.directionsLink}
            href={links.href}
            target={links.mobile ? undefined : "_blank"}
            rel="noopener noreferrer"
            aria-label={`${address} 네이버지도 길안내`}
            title="네이버지도에서 주소를 확인하고 길찾기를 시작합니다"
            onClick={() => setOpenedAddress(address)}
          >
            <span aria-hidden="true">↗</span> 길안내
          </a>
        )}
      </div>

      {links && openedAddress === address && (
        <div
          className={styles.directionsHelp}
          role="status"
        >
          네이버지도에서 주소를 확인한 뒤
          길찾기·안내 시작을 눌러주세요.

          <a
            href={links.web}
            target="_blank"
            rel="noopener noreferrer"
           data-ui-link="action">
            앱이 열리지 않으면 웹 지도로 보기 ↗
          </a>
        </div>
      )}

      {navigationOnly ? null : compact ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ padding: "8px 0", color: "#285340", fontSize: 13 }}>주변 찾기 · 출발 시간</summary>
      <SiteNearbyPlaces key={`${site?.site_id}:${address}`} siteId={site?.site_id} address={address}/>

      <WorkerCommute
        siteId={site?.site_id}
        workDate={workDate}
      />
        </details>
      ) : <>
      <SiteNearbyPlaces key={`${site?.site_id}:${address}`} siteId={site?.site_id} address={address}/>

      <WorkerCommute
        siteId={site?.site_id}
        workDate={workDate}
      />
      </>}
    </div>
  );
}

