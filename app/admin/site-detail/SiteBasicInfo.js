"use client";

import {
  formatWon,
  getLeader,
  getMembers,
} from "./siteDetailUtils";

/* =========================================================
   현장 기본정보
========================================================= */

export default function SiteBasicInfo({
  site,
}) {
  if (!site) {
    return null;
  }

  const leader = getLeader(site);
  const members = getMembers(site);

  const memberNames = members
    .map(
      (item) =>
        item?.workers?.name,
    )
    .filter(Boolean)
    .join(", ");

  const fullAddress = [
    site.address,
    site.address_detail,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      {/* =========================
          고객
      ========================= */}

      <DetailRow
        label="고객"
        value={
          site.customer_name || "-"
        }
      />

      {/* =========================
          전화번호
      ========================= */}

      <DetailRow
        label="전화번호"
        value={
          site.customer_phone || "-"
        }
      />

      {/* =========================
          주소
      ========================= */}

      <DetailRow
        label="주소"
        value={
          fullAddress || "-"
        }
      />

      {/* =========================
          지역
      ========================= */}

      <DetailRow
        label="지역"
        value={
          site.region || "-"
        }
      />

      {/* =========================
          시공 종류
      ========================= */}

      <DetailRow
        label="시공 종류"
        value={
          site.work_type || "-"
        }
      />

      {/* =========================
          작업 내용
      ========================= */}

      <DetailRow
        label="작업 내용"
        value={
          site.work_description ||
          "-"
        }
      />

      {/* =========================
          계약금액
      ========================= */}

      <DetailRow
        label="계약금액"
        value={formatWon(
          site.contract_amount,
        )}
      />

      {/* =========================
          선금
      ========================= */}

      <DetailRow
        label="선금"
        value={formatWon(
          site.deposit_amount,
        )}
      />

      {/* =========================
          팀장
      ========================= */}

      <DetailRow
        label="팀장"
        value={
          leader?.workers?.name ||
          "미배정"
        }
      />

      {/* =========================
          담당자
      ========================= */}

      <DetailRow
        label="담당자"
        value={
          memberNames ||
          "미배정"
        }
      />

      {/* =========================
          메모
      ========================= */}

      <DetailRow
        label="메모"
        value={
          site.memo || "-"
        }
      />
    </div>
  );
}

/* =========================================================
   상세정보 한 줄
========================================================= */

function DetailRow({
  label,
  value,
}) {
  return (
    <div
      style={{
        display: "grid",

        gridTemplateColumns:
          "90px 1fr",

        gap: "10px",

        padding: "10px 0",

        borderBottom:
          "1px solid #f1f5f9",

        fontSize: "13px",
      }}
    >
      <div
        style={{
          color: "#64748b",

          fontWeight: "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#111827",

          fontWeight: "600",

          whiteSpace: "pre-wrap",

          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}
