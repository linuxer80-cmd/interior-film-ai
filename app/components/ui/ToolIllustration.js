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
  customerChat: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22600%22%20viewBox%3D%220%200%20600%20600%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22bg%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23f8f1e7%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e6d7c2%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22phone%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%2338465b%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23172131%22%2F%3E%3C%2FlinearGradient%3E%3Cfilter%20id%3D%22shadow%22%3E%3CfeDropShadow%20dx%3D%225%22%20dy%3D%2218%22%20stdDeviation%3D%2216%22%20flood-color%3D%22%23554632%22%20flood-opacity%3D%22.22%22%2F%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%3Crect%20width%3D%22600%22%20height%3D%22600%22%20fill%3D%22url(%23bg)%22%2F%3E%3Cellipse%20cx%3D%22310%22%20cy%3D%22507%22%20rx%3D%22173%22%20ry%3D%2228%22%20fill%3D%22%23c4b59e%22%20opacity%3D%22.3%22%2F%3E%3Cg%20filter%3D%22url(%23shadow)%22%20transform%3D%22rotate(-8%20300%20295)%22%3E%3Crect%20x%3D%22187%22%20y%3D%2287%22%20width%3D%22224%22%20height%3D%22422%22%20rx%3D%2238%22%20fill%3D%22url(%23phone)%22%2F%3E%3Crect%20x%3D%22201%22%20y%3D%22102%22%20width%3D%22196%22%20height%3D%22389%22%20rx%3D%2226%22%20fill%3D%22%23faf7ef%22%2F%3E%3Crect%20x%3D%22263%22%20y%3D%22111%22%20width%3D%2274%22%20height%3D%2213%22%20rx%3D%227%22%20fill%3D%22%23263548%22%2F%3E%3Crect%20x%3D%22222%22%20y%3D%22160%22%20width%3D%22152%22%20height%3D%2240%22%20rx%3D%2212%22%20fill%3D%22%23e8e1d5%22%2F%3E%3Crect%20x%3D%22231%22%20y%3D%22175%22%20width%3D%2284%22%20height%3D%229%22%20rx%3D%224%22%20fill%3D%22%23b7ac99%22%2F%3E%3Cpath%20d%3D%22M224%20232h126a15%2015%200%200%201%2015%2015v53a15%2015%200%200%201-15%2015h-94l-24%2020v-20h-8a15%2015%200%200%201-15-15v-53a15%2015%200%200%201%2015-15%22%20fill%3D%22%23294d40%22%2F%3E%3Ccircle%20cx%3D%22249%22%20cy%3D%22274%22%20r%3D%227%22%20fill%3D%22%23fff4df%22%2F%3E%3Ccircle%20cx%3D%22278%22%20cy%3D%22274%22%20r%3D%227%22%20fill%3D%22%23fff4df%22%2F%3E%3Ccircle%20cx%3D%22307%22%20cy%3D%22274%22%20r%3D%227%22%20fill%3D%22%23fff4df%22%2F%3E%3Cpath%20d%3D%22M261%20354h101a15%2015%200%200%201%2015%2015v44a15%2015%200%200%201-15%2015h-9v19l-24-19h-68a15%2015%200%200%201-15-15v-44a15%2015%200%200%201%2015-15%22%20fill%3D%22%23d8c7a9%22%2F%3E%3Crect%20x%3D%22266%22%20y%3D%22373%22%20width%3D%2286%22%20height%3D%228%22%20rx%3D%224%22%20fill%3D%22%239b8a6e%22%2F%3E%3Crect%20x%3D%22266%22%20y%3D%22392%22%20width%3D%2261%22%20height%3D%228%22%20rx%3D%224%22%20fill%3D%22%239b8a6e%22%2F%3E%3Crect%20x%3D%22272%22%20y%3D%22472%22%20width%3D%2257%22%20height%3D%225%22%20rx%3D%223%22%20fill%3D%22%23c8c0b4%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E",
  businessCard: "/images/menu/business-card.webp",
  notebook: "/images/menu/measurement-notebook.webp",
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
