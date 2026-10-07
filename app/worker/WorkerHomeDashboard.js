"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  koreanDay,
  siteStatus,
  workerMonth,
} from "../utils/workerCalendar";

const menus = [
  {
    id: "sites",
    icon: "house",
    title: "내 현장",
    subtitle: "오늘, 새로운 공간으로",
  },
  {
    id: "film",
    icon: "film",
    title: "필름 · 재단",
    subtitle: "정확한 재단이 좋은 마감의 시작",
  },
  {
    id: "report",
    icon: "report",
    title: "완료보고",
    subtitle: "작업한 결과를 간단하게 기록",
  },
  {
    id: "pay",
    icon: "money",
    title: "근무금액",
    subtitle: "오늘의 노력, 정확한 정산으로",
  },
];

function Art({ kind = "house", size = 100 }) {
  const id = useId().replace(/:/g, "");
  const blue = `url(#${id}b)`;
  const cream = `url(#${id}c)`;
  const gold = `url(#${id}g)`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 140"
      fill="none"
      aria-hidden="true"
      style={{ maxWidth: "100%" }}
    >
      <defs>
        <linearGradient
          id={`${id}b`}
          x1="30" y1="20" x2="120" y2="130"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#b3ddff" />
          <stop offset=".45" stopColor="#64a9ed" />
          <stop offset="1" stopColor="#3277c9" />
        </linearGradient>
        <linearGradient
          id={`${id}c`}
          x1="35" y1="30" x2="125" y2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff8e9" />
          <stop offset="1" stopColor="#d5b890" />
        </linearGradient>
        <linearGradient
          id={`${id}g`}
          x1="25" y1="45" x2="130" y2="125"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff0af" />
          <stop offset=".5" stopColor="#f5c653" />
          <stop offset="1" stopColor="#dca026" />
        </linearGradient>
        <filter id={`${id}s`} x="-30%" y="-30%" width="170%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="2.5" floodColor="#937c59" floodOpacity=".16" />
        </filter>
      </defs>

      <ellipse cx="80" cy="126" rx="58" ry="8" fill="#b5a58b" opacity=".13" />

      <g filter={`url(#${id}s)`}>
        {kind === "house" && (
          <>
            <path d="M41 66 84 39l36 27v53H41Z" fill={cream} />
            <path d="M102 64h18v55h-18Z" fill="#cbb394" />
            <path d="m26 66 56-48 52 43-12 15-40-35-45 37Z" fill={blue} />
            <path d="m34 63 48-39 44 37" stroke="#c4e4ff" strokeWidth="3" strokeLinecap="round" />
            <path d="M102 22h12v24h-12Z" fill="#f8f1e5" />
            <path d="M114 22h6v29l-6-5Z" fill="#d9cfc0" />
            <rect x="65" y="82" width="23" height="37" rx="5" fill="#bf9165" />
            <rect x="69" y="86" width="15" height="29" rx="3" fill="#d6ad80" />
            <circle cx="81" cy="102" r="2" fill="#fff0c6" />
            <rect x="46" y="73" width="15" height="18" rx="3" fill="#b7d9ed" />
            <rect x="93" y="73" width="15" height="18" rx="3" fill="#b7d9ed" />
            <path d="M53 74v16m-6-8h13M100 74v16m-6-8h13" stroke="#fff9ed" strokeWidth="2" />
            <ellipse cx="130" cy="99" rx="11" ry="22" fill="#9bc27b" />
            <ellipse cx="141" cy="111" rx="9" ry="13" fill="#71a75f" />
            <path d="M128 109v15" stroke="#78945e" strokeWidth="3" />
            <rect x="19" y="103" width="29" height="21" rx="6" fill={gold} />
            <circle cx="29" cy="112" r="6" fill="#ffeab0" />
            <path d="M43 117h16v6H44" fill="#737e89" />
          </>
        )}

        {kind === "film" && (
          <>
            <path d="m26 48 75-16 21 56-75 20Z" fill={cream} />
            <path d="m47 108 30 12 65-22-20-10Z" fill="#e9d4b4" />
            <ellipse cx="28" cy="78" rx="19" ry="31" transform="rotate(-18 28 78)" fill="#e1b683" />
            <ellipse cx="28" cy="78" rx="12" ry="24" transform="rotate(-18 28 78)" fill="#b58b5d" />
            <ellipse cx="28" cy="78" rx="7" ry="16" transform="rotate(-18 28 78)" fill="#f6dfbb" />
            <path d="m49 51 48-10m-44 16 46-10" stroke="#fff6e5" strokeWidth="3" strokeLinecap="round" />
            <g transform="rotate(18 110 83)">
              <path d="m96 94 29-63m-13 63L88 34" stroke="#9cabb9" strokeWidth="8" strokeLinecap="round" />
              <path d="m96 94 29-63" stroke="#d2dce5" strokeWidth="3" strokeLinecap="round" />
              <ellipse cx="92" cy="108" rx="13" ry="17" stroke="#4794df" strokeWidth="7" />
              <ellipse cx="122" cy="108" rx="13" ry="17" stroke="#4794df" strokeWidth="7" />
              <circle cx="106" cy="82" r="5" fill="#eef4f8" />
            </g>
          </>
        )}

        {kind === "report" && (
          <>
            <g transform="rotate(-7 65 70)">
              <rect x="28" y="22" width="73" height="99" rx="10" fill={blue} />
              <rect x="35" y="29" width="59" height="85" rx="6" fill={cream} />
              <rect x="46" y="15" width="36" height="19" rx="7" fill="#7f94a8" />
              <rect x="55" y="9" width="18" height="13" rx="6" fill="#9cafbf" />
              {[51, 73, 95].map((y) => (
                <g key={y}>
                  <path d={`m44 ${y} 5 5 9-11`} stroke="#67a685" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={`M65 ${y}h20`} stroke="#d0baa0" strokeWidth="4" strokeLinecap="round" />
                </g>
              ))}
            </g>
            <rect x="85" y="78" width="62" height="42" rx="9" fill="#426b8d" />
            <rect x="99" y="70" width="24" height="13" rx="4" fill="#5e84a3" />
            <circle cx="115" cy="99" r="16" fill="#c1d9ec" />
            <circle cx="115" cy="99" r="11" fill={blue} />
            <circle cx="112" cy="95" r="4" fill="#b9e0ff" />
            <circle cx="138" cy="87" r="3" fill="#f5ddb0" />
          </>
        )}

        {kind === "money" && (
          <>
            {[
              { x: 25, y: 92 },
              { x: 60, y: 116 },
              { x: 98, y: 76 },
            ].map(({ x, y }) => (
              <g key={x}>
                <rect x={x} y={y - 39} width="38" height="43" rx="8" fill={gold} />
                <ellipse cx={x + 19} cy={y - 39} rx="19" ry="8" fill="#ffe697" />
                {[y - 29, y - 17, y - 5].map((value) => (
                  <path
                    key={value}
                    d={`M${x + 3} ${value}q16 8 32 0`}
                    stroke="#cb9222" strokeWidth="2" opacity=".6"
                  />
                ))}
                <ellipse cx={x + 19} cy={y - 39} rx="12" ry="4" stroke="#edc65c" strokeWidth="2" />
              </g>
            ))}
          </>
        )}
      </g>
    </svg>
  );
}

