"use client";

import { useState } from "react";

function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function todayDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default function WorkDatePicker({
  value = [],
  onChange,
  disabled = false,
}) {
  const dates = [
    ...new Set(
      (Array.isArray(value) ? value : []).filter(validDate)
    ),
  ].sort();

  const [month, setMonth] = useState(
    () => (dates[0] || todayDate()).slice(0, 7)
  );

  const [year, number] = month.split("-").map(Number);

  const leading = new Date(
    Date.UTC(year, number - 1, 1)
  ).getUTCDay();

  const count = new Date(
    Date.UTC(year, number, 0)
  ).getUTCDate();

  const selected = new Set(dates);

  function moveMonth(amount) {
    const date = new Date(
      Date.UTC(year, number - 1 + amount, 1)
    );

    setMonth(
      `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")}`
    );
  }

  function toggle(date) {
    if (disabled) return;

    const next = selected.has(date)
      ? dates.filter((item) => item !== date)
      : [...dates, date].sort();

    onChange?.(next);
  }

  const buttonStyle = {
    minHeight: 44,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 16,
    cursor: disabled ? "default" : "pointer",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        display: "block",
        width: "100%",
        margin: "14px 0",
        padding: 12,
        boxSizing: "border-box",
        border: "1px solid #bfdbfe",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          disabled={disabled}
          aria-label="이전 달"
          onClick={() => moveMonth(-1)}
          style={{ ...buttonStyle, width: 44 }}
        >
          ‹
        </button>

        <strong style={{ color: "#111827", fontSize: 18 }}>
          {year}년 {number}월
        </strong>

        <button
          type="button"
          disabled={disabled}
          aria-label="다음 달"
          onClick={() => moveMonth(1)}
          style={{ ...buttonStyle, width: 44 }}
        >
          ›
        </button>
      </div>

      <p
        style={{
          margin: "0 0 12px",
          color: "#64748b",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        시공하는 날짜를 눌러 선택하세요.
        다시 누르면 선택이 해제됩니다.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 4,
        }}
      >
        {["일", "월", "화", "수", "목", "금", "토"].map(
          (label, index) => (
            <div
              key={label}
              style={{
                padding: "8px 0",
                textAlign: "center",
                fontSize: 13,
                fontWeight: 700,
                color:
                  index === 0
                    ? "#dc2626"
                    : index === 6
                      ? "#2563eb"
                      : "#64748b",
              }}
            >
              {label}
            </div>
          )
        )}

        {Array.from({ length: leading }, (_, index) => (
          <div key={`blank-${index}`} />
        ))}

        {Array.from({ length: count }, (_, index) => {
          const day = index + 1;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const checked = selected.has(date);

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              aria-label={date}
              aria-pressed={checked}
              onClick={() => toggle(date)}
              style={{
                ...buttonStyle,
                width: "100%",
                minWidth: 0,
                padding: "10px 0",
                borderColor: checked ? "#2563eb" : "#e2e8f0",
                background: checked ? "#2563eb" : "#fff",
                color: checked ? "#fff" : "#111827",
                fontWeight: checked ? 800 : 500,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 9,
          background: "#eff6ff",
          color: "#1e40af",
        }}
      >
        <strong>
          {dates.length
            ? `선택한 시공일 ${dates.length}일`
            : "선택한 날짜 없음"}
        </strong>

        {dates.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
            }}
          >
            {dates.map((date) => (
              <button
                key={date}
                type="button"
                disabled={disabled}
                onClick={() => toggle(date)}
                aria-label={`${date} 선택 해제`}
                style={{
                  ...buttonStyle,
                  minHeight: 36,
                  padding: "6px 9px",
                  fontSize: 12,
                  color: "#1d4ed8",
                }}
              >
                {date} ×
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
