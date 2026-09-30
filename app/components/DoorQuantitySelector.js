"use client";

import { clampDoorQuantity } from "../utils/doorEstimate";

const won = (value) => Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 });

export default function DoorQuantitySelector({ summary, quantity, onChange }) {
  const disabled = !summary.canScale;
  const change = (value) => onChange?.(clampDoorQuantity(value, quantity));
  return <section aria-label="문과 문틀 총수량" style={{ marginBottom: 18, padding: 18, border: "1px solid #cbdcfb", borderRadius: 16, background: "#f6f9ff" }}>
    <strong style={{ display: "block", fontSize: 18, color: "#172c50" }}>
      {disabled ? "문·문틀 수량과 견적 확인" : `사진 속 문·문틀 ${summary.detectedCount}세트`}
    </strong>
    <p style={{ margin: "8px 0 16px", color: "#52627a", fontSize: 13, lineHeight: 1.6 }}>
      같은 문의 다른 각도 사진은 한 세트입니다. 아래에는 시공할 문·문틀의 <b>총수량</b>을 입력해주세요.
    </p>
    {!disabled && <div style={{ padding: 12, background: "white", borderRadius: 10, lineHeight: 1.8, fontSize: 14 }}>
      사진 속 {summary.detectedCount}세트 합계 {won(summary.photographedTotal.average)}원<br />
      <strong>세트당 평균 {won(summary.unitEstimate.average)}원</strong>
    </div>}
    <label htmlFor="door-total-quantity" style={{ display: "block", marginTop: 16, marginBottom: 8, fontWeight: 700 }}>시공할 문·문틀 총수량</label>
    <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 48px", gap: 10, alignItems: "center" }}>
      <button type="button" aria-label="방문·문틀 수량 줄이기" disabled={disabled || quantity <= 1} onClick={() => change(quantity - 1)} style={{ height: 48, border: "1px solid #ccd5e1", borderRadius: 10, fontSize: 24 }}>−</button>
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
        <input id="door-total-quantity" type="number" min="1" max="50" inputMode="numeric" disabled={disabled}
          value={quantity || ""} onChange={(event) => change(event.target.value)}
          style={{ width: 72, height: 48, textAlign: "center", border: "1px solid #ccd5e1", borderRadius: 10, fontSize: 22, fontWeight: 800 }} />세트
      </div>
      <button type="button" aria-label="방문·문틀 수량 늘리기" disabled={disabled || quantity >= 50} onClick={() => change(quantity + 1)} style={{ height: 48, border: "1px solid #ccd5e1", borderRadius: 10, fontSize: 24 }}>+</button>
    </div>
    <div aria-live="polite" style={{ marginTop: 14, color: disabled ? "#92400e" : "#174ea6", fontSize: 14, lineHeight: 1.6 }}>
      {disabled ? "수량이나 금액을 확인하지 못한 문이 있어 전체 수량 변경을 잠시 막았습니다. 사진 묶음과 시공 부위를 먼저 확인해주세요."
        : <><span>{won(summary.unitEstimate.average)}원 × {quantity}세트</span><br /><strong style={{ fontSize: 20 }}>문·문틀 합계 {won(summary.total.average)}원</strong></>}
    </div>
  </section>;
}
