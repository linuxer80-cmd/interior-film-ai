"use client";

import { useState } from "react";
import ToolIllustration from "../components/ui/ToolIllustration";

const menus = [
  {
    href: "/admin/workers",
    label: "시공자 관리",
    description: "시공자 등록·초대와 일당 관리",
    icon: "people",
  },
  {
    href: "/admin/attendance",
    label: "출퇴근 관리",
    description: "현장 위치와 연장근무 확인",
    icon: "attendance",
  },
  {
    id: "sites",
    label: "현장 관리",
    description: "현장 일정과 시공자 배정",
    icon: "home",
  },
  {
    id: "leads",
    label: "고객 상담",
    description: "견적 요청과 상담 확인",
    icon: "chat",
  },
  {
    href: "/admin/today",
    label: "보고서 · 오늘 할 일",
    description: "검수 대기와 오늘 업무",
    icon: "report",
  },
  {
    id: "profit",
    label: "매출 · 수익",
    description: "매출·비용·미수금 확인",
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
    icon: "camera",
  },
];

const sections = {
  sites: ["현장 관리", "home"],
  leads: ["고객 상담", "chat"],
  jobs: ["시공 DB", "camera"],
  register: ["시공 등록", "camera"],
  profit: ["매출 · 수익", "money"],
  usage: ["로그 분석", "report"],
};

export default function AdminTabs({
  activeTab,
  changeTab,
  unreadCount = 0,
  secondaryOnly = false,
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  if (secondaryOnly) return null;

  const isHome = activeTab === "today";
  const section = sections[activeTab];

  function go(tab) {
    setMoreOpen(false);
    changeTab(tab);
  }

  return (
    <section className="film-admin-dashboard">
      {isHome ? (
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

            <ToolIllustration kind="home" size={176} />
          </div>

          <h3 className="film-admin-menu-heading">
            무엇을 도와드릴까요?
          </h3>

          <nav
            className="film-admin-menu-grid"
            aria-label="관리자 업무 메뉴"
          >
            {menus.map(menu => {
              const content = (
                <>
                  <ToolIllustration
                    kind={menu.icon}
                    size="100%"
                    className="photo-menu-art"
                  />

                  <span>
                    <strong>{menu.label}</strong>

                    <small>
                      {menu.id === "leads" && unreadCount > 0
                        ? `새 상담 ${unreadCount}건 · 확인해주세요`
                        : menu.description}
                    </small>
                  </span>
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
      ) : (
        <div className="film-admin-section-bar">
          <button type="button" onClick={() => go("today")}>
            ‹ 관리자 홈
          </button>

          <span>
            <ToolIllustration
              kind={section?.[1]}
              size={48}
            />
            {section?.[0]}
          </span>
        </div>
      )}

      {activeTab === "profit" && (
        <nav
          aria-label="매출·수익 세부 메뉴"
          style={{ margin: "0 0 20px" }}
        >
          <a
            href="/admin/receivables"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: 16,
              border: "1px solid #dfd4c4",
              borderRadius: 18,
              background: "#fffdfa",
              color: "#243648",
              textDecoration: "none",
              boxShadow: "0 6px 20px #4b392409",
            }}
          >
            <ToolIllustration kind="money" size={58} />

            <span style={{ flex: 1, minWidth: 0 }}>
              <strong
                style={{
                  display: "block",
                  fontSize: 17,
                }}
              >
                미수금 · 잔금 관리
              </strong>

              <small
                style={{
                  display: "block",
                  marginTop: 5,
                  color: "#716c63",
                  lineHeight: 1.6,
                }}
              >
                계약금·중도금·잔금 입금 내역과 남은 미수금 확인
              </small>
            </span>

            <span
              aria-hidden="true"
              style={{ fontSize: 24 }}
            >
              ›
            </span>
          </a>
        </nav>
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

          <button type="button" onClick={() => go("jobs")}>
            시공 DB
          </button>

          <button type="button" onClick={() => go("register")}>
            시공 등록
          </button>

          <button type="button" onClick={() => go("usage")}>
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
        ].map(item => (
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
          onClick={() => setMoreOpen(value => !value)}
        >
          <span aria-hidden="true">···</span>
          <small>더보기</small>
        </button>
      </nav>
    </section>
  );
}
