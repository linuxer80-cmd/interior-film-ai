import ToolIllustration from "../components/ui/ToolIllustration";
import ui from "./AdminUi.module.css";

const tabs = [
  {
    id: "today",
    label: "오늘 할 일",
    kind: "report",
  },
  {
    id: "leads",
    label: "고객 상담",
    kind: "people",
  },
  {
    id: "sites",
    label: "현장 관리",
    kind: "home",
  },
  {
    id: "jobs",
    label: "시공 DB",
    kind: "camera",
  },
  {
    id: "register",
    label: "시공 등록",
    kind: "film",
  },
];

export default function AdminTabs({
  activeTab,
  changeTab,
  unreadCount = 0,
  secondaryOnly = false,
}) {
  if (secondaryOnly) {
    return (
      <details
        className={ui.more}
        key={activeTab}
        open={["usage", "profit"].includes(activeTab)}
      >
        <summary>관리 메뉴 더보기</summary>

        <div className={ui.moreGrid}>
          <button
            type="button"
            onClick={() => changeTab("usage")}
            aria-current={
              activeTab === "usage"
                ? "page"
                : undefined
            }
          >
            로그 분석
          </button>

          <button
            type="button"
            onClick={() => changeTab("profit")}
            aria-current={
              activeTab === "profit"
                ? "page"
                : undefined
            }
          >
            매출·수익
          </button>

          <a href="/admin/billing">
            요금제·결제 관리
          </a>

          <a href="/admin/material-order">
            자재 주문
          </a>
        </div>
      </details>
    );
  }

  return (
    <nav
      className={ui.tabs}
      aria-label="관리자 주요 업무"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => changeTab(tab.id)}
          aria-current={
            activeTab === tab.id
              ? "page"
              : undefined
          }
        >
          <ToolIllustration
            kind={tab.kind}
            size={42}
          />

          <span>
            {tab.label}

            {tab.id === "leads" &&
              unreadCount > 0 && (
                <span className={ui.count}>
                  {unreadCount > 99
                    ? "99+"
                    : unreadCount}
                </span>
              )}
          </span>
        </button>
      ))}
    </nav>
  );
}
