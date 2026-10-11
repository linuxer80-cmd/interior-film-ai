"use client";

import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const money = (value) =>
  Number(value || 0).toLocaleString("ko-KR", {
    maximumFractionDigits: 4,
  });

export default function MaterialPurchaseCost({
  material,
  onSaved,
  disabled,
}) {
  const [data, setData] = useState(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [metres, setMetres] = useState(false);
  const lock = useRef(false);

  async function run(action) {
    if (lock.current) return;

    lock.current = true;
    setBusy(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw Error("관리자로 로그인해주세요.");
      }

      const response = await fetch(
        "/api/admin/material-purchase-cost",
        {
          method: "POST",
          signal: AbortSignal.timeout(25000),
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            materialId: material.id,
            action,
            optionId: choice,
            version: data?.version,
            confirmMetres: metres,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw Error(result.error || "단가 처리 실패");
      }

      if (action === "apply") {
        setData(null);
        await onSaved?.();
      } else {
        setData(result);
        setChoice(
          result.options.length === 1
            ? result.options[0].id
            : ""
        );
        setMetres(false);
      }
    } catch (err) {
      setError(err.message);

      if (action === "apply") {
        setData(null);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const selected = data?.options.find(
    (option) => option.id === choice
  );

  const needsUnit =
    data &&
    !["m", "미터"].includes(
      String(data.unit || "").trim().toLowerCase()
    );

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => run("get")}
      >
        입고단가 조회·적용
      </button>

      {data && (
        <div
          style={{
            padding: 12,
            background: "#eff6ff",
            borderRadius: 10,
            marginTop: 8,
          }}
        >
          {!data.options.length ? (
            <p>
              연결된 롤 또는 대리점 공급가가 없습니다.
              브랜드·제품코드와 대리점 단가 등록을 확인해주세요.
            </p>
          ) : (
            <>
              <select
                style={{ width: "100%", padding: 10 }}
                disabled={busy}
                value={choice}
                onChange={(event) =>
                  setChoice(event.target.value)
                }
              >
                <option value="">대리점·방염 구분 선택</option>
                {data.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} · {money(option.unitPrice)}원/m
                  </option>
                ))}
              </select>

              {selected && (
                <p>
                  사용 {data.quantity}m · 적용 자재비{" "}
                  <b>{money(selected.total)}원</b>
                  <br />
                  {choice === "roll"
                    ? "롤별 사용량 × 입고단가 합계입니다."
                    : "롤 이력이 없어 현재 등록된 공급가를 사용합니다. 과거 입고단가와 같은지 확인해주세요."}
                </p>
              )}

              {needsUnit && (
                <label>
                  <input
                    type="checkbox"
                    checked={metres}
                    onChange={(event) =>
                      setMetres(event.target.checked)
                    }
                  />{" "}
                  현재 사용량 {data.quantity}의 단위가 m임을
                  확인합니다. 저장 시 단위를 m로 수정합니다.
                </label>
              )}

              <button
                type="button"
                disabled={
                  busy ||
                  !selected ||
                  (needsUnit && !metres)
                }
                onClick={() => {
                  if (
                    window.confirm(
                      "확인한 단가와 자재비를 이 현장에 적용할까요?"
                    )
                  ) {
                    run("apply");
                  }
                }}
              >
                확인한 단가 적용
              </button>
            </>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => setData(null)}
          >
            닫기
          </button>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
    </div>
  );
        }
