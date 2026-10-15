"use client";

export const filmFireLabel = type => type === "fire" ? "방염" : type === "non_fire" ? "비방염" : "구분 미지정";

export default function FilmFireBadge({ type }) {
  const palette = type === "fire"
    ? { background: "#fff1f2", color: "#9f1239", borderColor: "#fda4af" }
    : type === "non_fire"
      ? { background: "#eff6ff", color: "#1e40af", borderColor: "#93c5fd" }
      : { background: "#fefce8", color: "#854d0e", borderColor: "#fde047" };
  return <span style={{ display: "inline-block", margin: "4px 6px", padding: "3px 9px", border: "1px solid", borderRadius: 8, fontSize: 14, fontWeight: 800, lineHeight: 1.5, whiteSpace: "nowrap", ...palette }}>
    {filmFireLabel(type)}
  </span>;
}
