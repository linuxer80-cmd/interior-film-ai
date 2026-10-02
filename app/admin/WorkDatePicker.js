"use client";

import { useState } from "react";

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;

  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function normalizeDates(values) {
  return [...new Set((values || []).filter(validDate))].sort();
}

function today() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default function WorkDatePicker({
  value = [],
  onChange,
  disabled = false,
}) {
  const dates = normalizeDates(value);

  const [month, setMonth] = useState(() =>
    (dates[0] || today()).slice(0, 7)
  );

  const [year, monthNumber] = month.split("-").map(Number);

  const firstWeekday = new Date(
    Date.UTC(year, monthNumber - 1, 1)
  ).getUTCDay();

  const daysInMonth = new Date(
    Date.UTC(year, monthNumber, 0)
  ).getUTCDate();

  const selected = new Set(dates);
  const todayDate = today();

  function moveMonth(amount) {
    const next = new Date(
      Date.UTC(year, monthNumber - 1 + amount, 1)
    );

    setMonth(
      `${next.getUTCFullYear()}-${String(
        next.getUTCMonth() + 1
      ).padStart(2, "0")}`
    );
  }

  function toggleDate(date) {
    if (disabled) return;

    if (selected.has(date)) {
      onChange?.(dates.filter((item) => item !== date));
      return;
    }

    onChange?.(normalizeDates([...dates, date]));
  }

  const buttonStyle = {
    minHeight: 42,
    border: "1px solid #d1d5db",
    borderRadius: 10,
    background: "#fff",
    color: "#111827",
    fontSize: 16,
    cursor: disabled ? "default" : "pointer",
  };

  return (
    <div>
      <p
        style={{
          margin: "0 0 14px",
          color: "#6b7280",
          lineHeight: 1.6,
        }}
      >
        실제 시공하는 날짜를 눌러주세요.
        떨어진 날짜도 여러 개 선택할 수 있습니다.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          aria-label="이전 달"
          disabled={disabled}
          onClick={() => moveMonth(-1)}
          style={{ ...buttonStyle, width: 44 }}
        >
          ‹
        </button>

        <strong style={{ fontSize: 18 }}>
          {year}년 {monthNumber}월
        </strong>

        <button
          type="button"
          aria-label="다음 달"
          disabled={disabled}
          onClick={() => moveMonth(1)}
          style={{ ...buttonStyle, width: 44 }}
        >
          ›
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 5,
        }}
      >
        {["일", "월", "화", "수", "목", "금", "토"].map(
          (label, index) => (
            <div
              key={label}
              style={{
                padding: "6px 0",
                textAlign: "center",
                fontSize: 13,
                fontWeight: 700,
                color:
                  index === 0
                    ? "#dc2626"
                    : index === 6
                      ? "#2563eb"
                      : "#6b7280",
              }}
            >
              {label}
            </div>
          )
        )}

        {Array.from({ length: firstWeekday }, (_, index) => (
          <div key={`empty-${index}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const isSelected = selected.has(date);
          const isToday = date === todayDate;

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              aria-label={date}
              aria-pressed={isSelected}
              onClick={() => toggleDate(date)}
              style={{
                ...buttonStyle,
                minWidth: 0,
                padding: "10px 0",
                borderColor: isSelected
                  ? "#2563eb"
                  : isToday
                    ? "#93c5fd"
                    : "#e5e7eb",
                background: isSelected ? "#2563eb" : "#fff",
                color: isSelected ? "#fff" : "#111827",
                fontWeight: isSelected || isToday ? 800 : 500,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 12,
          background: "#f3f4f6",
        }}
      >
        <strong>
          {dates.length ? `선택한 시공일 ${dates.length}일` : "시공일 미정"}
        </strong>

        {dates.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            {dates.map((date) => (
              <button
                key={date}
                type="button"
                disabled={disabled}
                onClick={() => toggleDate(date)}
                aria-label={`${date} 선택 해제`}
                style={{
                  ...buttonStyle,
                  minHeight: 36,
                  padding: "7px 10px",
                  borderColor: "#bfdbfe",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontSize: 13,
                }}
              >
                {date.slice(0, 4)}년 {dateLabel(date)} ×
              </button>
            ))}
          </div>
        ) : (
          <p
            style={{
              margin: "8px 0 0",
              color: "#6b7280",
              fontSize: 14,
            }}
          >
            일정이 정해지지 않았다면 선택하지 않아도 됩니다.
          </p>
        )}
      </div>
    </div>
  );
            }
