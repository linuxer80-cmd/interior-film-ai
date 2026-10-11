import AiQuotaPanel from "./AiQuotaPanel";

export default function BillingLayout({
  children,
}) {
  return (
    <>
      {children}

      <div
        style={{
          padding: "0 16px 90px",
        }}
      >
        <AiQuotaPanel />
      </div>
    </>
  );
}
