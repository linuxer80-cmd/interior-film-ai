import {
  secondaryButtonStyle,
} from "./adminStyles";

export default function Pagination({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  marginTop = "0",
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: "8px",
        marginTop,
      }}
    >
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={onPrevious}
        style={secondaryButtonStyle}
      >
        이전
      </button>

      <div
        style={{
          textAlign: "center",
          fontSize: "14px",
        }}
      >
        {currentPage} / {totalPages}
      </div>

      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={onNext}
        style={secondaryButtonStyle}
      >
        다음
      </button>
    </div>
  );
}
