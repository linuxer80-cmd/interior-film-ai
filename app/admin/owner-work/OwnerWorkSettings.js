"use client";
import { useEffect, useState } from "react";
import styles from "./OwnerWork.module.css";
export default function OwnerWorkSettings({ work }) {
  const { data, error, loading, busy, act, refresh } = work;
  const [mode, setMode] = useState("manage"),
    [include, setInclude] = useState(false),
    [wage, setWage] = useState("0"),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (data) {
      setMode(data.settings.mode);
      setInclude(data.settings.include_labor);
      setWage(String(data.settings.daily_wage));
    }
  }, [data]);
  return (
    <section className={styles.panel}>
      <h2>우리 업체의 일하는 방식</h2>
      <p className={styles.muted}>
        대표도 직접 시공한다면 관리자 화면에서 내
        현장·출퇴근·자재·재단·완료보고를 이용하세요.
      </p>
      {loading && !data ? (
        <p>설정을 불러오고 있습니다…</p>
      ) : (
        data && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setMessage("");
              if (
                await act({
                  action: "settings",
                  mode,
                  include_labor: include,
                  daily_wage: Number(wage),
                })
              )
                setMessage("운영 방식을 저장했습니다.");
            }}
          >
            <fieldset
              disabled={busy}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <legend>운영 방식</legend>
              {[
                [
                  "solo",
                  "대표 혼자 시공",
                  "예정·진행 현장을 내 시공에 자동 표시",
                ],
                [
                  "mixed",
                  "대표와 직원 함께 시공",
                  "현장별로 대표 직접 참여 선택",
                ],
                ["manage", "대표는 관리만", "기존 현장 관리·직원 배정 중심"],
              ].map(([key, title, desc]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={mode === key}
                  className={`${styles.action} ${styles.choice}`}
                  onClick={() => setMode(key)}
                >
                  {title}
                  <small>{desc}</small>
                </button>
              ))}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={include}
                  onChange={(e) => setInclude(e.target.checked)}
                />
                수익 계산에 대표 인건비 반영
              </label>
              {include && (
                <label>
                  대표 일당 (원)
                  <input
                    type="number"
                    min="0"
                    max="10000000"
                    step="1"
                    required
                    value={wage}
                    onChange={(e) => setWage(e.target.value)}
                    className={styles.field}
                  />
                </label>
              )}
              <p className={styles.muted}>
                출근 시점의 설정 금액을 하루 한 번 기록합니다. 기존 기록은
                유지하며 직원 인건비 지급 목록에는 추가하지 않습니다.
              </p>
              <button
                className={`${styles.action} ${styles.primary} ${styles.full}`}
                disabled={busy}
              >
                {busy ? "저장 중…" : "운영 방식 저장"}
              </button>
            </fieldset>
          </form>
        )
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}{" "}
          <button type="button" className={styles.action} onClick={refresh}>
            다시 확인
          </button>
        </p>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
