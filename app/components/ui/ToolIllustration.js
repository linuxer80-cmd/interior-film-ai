"use client";

import { useState } from "react";

const positions = {
  people: "0% 0%",
  recruitment: "0% 0%",
  attendance: "50% 0%",
  home: "100% 0%",
  house: "100% 0%",
  chat: "0% 50%",
  report: "50% 50%",
  estimate: "50% 50%",
  money: "100% 50%",
  box: "0% 100%",
  stock: "0% 100%",
  customer: "100% 100%",
  film: "50% 100%",
  camera: "100% 100%",
};

const images = {
  website: "/images/menu/website-photo.png",
  recruitment: "/images/menu/recruitment.webp",
  stock: "/images/menu/film-stock.png",
  customer: "/images/menu/customer-page.png",
};

export default function ToolIllustration({
  kind = "home",
  size = 64,
  className = "",
}) {
  const [failedImage, setFailedImage] = useState("");
  const image = images[kind];
  const showImage = image && failedImage !== image;

  return (
    <span
      aria-hidden="true"
      className={`film-tool film-photo ${className}`}
      style={{
        position: "relative",
        width: size,
        aspectRatio: "1 / 1",
        maxWidth: "100%",
        display: "block",
        flexShrink: 0,
        overflow: "hidden",
        backgroundImage: 'url("/images/menu/film-photo-atlas.png")',
        backgroundSize: "300% 300%",
        backgroundPosition: positions[kind] || positions.home,
        backgroundRepeat: "no-repeat",
        backgroundColor: "#f6f1e8",
        borderRadius: 14,
      }}
    >
      {showImage && (
        <img
          key={image}
          src={image}
          alt=""
          onError={() => setFailedImage(image)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
    </span>
  );
}
