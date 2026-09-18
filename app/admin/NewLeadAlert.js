import {
  primaryButtonStyle,
} from "./adminStyles";

export default function NewLeadAlert({
  newLeadAlert,
  setNewLeadAlert,
  changeTab,
}) {
  if (!newLeadAlert) {
    return null;
  }

  function openLead() {
    setNewLeadAlert(null);
    document.title = "기분좋은공간";
    changeTab("leads");
  }

  return (
    <div
      style={{
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 28px)",
        maxWidth: "600px",
        background: "#991b1b",
        color: "#ffffff",
        padding: "16px",
        borderRadius: "14px",
        zIndex: 9999,
        boxShadow:
          "0 8px 30px rgba(0,0,0,.25)",
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          fontSize: "17px",
        }}
      >
        🔔 신규 상담이 들어왔습니다.
      </div>

      <div
        style={{
          marginTop: "6px",
          fontSize: "14px",
        }}
      >
        {newLeadAlert.customer_name || "고객"} ·{" "}
        {newLeadAlert.phone || "-"}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "8px",
          marginTop: "12px",
        }}
      >
        <button
          type="button"
          onClick={openLead}
          style={{
            ...primaryButtonStyle,
            background: "#ffffff",
            color: "#991b1b",
          }}
        >
          상담 확인
        </button>

        <button
          type="button"
          onClick={() => setNewLeadAlert(null)}
          style={{
            border:
              "1px solid rgba(255,255,255,.5)",
            background: "transparent",
            color: "#ffffff",
            borderRadius: "10px",
            padding: "0 14px",
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
