"use client";

import Link from "next/link";
import TradeClients from "../../components/TradeClients";

export default function ClientsPage() {
  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "20px 16px 40px",
      }}
    >
      <Link href="/admin">← 관리자 홈</Link>

      <h1
        style={{
          margin: "24px 0 8px",
          fontSize: 28,
        }}
      >
        업체 관리
      </h1>

      <p
        style={{
          margin: "0 0 20px",
          color: "#64748b",
          lineHeight: 1.7,
        }}
      >
        거래처와 담당자를 등록하고, 업체별 현장·계약금액·미수금을
        확인하세요. 담당자가 없는 업체도 등록할 수 있습니다.
      </p>

      <TradeClients />
    </main>
  );
}
