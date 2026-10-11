const positions = {
  people: "0% 0%",
  attendance: "50% 0%",
  home: "100% 0%",
  house: "100% 0%",
  chat: "0% 50%",
  report: "50% 50%",
  estimate: "50% 50%",
  money: "100% 50%",
  box: "0% 100%",
  film: "50% 100%",
  camera: "100% 100%",
};

// 메뉴의 텍스트가 접근성 이름을 제공합니다.
export default function ToolIllustration({
  kind = "home",
  size = 64,
  className = "",
}) {
  const isStock = kind === "box";

  return (
    <span
      aria-hidden="true"
      className={`film-tool film-photo ${className}`}
      style={{
        width: size,
        aspectRatio: "1 / 1",
        maxWidth: "100%",
        display: "block",
        flexShrink: 0,
        backgroundImage: isStock
          ? 'url("/images/menu/film-stock.png")'
          : 'url("/images/menu/film-photo-atlas.png")',
        backgroundSize: isStock ? "cover" : "300% 300%",
        backgroundPosition: isStock
          ? "center"
          : positions[kind] || positions.home,
        backgroundRepeat: "no-repeat",
        backgroundColor: "#f6f1e8",
        borderRadius: 14,
      }}
    />
  );
}
