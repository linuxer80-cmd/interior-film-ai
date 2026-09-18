const tabs = [
  {
    id: "jobs",
    label: "시공 DB",
  },
  {
    id: "register",
    label: "시공 등록",
  },
  {
    id: "usage",
    label: "로그 분석",
  },
  {
    id: "leads",
    label: "고객 상담",
  },
];

export default function AdminTabs({
  activeTab,
  changeTab,
  unreadCount,
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "6px",
        marginBottom: "18px",
      }}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => changeTab(tab.id)}
            style={{
              position:
                tab.id === "leads"
                  ? "relative"
                  : undefined,
              padding: "11px 4px",
              border: "1px solid #d1d5db",
              borderRadius: "9px",
              background: active
                ? "#111827"
                : "#ffffff",
              color: active
                ? "#ffffff"
                : "#111827",
              fontWeight: "bold",
              fontSize: "13px",
            }}
          >
            {tab.label}

            {tab.id === "leads" &&
              unreadCount > 0 && (
                <span
                  style={{
                    marginLeft: "4px",
                    color: active
                      ? "#fde68a"
                      : "#dc2626",
                  }}
                >
                  ({unreadCount})
                </span>
              )}
          </button>
        );
      })}
    </div>
  );
}
