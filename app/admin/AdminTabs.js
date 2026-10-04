"use client";

import { useId, useState } from "react";

const menus = [
  {
    id: "sites",
    label: "현장 관리",
    description: "현장 일정과 시공자 배정",
    icon: "house",
  },
  {
    id: "leads",
    label: "고객 상담",
    description: "견적 요청과 상담 확인",
    icon: "people",
  },
  {
    id: "today",
    label: "보고서 · 오늘 할 일",
    description: "검수 대기와 오늘 업무",
    icon: "report",
  },
  {
    id: "profit",
    label: "매출 · 수익",
    description: "인건비와 자재비 확인",
    icon: "money",
  },
  {
    href: "/admin/material-order",
    label: "자재 주문",
    description: "현장에 필요한 필름 주문",
    icon: "box",
  },
  {
    id: "register",
    label: "시공 등록",
    description: "시공 사진과 실적 기록",
    icon: "film",
  },
];

function Picture({ kind = "report", size = 80 }) {
  const id = useId().replace(/:/g, "");
  const blue = `url(#${id}blue)`;
  const cream = `url(#${id}cream)`;
  const gold = `url(#${id}gold)`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient
          id={`${id}blue`}
          x1="25"
          y1="15"
          x2="95"
          y2="110"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9bd2ff" />
          <stop offset=".5" stopColor="#509beb" />
          <stop offset="1" stopColor="#286aca" />
        </linearGradient>

        <linearGradient
          id={`${id}cream`}
          x1="20"
          y1="20"
          x2="95"
          y2="110"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff9eb" />
          <stop offset="1" stopColor="#dbc19a" />
        </linearGradient>

        <linearGradient
          id={`${id}gold`}
          x1="30"
          y1="30"
          x2="90"
          y2="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ffeaa0" />
          <stop offset="1" stopColor="#efaa28" />
        </linearGradient>
      </defs>

      <ellipse
        cx="60"
        cy="106"
        rx="42"
        ry="7"
        fill="#233c61"
        opacity=".09"
      />

      {kind === "house" && (
        <>
          <rect
            x="26"
            y="48"
            width="69"
            height="55"
            rx="7"
            fill={cream}
          />
          <path
            d="M16 53 59 14l46 39-9 11-37-32-34 32Z"
            fill={blue}
          />
          <path
            d="m25 49 34-29 36 29"
            stroke="#bddfff"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect
            x="47"
            y="70"
            width="22"
            height="33"
            rx="4"
            fill="#bc8b5d"
          />
          <circle cx="63" cy="88" r="2" fill="#f6dfb0" />
          <rect
            x="31"
            y="60"
            width="13"
            height="15"
            rx="3"
            fill="#b7dff5"
          />
          <rect
            x="74"
            y="60"
            width="13"
            height="15"
            rx="3"
            fill="#b7dff5"
          />
          <ellipse
            cx="95"
            cy="88"
            rx="10"
            ry="19"
            fill="#82b96a"
          />
          <ellipse
            cx="106"
            cy="94"
            rx="8"
            ry="13"
            fill="#a8cf87"
          />
        </>
      )}

      {kind === "report" && (
        <>
          <g transform="rotate(8 60 60)">
            <rect
              x="26"
              y="20"
              width="68"
              height="85"
              rx="10"
              fill={blue}
            />
            <rect
              x="32"
              y="27"
              width="56"
              height="72"
              rx="6"
              fill={cream}
            />
            <rect
              x="43"
              y="13"
              width="33"
              height="18"
              rx="7"
              fill="#a88869"
            />
            <rect
              x="51"
              y="10"
              width="17"
              height="12"
              rx="6"
              fill="#bd9f7f"
            />
            <circle cx="59" cy="16" r="3" fill="#f9eed9" />

            {[48, 66, 84].map((y) => (
              <g key={y}>
                <rect
                  x="40"
                  y={y - 7}
                  width="12"
                  height="12"
                  rx="3"
                  fill="#78ba87"
                />
                <path
                  d={`m43 ${y - 1} 3 3 4-6`}
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d={`M59 ${y - 1}h20`}
                  stroke="#c9b391"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </g>

          <path
            d="m87 93 19-55 7 3-19 55-8 7Z"
            fill={gold}
          />
          <path d="m86 103 2-10 6 3Z" fill="#68626a" />
        </>
      )}

      {kind === "money" && (
        <>
          {[
            { x: 20, y: 78 },
            { x: 48, y: 90 },
            { x: 74, y: 62 },
          ].map(({ x, y }) => (
            <g key={x}>
              <rect
                x={x}
                y={y - 28}
                width="29"
                height="35"
                rx="7"
                fill={gold}
              />
              <ellipse
                cx={x + 14.5}
                cy={y - 28}
                rx="14.5"
                ry="6"
                fill="#ffe299"
              />
              {[y - 18, y - 8, y + 2].map((v) => (
                <path
                  key={v}
                  d={`M${x + 3} ${v}q12 6 23 0`}
                  stroke="#d99418"
                  strokeWidth="2"
                  opacity=".55"
                />
              ))}
            </g>
          ))}

          <path
            d="m24 37 24-15 18 8 22-19"
            stroke="#76b9ef"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {kind === "people" && (
        <>
          <circle cx="83" cy="47" r="15" fill="#f1c69f" />
          <path
            d="M62 102V78a21 21 0 0 1 42 0v24"
            fill="#a5d0f3"
          />
          <circle cx="46" cy="41" r="20" fill="#f3cdaa" />
          <path
            d="M24 103V79a25 25 0 0 1 50 0v24"
            fill={blue}
          />
          <path d="M23 36a23 23 0 0 1 46 0Z" fill={gold} />
          <rect
            x="18"
            y="33"
            width="57"
            height="8"
            rx="4"
            fill="#f1b735"
          />
          <rect
            x="42"
            y="14"
            width="9"
            height="22"
            rx="4"
            fill="#ffe39a"
          />
        </>
      )}

      {kind === "box" && (
        <>
          <path
            d="m22 42 40-20 38 19-40 22Z"
            fill="#e9c5a0"
          />
          <path
            d="M22 42v49l38 20V63Z"
            fill="#bf936b"
          />
          <path
            d="M60 63v48l40-21V41Z"
            fill="#d7ac83"
          />
          <path
            d="m40 33 39 20v17l-12 6V59L29 40Z"
            fill="#f6dfbe"
          />
          <path
            d="M30 60v21"
            stroke="#d4b18d"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}

      {kind === "film" && (
        <>
          <path d="M21 42h66v45H21Z" fill={cream} />
          <ellipse
            cx="21"
            cy="64"
            rx="14"
            ry="23"
            fill="#e7bf90"
          />
          <ellipse
            cx="21"
            cy="64"
            rx="8"
            ry="16"
            fill="#bc8954"
          />
          <ellipse
            cx="21"
            cy="64"
            rx="4"
            ry="9"
            fill="#f2d5b0"
          />
          <path
            d="M36 48h43M37 54h42"
            stroke="#fff6e3"
            strokeWidth="3"
            strokeLinecap="round"
          />

          <g transform="rotate(-20 85 80)">
            <ellipse
              cx="77"
              cy="93"
              rx="10"
              ry="12"
              stroke="#5098df"
              strokeWidth="6"
            />
            <ellipse
              cx="103"
              cy="93"
              rx="10"
              ry="12"
              stroke="#5098df"
              strokeWidth="6"
            />
            <path
              d="m82 85 18-44M97 85 80 42"
              stroke="#a9b6c3"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <circle
              cx="90"
              cy="73"
              r="4"
              fill="#dbe5ed"
            />
          </g>
        </>
      )}
    </svg>
  );
}

export default function AdminTabs({
  activeTab,
  changeTab,
  unreadCount = 0,
  secondaryOnly = false,
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  if (secondaryOnly) return null;

  const isHome = activeTab === "today";

  function go(tab) {
    setMoreOpen(false);
    changeTab(tab);
  }

  return (
    <section className="film-admin-dashboard">
      {isHome && (
        <>
          <div className="film-admin-hero">
            <div>
              <span className="film-admin-kicker">
                오늘도 좋은 공간을 만듭니다
              </span>

              <h2>
                안녕하세요!
                <br />
                필름장이 관리자입니다.
              </h2>

              <p>
                현장부터 완료보고까지
                <br />
                오늘의 업무를 편하게 확인하세요.
              </p>
            </div>

            <Picture kind="report" size={132} />
          </div>

          <div className="film-admin-shortcuts">
            <button
              type="button"
              onClick={() => go("sites")}
            >
              <span>현장 일정</span>
              <strong>현장 확인 →</strong>
              <small>시공일과 팀원 배정</small>
            </button>

            <button
              type="button"
              onClick={() => go("leads")}
            >
              <span>새로운 상담</span>
              <strong>{unreadCount}건</strong>
              <small>확인하지 않은 상담</small>
            </button>

            <button
              type="button"
              onClick={() => go("profit")}
            >
              <span>매출 · 수익</span>
              <strong>수익 확인 →</strong>
              <small>실제 비용과 수익 분석</small>
            </button>

            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("film-admin-today")
                  ?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
              }
            >
              <span>오늘 할 일</span>
              <strong>업무 확인 ↓</strong>
              <small>배정 확인과 보고서 검수</small>
            </button>
          </div>

          <h3 className="film-admin-menu-heading">
            무엇을 도와드릴까요?
          </h3>

          <nav
            className="film-admin-menu-grid"
            aria-label="관리자 업무 메뉴"
          >
            {menus.map((menu) => {
              const content = (
                <>
                  <Picture kind={menu.icon} size={68} />

                  <span>
                    <strong>{menu.label}</strong>
                    <small>{menu.description}</small>
                  </span>

                  <b aria-hidden="true">›</b>
                </>
              );

              return menu.href ? (
                <a key={menu.href} href={menu.href}>
                  {content}
                </a>
              ) : (
                <button
                  key={menu.id}
                  type="button"
                  onClick={() => go(menu.id)}
                >
                  {content}
                </button>
              );
            })}
          </nav>

          <div
            id="film-admin-today"
            className="film-admin-section-anchor"
          />
        </>
      )}

      {!isHome && (
        <div className="film-admin-section-bar">
          <button
            type="button"
            onClick={() => go("today")}
          >
            ‹ 관리자 홈
          </button>

          <span>
            {
              {
                sites: "현장 관리",
                leads: "고객 상담",
                jobs: "시공 DB",
                register: "시공 등록",
                profit: "매출 · 수익",
                usage: "로그 분석",
              }[activeTab]
            }
          </span>
        </div>
      )}

      {moreOpen && (
        <nav
          className="film-admin-more"
          aria-label="추가 관리 메뉴"
        >
          <div className="film-admin-more-title">
            <strong>관리 메뉴</strong>

            <button
              type="button"
              onClick={() => setMoreOpen(false)}
            >
              닫기
            </button>
          </div>

          <button
            type="button"
            onClick={() => go("jobs")}
          >
            시공 DB
          </button>

          <button
            type="button"
            onClick={() => go("register")}
          >
            시공 등록
          </button>

          <button
            type="button"
            onClick={() => go("usage")}
          >
            로그 분석
          </button>

          <a href="/admin/material-order">자재 주문</a>
          <a href="/admin/billing">요금제 · 결제</a>
        </nav>
      )}

      <nav
        className="film-admin-bottom"
        aria-label="관리자 하단 메뉴"
      >
        {[
          { id: "today", label: "홈", icon: "⌂" },
          { id: "sites", label: "현장", icon: "▣" },
          { id: "leads", label: "상담", icon: "♧" },
          { id: "profit", label: "매출·수익", icon: "▥" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={
              activeTab === item.id ? "page" : undefined
            }
            onClick={() => go(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <small>{item.label}</small>
          </button>
        ))}

        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <span aria-hidden="true">···</span>
          <small>더보기</small>
        </button>
      </nav>

      <style jsx global>{`
       
