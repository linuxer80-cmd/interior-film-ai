import ui from "./AdminUi.module.css";

const tabs = [
  { id: "leads", label: "고객 상담", path: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z" },
  { id: "sites", label: "현장 관리", path: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-7h6v7M9 9h.01M15 9h.01" },
  { id: "jobs", label: "시공 DB", path: "M4 3h16v18H4zM4 15l5-5 6 6 3-3 2 2M15 7h.01" },
  { id: "register", label: "시공 등록", path: "M12 5v14M5 12h14" },
];

export default function AdminTabs({ activeTab, changeTab, unreadCount, secondaryOnly = false }) {
  if (secondaryOnly) {
    return (
      <details className={ui.more} key={activeTab} open={["usage", "profit"].includes(activeTab)}>
        <summary>관리 메뉴 더보기</summary>
        <div className={ui.moreGrid}>
          <button type="button" onClick={() => changeTab("usage")} aria-current={activeTab === "usage" ? "page" : undefined}>로그 분석</button>
          <button type="button" onClick={() => changeTab("profit")} aria-current={activeTab === "profit" ? "page" : undefined}>매출·수익</button>
          <a href="/admin/billing">요금제·결제 관리</a>
          <a href="/admin/material-order">자재 주문</a>
        </div>
      </details>
    );
  }

  return (
    <nav className={ui.tabs} aria-label="관리자 주요 업무">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" onClick={() => changeTab(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={tab.path} /></svg>
          <span>{tab.label}{tab.id === "leads" && unreadCount > 0 && <span className={ui.count}>{unreadCount > 99 ? "99+" : unreadCount}</span>}</span>
        </button>
      ))}
    </nav>
  );
}
