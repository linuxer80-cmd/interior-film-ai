"use client";
import dynamic from "next/dynamic";
const AutoCalendarConnection = dynamic(() => import("../account/calendar/AutoCalendarConnection"), { ssr: false });
import usePersonalMenus from "../../lib/usePersonalMenus";
import PlanUsageButton from "./PlanUsageButton";
import moreStyles from "./AdminMore.module.css";
import useAdminOverlayBack from "../../lib/useAdminOverlayBack";

import { useEffect, useId, useState } from "react";
import { supabase } from "../../lib/supabase";
import LaborNotifications from "../components/LaborNotifications";
import AchievementBadges from "../components/AchievementBadges";
import AdminClosingTasks from "./AdminClosingTasks";
import AdminHomeSummary from "./AdminHomeSummary";
const SiteExtraWork = dynamic(() => import("../components/SiteExtraWork"), { ssr: false });
import ToolIllustration from "../components/ui/ToolIllustration";

const menus = [
  {
    href: "/admin/customer-page",
    label: "고객페이지 관리",
    description: "공개 시공 사례와 업체 정보",
    icon: "website",
  },
  { href: "/business-card?from=admin", label: "디지털 명함", description: "로고·정보 입력 · 디자인 선택 · 이미지 저장", icon: "businessCard" },
  { href: "/admin/customer-chat", label: "고객 채팅", description: "고객 문의 확인 · 답장하기", icon: "customerChat" },
  { href: "/samples?from=admin", label: "필름 샘플 보기", description: "브랜드·색상별 필름 샘플 확인", icon: "customer" },
  {
    href: "/jobs",
    label: "구인 · 구직",
    description: "공개 구직자 찾기 · 현장 구인 등록",
    icon: "recruitment",
  },
  {
    id: "sites",
    label: "현장 관리",
    description: "현장 일정과 시공자 배정",
    icon: "home",
  },
  {
    href: "/admin/clients",
    label: "거래처 관리",
    description: "거래처·담당자와 현장별 정산 관리",
    icon: "report",
  },
  {
    href: "/admin/workers",
    label: "시공자 관리",
    description: "시공자 등록·출퇴근·일당 관리",
    icon: "people",
  },
  {
    id: "leads",
    label: "고객 상담",
    description: "견적 요청과 상담 확인",
    icon: "chat",
  },
  {
    id: "register",
    label: "시공 등록",
    description: "시공 사진과 실적 기록",
    icon: "camera",
  },
  {
    id: "profit",
    label: "매출 · 수익",
    description: "매출·비용·미수금 확인",
    icon: "money",
  },
  {
    href: "/admin/inventory",
    label: "필름 재고",
    description: "롤별 입고·반출·반입·자재상 반납",
    icon: "stock",
  },
  {
    href: "/admin/material-order",
    label: "자재 주문하기 · 테스트 중",
    disabled: true,
    description: "주문 기능을 점검하고 있습니다",
    icon: "box",
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
  companyId,
  companyName,
  changeTab,
  unreadCount = 0,
  secondaryOnly = false,
}) {
  const { orderedMenus, record } = usePersonalMenus(menus, `admin:${companyId || "none"}`, activeTab === "today" && !secondaryOnly);
  const calendarConnectionId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const [orderPreview, setOrderPreview] = useState(false);
  const closeMore = useAdminOverlayBack(moreOpen, () => setMoreOpen(false), () => true, 900);
  useEffect(() => {
    let cancelled = false;
    setOrderPreview(false);
    if (!companyId || secondaryOnly) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data?.session?.access_token;
      if (!token) return false;
      const response = await fetch("/api/admin/material-order-access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      return response.ok && result.allowed === true && result.companyId === companyId;
    }).then(value => { if (!cancelled) setOrderPreview(!!value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [companyId, secondaryOnly]);
  if (secondaryOnly) return null;

  const isHome = activeTab === "today";
  const section = sections[activeTab];

  function go(tab) {
    if (tab !== activeTab) record({id: tab});
    setMoreOpen(false);
    changeTab(tab);
  }

  return (
    <section className="film-admin-dashboard">
      {isHome ? (
        <>
          <a href="/worker" data-ui-link="action" style={{display:"inline-flex",alignItems:"center",minHeight:44,padding:"12px 18px",marginBottom:14,borderRadius:14,background:"#285340",color:"#fffefa",fontWeight:700,textDecoration:"none"}}>시공자 홈으로 →</a>
          <AdminHomeSummary key={companyId} companyId={companyId} />
          <AdminClosingTasks key={`closing-${companyId}`} companyId={companyId} />
          <AutoCalendarConnection embedded compact connectedTargetId={calendarConnectionId} />
          <SiteExtraWork key={companyId} summary />
          <LaborNotifications />
          <AchievementBadges key={companyId} scope="owner" compact />

          <h3 className="film-admin-menu-heading">
            무엇을 도와드릴까요?
          </h3>

          <nav
            className="film-admin-menu-grid"
            aria-label="관리자 업무 메뉴"
          >
            {orderedMenus.map(menu => {
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

              return menu.disabled && !orderPreview ? (
                <button key={menu.href} type="button" disabled style={{ opacity: 0.55, cursor: "not-allowed" }}>{content}</button>
              ) : menu.href ? (
                <a key={menu.href} href={menu.href} onClick={event => record(menu, event)}>
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
          <div id={calendarConnectionId} />
        </>
      ) : (
        <div className="film-admin-section-bar">
          <button type="button" onClick={() => go("today")}>
            ‹ 관리자 홈
          </button>

          <span>
            <ToolIllustration kind={section?.[1]} size={48} />
            {section?.[0]}
          </span>
        </div>
      )}

      {activeTab === "profit" && (
        <nav
          aria-label="매출·수익 세부 메뉴"
          style={{ margin: "0 0 20px" }}
        >
          <a href="/admin/client-sales" style={{
            display: "block",
            padding: 16,
            marginBottom: 12,
            border: "1px solid #dfd4c4",
            borderRadius: 18,
            background: "#fffdfa",
            color: "#243648",
            fontWeight: 800,
          }} data-ui-link="action">
            업체별 매출 · 입금 · 미수금 →
          </a>

          <a href="/admin/receivables" style={{
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
          }}>
            <ToolIllustration kind="money" size={58} />

            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 17 }}>
                미수금 · 잔금 관리
              </strong>
              <small style={{
                display: "block",
                marginTop: 5,
                color: "#716c63",
                lineHeight: 1.6,
              }}>
                계약금·중도금·잔금 입금 내역과
                남은 미수금 확인
              </small>
            </span>

            <span aria-hidden="true" style={{ fontSize: 24 }}>›</span>
          </a>
        </nav>
      )}

      {moreOpen && (
        <nav className={`film-admin-more ${moreStyles.panel}`} aria-label="추가 관리 메뉴">
          <div className={moreStyles.title}>
            <strong>더보기</strong>
            <button type="button" className={moreStyles.close} onClick={closeMore}>
              닫기
            </button>
          </div>


          <button type="button" className={moreStyles.item} onClick={() => go("jobs")}>시공 DB</button>
          <button type="button" className={moreStyles.item} onClick={() => go("usage")}>로그 분석</button>

          <a href="/account/calendar" className={moreStyles.item}>구글 캘린더 연결 · 현장 일정 보내기</a>
          <a href="/account/google" className={moreStyles.item}>구글 계정 연결 · 연결 상태 확인</a>
          <a href="/account/kakao" className={moreStyles.item}>카카오 계정 연결 · 연결 상태 확인</a>
          <a href="/achievements?scope=owner" className={moreStyles.item}>우리 업체 업적 · 배지 보관함</a>
          <div style={{ padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><strong>현재 요금제 · 사용량</strong><PlanUsageButton /></div>
          <a href="/admin/billing" className={moreStyles.item}>요금제 · 결제</a>
          <a href="/support?from=admin" className={moreStyles.item}>고객지원</a>
        </nav>
      )}

      <nav className="film-admin-bottom" aria-label="관리자 하단 메뉴">
        {[
          { id: "today", label: "홈", icon: "home" },
          { id: "sites", label: "현장", icon: "camera" },
          { id: "leads", label: "상담", icon: "chat" },
          { id: "profit", label: "매출·수익", icon: "money" },
        ].map(item => (
          <button
            key={item.id}
            type="button"
            aria-current={activeTab === item.id ? "page" : undefined}
            onClick={() => go(item.id)}
          >
            <ToolIllustration kind={item.icon} size={36} className="film-nav-image" />
            <small>{item.label}</small>
          </button>
        ))}

        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => moreOpen ? closeMore() : setMoreOpen(true)}
        >
          <span className="film-nav-more" aria-hidden="true">▦</span>
          <small>더보기</small>
        </button>
      </nav>
    </section>
  );
                }



