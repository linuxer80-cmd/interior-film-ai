"use client";

import { useState } from "react";

export default function AttendanceCorrection({
  record,
  busy,
  onSave,
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  if (
    record.review_status === "approved" ||
    record.expense_id
  ) {
    return null;
  }

  const localTime = (date) =>
    new Date(new Date(date).getTime() + 9 * 3600000)
      .toISOString()
      .slice(0, 16);

  const button = {
    padding: 10,
    minHeight: 44,
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    background: "#eff6ff",
    margin: "6px 0",
  };

  return (
    <div>
      <button
        type="button"
        style={button}
        disabled={busy}
        onClick={() => {
          setOpen(!open);
          setValue(
            record.clock_out
              ? localTime(record.clock_out)
              : ""
          );
          setNote("");
        }}
      >
        퇴근 누락·시간 정정
      </button>

      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault();

            onSave({
              action: "correct",
              id: record.id,
              clockOut: `${value}:00+09:00`,
              note,
              expectedClockOut: record.clock_out,
              expectedCorrectedAt: record.corrected_at,
            });
          }}
        >
          <p>
            실제 퇴근시간을 입력하세요. 한국 시간 기준이며
            출근 후 24시간 이내만 가능합니다. 정정 후에는
            다시 승인해야 합니다.
          </p>

          <label>
            실제 퇴근시간
            <input
              style={{
                display: "block",
                padding: 10,
                maxWidth: "100%",
              }}
              type="datetime-local"
              required
              value={value}
              disabled={busy}
              min={localTime(record.clock_in)}
              max={localTime(new Date())}
              onChange={(event) =>
                setValue(event.target.value)
              }
            />
          </label>

          <label>
            정정 사유
            <input
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: 10,
              }}
              required
              minLength={3}
              maxLength={500}
              value={note}
              disabled={busy}
              onChange={(event) =>
                setNote(event.target.value)
              }
            />
          </label>

          <p>
            정정한 시각에 GPS를 측정한 것은 아니므로 퇴근
            위치는 미확인으로 표시합니다. 원래 기록과 사유는
            이력으로 보관합니다.
          </p>

          <button style={button} disabled={busy}>
            퇴근시간 정정 저장
          </button>
        </form>
      )}
    </div>
  );
}
