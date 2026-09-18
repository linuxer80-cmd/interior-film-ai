export default function PhotoPreviewModal({
  previewPhoto,
  setPreviewPhoto,
}) {
  if (!previewPhoto) {
    return null;
  }

  return (
    <div
      onClick={() => setPreviewPhoto(null)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.88)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <button
        type="button"
        onClick={() => setPreviewPhoto(null)}
        style={{
          position: "absolute",
          top: "18px",
          right: "18px",
          border: "none",
          borderRadius: "999px",
          width: "44px",
          height: "44px",
          background: "#ffffff",
          fontSize: "22px",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        ×
      </button>

      <img
        src={previewPhoto}
        alt=""
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: "100%",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: "10px",
        }}
      />
    </div>
  );
}
