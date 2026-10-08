"use client";

import EstimateTotal from "./EstimateTotal";

export default function FilmAdjustedEstimate({
  selectedFilm = null,
  fireType = "non_fire",
  baseEstimate = null,
  adjustedEstimate = null,
}) {
  if (
    !selectedFilm ||
    !baseEstimate ||
    !adjustedEstimate
  ) {
    return null;
  }

  const selectedPrice = Number(
    fireType === "fire"
      ? selectedFilm.fire_price_per_meter
      : selectedFilm.non_fire_price_per_meter
  );

  const available =
    Number.isFinite(selectedPrice) &&
    selectedPrice > 0;

  return (
    <EstimateTotal
      totalEstimate={
        available
          ? adjustedEstimate
          : baseEstimate
      }
      selectedFilm={selectedFilm}
      fireType={fireType}
      baseEstimate={baseEstimate}
      filmPriceAvailable={available}
    />
  );
}
