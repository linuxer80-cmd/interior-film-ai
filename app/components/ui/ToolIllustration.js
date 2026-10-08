const positions = {
  people: "0% 0%", attendance: "50% 0%",
  home: "100% 0%", house: "100% 0%",
  chat: "0% 50%", report: "50% 50%", estimate: "50% 50%",
  money: "100% 50%", box: "0% 100%",
  film: "50% 100%", camera: "100% 100%",
};

// Decorative photographs: adjacent menu text supplies the accessible name.
export default function ToolIllustration({ kind = "home", size = 64, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`film-tool film-photo ${className}`}
      style={{
        width: size, aspectRatio: "1 / 1", maxWidth: "100%",
        display: "block", flexShrink: 0,
        backgroundImage: 'url("/images/menu/film-photo-atlas.png")',
        backgroundSize: "300% 300%",
        backgroundPosition: positions[kind] || positions.home,
        backgroundRepeat: "no-repeat", backgroundColor: "#f6f1e8",
        borderRadius: 14,
      }}
    />
  );
}
