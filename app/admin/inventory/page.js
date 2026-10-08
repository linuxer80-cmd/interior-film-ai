"use client";

import Link from "next/link";
import FilmRollInventory from "../../components/FilmRollInventory";

export default function InventoryPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 18 }}>
      <Link href="/admin">← 관리자 홈</Link>
      <FilmRollInventory />
    </main>
  );
}