export default function WorkerHomeDashboard({
  worker,
  sites = [],
  onOpen,
}) {
  const [today, setToday] = useState(() => koreanDay());

  const available = sites.filter(
    (site) => siteStatus(site) !== "cancelled",
  );

  const entries =
    workerMonth(available, today.slice(0, 7)).byDay.get(today) || [];

  useEffect(() => {
    const timer = setInterval(() => setToday(koreanDay()), 60000);
    return () => clearInterval(timer);
  }, []);

  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${today}T03:00:00Z`));

  return (
    <section className="worker-polished" aria-label="시공자 홈">
      <div className="wp-hello">
        <span>{worker?.worker_name || "시공자"}님, 반갑습니다</span>
        <span className="wp-date">{dateLabel}</span>
      </div>

      <div className="wp-hero">
        <div>
          <h2>
            오늘도
            <br />
            안전한 시공!
          </h2>
          <p>
            좋은 공간을 만드는
            <br />
            당신의 손을 응원합니다.
          </p>
          <span className="wp-hero-tag">
            나의 시공 파트너, 필름장이
          </span>
        </div>
        <div className="wp-hero-art">
          <Art size={185} />
        </div>
      </div>

      <div className="wp-section-title">
        <h3>오늘의 현장</h3>
        <Link href="/worker/menu/sites">전체 일정 ›</Link>
      </div>

      <div className="wp-today">
        {entries.length ? (
          entries.map(({ site, role }) => (
            <button
              type="button"
              className="wp-site"
              key={site.site_id}
              onClick={() => onOpen(site.site_id)}
            >
              <span className="wp-site-art">
                <Art size={69} />
              </span>
              <span className="wp-site-text">
                <small>
                  {site.address ||
                    site.site_address ||
                    "주소는 현장 상세에서 확인하세요"}
                </small>
                <strong>
                  {site.site_name || site.customer_name || "현장"}
                </strong>
                <span className="wp-role">
                  {role === "leader" ? "책임 팀장" : "팀원"}
                </span>
              </span>
              <span className="wp-site-arrow" aria-hidden="true">
                ›
              </span>
            </button>
          ))
        ) : (
          <div className="wp-empty">
            <strong>오늘은 배정된 현장이 없어요</strong>
            <p>내 현장에서 다음 시공 일정을 확인하세요.</p>
            <Link href="/worker/menu/sites">내 일정 확인 →</Link>
          </div>
        )}
      </div>

      <nav className="wp-grid" aria-label="시공자 주요 메뉴">
        {menus.map((menu) => (
          <Link
            key={menu.id}
            href={`/worker/menu/${menu.id}`}
            className="wp-menu"
          >
            <Art kind={menu.icon} size={112} />
            <strong>{menu.title}</strong>
            <small>{menu.subtitle}</small>
            <span className="wp-arrow" aria-hidden="true">›</span>
          </Link>
        ))}
      </nav>

      <Link href="/worker/attendance" className="wp-photo-link">
        출근 · 퇴근 기록 →
      </Link>

      <Link href="/worker/menu/photos" className="wp-photo-link">
        <span>시공 전·후 사진도 잊지 마세요</span>
        <strong>사진 등록 ›</strong>
      </Link>

      <nav className="wp-bottom" aria-label="시공자 하단 메뉴">
        <Link href="/worker" aria-current="page">
          <span aria-hidden="true">⌂</span>
          <small>홈</small>
        </Link>

        {menus.map((menu) => (
          <Link key={menu.id} href={`/worker/menu/${menu.id}`}>
            <span aria-hidden="true">
              {{
                sites: "▣",
                film: "✂",
                report: "☑",
                pay: "₩",
              }[menu.id]}
            </span>
            <small>{menu.title}</small>
          </Link>
        ))}
      </nav>

      <style jsx global>{`
        body:has(.worker-polished) { background: #fcf9f2; }
        main:has(.worker-polished) {
          background: #fcf9f2;
          padding-bottom: 100px;
        }
        .worker-polished {
          color: #173456;
          margin: 12px 0 25px;
        }
        .worker-polished a {
          text-decoration: none;
          color: inherit;
        }
        .worker-polished button {
          font-family: inherit;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .worker-polished button:focus-visible,
        .worker-polished a:focus-visible {
          outline: 3px solid #84bced;
          outline-offset: 3px;
        }
        .wp-hello {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 13px;
          color: #718094;
        }
        .wp-date {
          white-space: nowrap;
          color: #4386c5;
        }
        .wp-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
          min-height: 205px;
          padding: 15px 2px 20px;
        }
        .wp-hero h2 {
          margin: 0 0 10px;
          font-size: clamp(29px, 7.5vw, 42px);
          line-height: 1.3;
          letter-spacing: -1.4px;
          color: #153556;
        }
        .wp-hero p {
          margin: 0;
          color: #7b8693;
          font-size: 13px;
          line-height: 1.7;
        }
        .wp-hero-tag {
          display: inline-block;
          font-size: 10px;
          color: #5488b7;
          background: #edf5fb;
          padding: 6px 9px;
          border-radius: 20px;
          margin-top: 12px;
        }
        .wp-hero-art {
          width: 49%;
          flex-shrink: 0;
          text-align: center;
        }
        .wp-grid {
          margin-top: 20px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 13px;
        }
        .wp-menu {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          min-height: 197px;
          border: 1px solid #f0e9dd;
          background: linear-gradient(145deg, #fff 35%, #fffdf8);
          border-radius: 25px;
          padding: 16px 17px 20px;
          box-shadow: 0 8px 24px #b4a08010;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .wp-menu:active { transform: scale(0.98); }
        .wp-menu > svg { margin: -3px 0 0; }
        .wp-menu strong {
          color: #173456;
          font-size: 20px;
          letter-spacing: -0.7px;
          margin: 0 0 6px;
        }
        .wp-menu small {
          color: #7b8794;
          font-size: 12px;
          line-height: 1.6;
          max-width: calc(100% - 18px);
        }
        .wp-arrow {
          position: absolute;
          right: 13px;
          bottom: 32px;
          width: 27px;
          height: 27px;
          border-radius: 50%;
          background: #eef4fa;
          color: #466f99;
          display: grid;
          place-items: center;
          font-size: 22px;
        }
        .wp-section-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 27px 1px 13px;
        }
        .wp-section-title h3 {
          font-size: 20px;
          margin: 0;
          letter-spacing: -0.6px;
        }
        .wp-section-title a {
          color: #71849a;
          border: 0;
          background: transparent;
          font-size: 12px;
          padding: 10px 0 10px 12px;
        }
        .wp-today {
          display: grid;
          gap: 10px;
        }
        .wp-site {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          text-align: left;
          border: 1px solid #eee8de;
          border-radius: 22px;
          padding: 14px;
          background: #fff;
        }
        .wp-site-art {
          flex-shrink: 0;
          display: grid;
          place-items: center;
          width: 69px;
          height: 76px;
          background: #edf5fa;
          border-radius: 16px;
        }
        .wp-site-text {
          flex: 1;
          min-width: 0;
        }
        .wp-site-text small {
          display: block;
          color: #84909d;
          font-size: 11px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .wp-site-text strong {
          display: block;
          font-size: 17px;
          color: #183757;
          margin: 6px 0;
          overflow-wrap: anywhere;
        }
        .wp-role {
          display: inline-block;
          background: #e9f4ff;
          color: #478bcb;
          font-size: 11px;
          border-radius: 20px;
          padding: 5px 9px;
        }
        .wp-site-arrow {
          color: #6186a8;
          font-size: 25px;
        }
        .wp-empty {
          background: #fff;
          border: 1px solid #eee8de;
          border-radius: 22px;
          padding: 24px 18px;
          text-align: center;
        }
        .wp-empty strong { font-size: 15px; }
        .wp-empty p {
          color: #83909c;
          font-size: 12px;
          line-height: 1.6;
        }
        .wp-empty a {
          display: inline-block;
          border: 0;
          border-radius: 12px;
          background: #eaf4ff;
          color: #4687c5;
          font-weight: 700;
          padding: 11px 15px;
        }
        .wp-photo-link {
          box-sizing: border-box;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background: #eef6fc;
          border: 0;
          padding: 16px;
          border-radius: 17px;
          margin-top: 14px;
          text-align: left;
        }
        .wp-photo-link span {
          color: #7a8c9d;
          font-size: 11px;
        }
        .wp-photo-link strong {
          color: #4288c9;
          font-size: 12px;
          white-space: nowrap;
        }
        .wp-bottom {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          bottom: 0;
          width: min(100%, 900px);
          z-index: 40;
          background: #fffffff7;
          backdrop-filter: blur(14px);
          border-top: 1px solid #eee8df;
          box-shadow: 0 -4px 25px #8e7e6310;
          display: flex;
          padding: 8px 5px calc(9px + env(safe-area-inset-bottom));
        }
        .wp-bottom a {
          text-align: center;
          flex: 1;
          background: transparent;
          border: 0;
          border-radius: 12px;
          min-height: 47px;
          color: #8b96a3;
          padding: 4px 1px;
        }
        .wp-bottom a[aria-current="page"] {
          color: #398de0;
          background: #f0f7ff;
        }
        .wp-bottom span {
          display: block;
          font-size: 23px;
          line-height: 26px;
        }
        .wp-bottom small {
          display: block;
          font-size: 10px;
          margin-top: 4px;
        }
        @media (min-width: 600px) {
          .wp-hero { padding: 25px; }
          .wp-hero-art { width: 40%; }
          .wp-grid { gap: 18px; }
          .wp-menu {
            min-height: 195px;
            padding: 22px;
          }
          .wp-menu strong { font-size: 23px; }
          .wp-menu small { font-size: 13px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wp-menu { transition: none; }
        }
      `}</style>
    </section>
  );
          }
