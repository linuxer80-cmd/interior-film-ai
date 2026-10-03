"use client";

import { useEffect, useMemo, useState } from "react";
import CuttingDiagram, { getCutPages } from "./CuttingDiagram";
import FilmThumbnail, { filmLabel } from "./FilmThumbnail";
import { formatMeterFromMm } from "./cuttingOptimizer";

const button = {
  minHeight: 44,
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  padding: "8px 12px",
  background: "white",
  color: "#111827",
  fontWeight: 800,
};

export default function CuttingResult({
  result,
  onClose,
  progress = {},
  onProgress,
  materials = [],
  preferredColor = "",
}) {
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(130);
  const [listOpen, setListOpen] = useState(false);

  const steps = useMemo(
    () =>
      (result?.usedRolls || []).flatMap((roll, rollIndex) =>
        getCutPages(roll).map((page, pageIndex) => ({
          roll,
          rollIndex,
          page,
          pageIndex,
          key: `${roll.id || rollIndex}:${pageIndex}`,
        }))
      ),
    [result]
  );

  useEffect(() => {
    if (!result) return;

    const selectedFirst = steps.findIndex(
      step =>
        step.roll.color === preferredColor &&
        !progress[step.key]
    );

    const first =
      selectedFirst >= 0
        ? selectedFirst
        : steps.findIndex(step => !progress[step.key]);

    setIndex(first < 0 ? 0 : first);

    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    try {
      const n = Number(
        localStorage.getItem("cutting-diagram-text-scale")
      );
      if (n >= 60 && n <= 220) setScale(n);
    } catch {}

    return () => {
      document.body.style.overflow = old;
    };
  }, [result]);

  if (!result) return null;

  const safeIndex = Math.min(
    index,
    Math.max(0, steps.length - 1)
  );

  const current = steps[safeIndex];
  const done = steps.filter(step => progress[step.key]).length;

  function toggle(key) {
    onProgress({
      ...progress,
      [key]: !progress[key],
    });
  }

  function completeThrough() {
    if (
      !window.confirm(
        `현재까지 ${safeIndex + 1}개 구간을 모두 실제 재단하셨나요?`
      )
    ) return;

    const next = { ...progress };

    steps.slice(0, safeIndex + 1).forEach(step => {
      next[step.key] = true;
    });

    onProgress(next);
  }

  function changeScale(value) {
    const n = Math.max(60, Math.min(220, value));
    setScale(n);

    try {
      localStorage.setItem(
        "cutting-diagram-text-scale",
        String(n)
      );
    } catch {}
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="재단 도면 및 진행 상황"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        background: "#f8fafc",
      }}
    >
      <header
        style={{
          padding: 10,
          background: "white",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <FilmThumbnail
            material={materials.find(
              material =>
                filmLabel(material) === current?.roll.color
            )}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <strong
              style={{
                fontSize: 18,
                overflowWrap: "anywhere",
              }}
            >
              {current?.roll.color || "재단 결과"}
            </strong>
            <small
              style={{
                display: "block",
                marginTop: 4,
              }}
            >
              재단 완료 {done}/{steps.length}구간 · 현재{" "}
              {safeIndex + 1}/{steps.length}
            </small>
          </div>

          <button type="button" style={button} onClick={onClose}>
            닫기
          </button>
        </div>

        {current && (
          <div style={{ fontSize: 12, marginTop: 8 }}>
            롤 {current.rollIndex + 1} · 계획 사용{" "}
            {formatMeterFromMm(current.roll.usedLength)} · 계획 잔여{" "}
            {formatMeterFromMm(current.roll.remainingLength)}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
          }}
        >
          <button
            type="button"
            style={button}
            onClick={() => changeScale(scale - 10)}
          >
            −
          </button>
          <span>글씨 {scale}%</span>
          <button
            type="button"
            style={button}
            onClick={() => changeScale(scale + 10)}
          >
            ＋
          </button>
          <button
            type="button"
            style={{ ...button, marginLeft: "auto" }}
            onClick={() => setListOpen(!listOpen)}
          >
            완료 목록
          </button>
        </div>

        {listOpen && (
          <div
            style={{
              maxHeight: 160,
              overflowY: "auto",
              marginTop: 8,
            }}
          >
            {steps.map((step, i) => (
              <div
                key={step.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 5,
                }}
              >
                <input
                  type="checkbox"
                  aria-label={
                    `${step.roll.color} 롤 ${step.rollIndex + 1} ` +
                    `구간 ${step.pageIndex + 1} 재단 완료`
                  }
                  checked={Boolean(progress[step.key])}
                  onChange={() => toggle(step.key)}
                />

                <button
                  type="button"
                  style={{
                    ...button,
                    flex: 1,
                    textAlign: "left",
                  }}
                  onClick={() => {
                    setIndex(i);
                    setListOpen(false);
                  }}
                >
                  {step.roll.color} · 롤 {step.rollIndex + 1} ·{" "}
                  {step.pageIndex + 1}구간{" "}
                  {progress[step.key] ? "✓ 완료" : "미완료"}
                </button>
              </div>
            ))}
          </div>
        )}
      </header>

      <main
        style={{
          flex: 1,
          minHeight: 0,
          padding: 8,
          overflow: "hidden",
        }}
      >
        {current ? (
          <CuttingDiagram
            roll={current.roll}
            pageIndex={current.pageIndex}
            textScale={scale / 100}
          />
        ) : (
          <p>재단 가능한 도면이 없습니다.</p>
        )}
      </main>

      <footer
        style={{
          background: "white",
          padding:
            "10px 10px calc(10px + env(safe-area-inset-bottom))",
          borderTop: "1px solid #e2e8f0",
        }}
      >
        {done === steps.length && steps.length > 0 && (
          <p
            style={{
              margin: "0 0 8px",
              color: "#15803d",
              fontWeight: 800,
            }}
          >
            ✓ 도면의 모든 구간을 재단 완료했습니다.
          </p>
        )}

        {result.shortages?.length > 0 && (
          <p
            style={{
              color: "#b45309",
              margin: "0 0 8px",
            }}
          >
            롤 부족으로 도면에 배치되지 않은 재단물이 있습니다.
          </p>
        )}

        {current && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <label style={{ flex: 1, fontWeight: 800 }}>
              <input
                type="checkbox"
                checked={Boolean(progress[current.key])}
                onChange={() => toggle(current.key)}
              />{" "}
              이 구간 재단 완료
            </label>

            <button
              type="button"
              style={button}
              onClick={completeThrough}
            >
              여기까지 재단
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={button}
            disabled={safeIndex === 0}
            onClick={() => setIndex(safeIndex - 1)}
          >
            ← 이전
          </button>

          <button
            type="button"
            style={{
              ...button,
              flex: 1,
              background: "#111827",
              color: "white",
            }}
            onClick={() =>
              safeIndex < steps.length - 1
                ? setIndex(safeIndex + 1)
                : onClose()
            }
          >
            {safeIndex < steps.length - 1
              ? steps[safeIndex + 1].roll.color !== current?.roll.color
                ? `다음 ${steps[safeIndex + 1].roll.color} →`
                : "다음 구간 →"
              : "저장하고 닫기"}
          </button>
        </div>

        <small
          style={{
            display: "block",
            color: "#64748b",
            marginTop: 6,
          }}
        >
          페이지 이동은 완료 체크를 바꾸지 않습니다.
          현재 기기에 자동 저장됩니다.
        </small>
      </footer>
    </div>
  );
}
