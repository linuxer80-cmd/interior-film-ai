"use client";

export default function TrafficSafeImage({
  src,
  alt = "",
  style,
  onClick,
  eager = false,
}) {
  if (!src) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "low"}
      onClick={onClick}
      style={{
        display: "block",
        maxWidth: "100%",
        ...style,
      }}
    />
  );
}
