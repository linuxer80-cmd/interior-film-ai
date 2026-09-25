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
          site.customer_name ||
          "미정"
        }
      />

      {/* =========================
          전화번호
      ========================= */}

      <DetailRow
        label="전화번호"
        value={
          site.customer_phone ||
          "미정"
        }
      />

      {/* =========================
          주소
      ========================= */}

      <DetailRow
        label="주소"
        value={
          fullAddress ||
          "미정"
        }
      />

      {/* =========================
          지역
      ========================= */}

      <DetailRow
        label="지역"
        value={
          site.region ||
          "미정"
        }
      />

      {/* =========================
          시공 종류
      ========================= */}

      <DetailRow
        label="시공 종류"
        value={
          site.work_type ||
          "미정"
        }
      />

      {/* =========================
          작업 내용
      ========================= */}

      <DetailRow
        label="작업 내용"
        value={
          site.work_description ||
          "미정"
        }
      />

      {/* =========================
          계약금액
      ========================= */}

      <DetailRow
        label="계약금액"
        value={
          hasAmount(
            site.contract_amount,
          )
            ? formatWon(
                site.contract_amount,
              )
            : "미정"
        }
      />

      {/* =========================
          선금
      ========================= */}

      <DetailRow
        label="선금"
        value={
          hasAmount(
            site.deposit_amount,
          )
            ? formatWon(
                site.deposit_amount,
              )
            : "미정"
        }
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
          site.memo ||
          "미정"
        }
      />
    </div>
  );
}

/* =========================================================
   금액 입력 여부

   0원은 실제 입력값일 수 있으므로
   미정으로 처리하지 않습니다.
========================================================= */

function hasAmount(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== ""
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
        {value || "미정"}
      </div>
    </div>
  );
}
