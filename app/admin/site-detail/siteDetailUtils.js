/* =========================================================
   현장 상세 공통 유틸
========================================================= */

/* =========================================================
   날짜 표시
========================================================= */

export function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/* =========================================================
   datetime-local 값 변환
========================================================= */

export function toDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number) =>
    String(number).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

/* =========================================================
   금액 표시
========================================================= */

export function formatWon(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return "-";
  }

  return `${number.toLocaleString("ko-KR")}원`;
}

/* =========================================================
   수량 표시
========================================================= */

export function formatQuantity(value, unit) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const number = Number(value);

  const quantity = Number.isNaN(number)
    ? value
    : number.toLocaleString("ko-KR");

  return `${quantity}${unit ? ` ${unit}` : ""}`;
}

/* =========================================================
   팀장 찾기
========================================================= */

export function getLeader(site) {
  const assignments = site?.site_workers || [];

  return assignments.find(
    (item) => item.role === "leader",
  );
}

/* =========================================================
   일반 시공자 찾기
========================================================= */

export function getMembers(site) {
  const assignments = site?.site_workers || [];

  return assignments.filter(
    (item) => item.role === "member",
  );
}
