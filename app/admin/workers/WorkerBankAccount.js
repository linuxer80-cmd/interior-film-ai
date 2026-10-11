"use client";

import { useState } from "react";

export default function WorkerBankAccount({ person }) {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState(false);

  if (!person.account_number) {
    return (
      <small style={{ color: "#64748b" }}>
        계좌 미등록
      </small>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(person.account_number);
      setFallback(false);
      setMessage("계좌번호를 복사했습니다.");
    } catch {
      setFallback(true);
      setMessage("아래 계좌번호를 길게 눌러 복사해주세요.");
    }
  }

  return (
    <span style={{ fontSize: 13, overflowWrap: "anywhere" }}>
      {person.bank_name} {person.account_number}
      {" "}· {person.account_holder}

      <button
        type="button"
        onClick={copy}
        style={{
          marginLeft: 8,
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid #cbd5e1",
          background: "#eff6ff",
        }}
        aria-label={`${person.name} 계좌번호 복사`}
      >
        계좌 복사
      </button>

      {message && (
        <span
          role="status"
          style={{ display: "block", marginTop: 5 }}
        >
          {message}
        </span>
      )}

      {fallback && (
        <input
          aria-label="복사할 계좌번호"
          readOnly
          value={person.account_number}
          onFocus={event => event.target.select()}
          style={{ maxWidth: "100%" }}
        />
      )}
    </span>
  );
}
