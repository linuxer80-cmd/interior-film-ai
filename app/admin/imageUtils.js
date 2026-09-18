export async function resizeImage(
  file,
  maxSize = 1200,
  quality = 0.7
) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        let width = image.naturalWidth || image.width;
        let height = image.naturalHeight || image.height;
        const longest = Math.max(width, height);

        if (longest > maxSize) {
          const ratio = maxSize / longest;
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", {
          alpha: false,
        });

        if (!ctx) {
          reject(new Error("이미지 변환 실패"));
          return;
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("사진 압축 실패"));
              return;
            }

            const originalName = String(
              file.name || "photo"
            );

            const fileName =
              originalName.replace(/\.[^.]+$/, "") +
              ".jpg";

            resolve(
              new File([blob], fileName, {
                type: "image/jpeg",
              })
            );
          },
          "image/jpeg",
          quality
        );
      };

      image.onerror = () => {
        reject(
          new Error("사진을 불러오지 못했습니다.")
        );
      };

      image.src = reader.result;
    };

    reader.onerror = () => {
      reject(
        new Error("사진 파일을 읽지 못했습니다.")
      );
    };

    reader.readAsDataURL(file);
  });
}

export async function getImageHash(file) {
  const buffer = await file.arrayBuffer();

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    buffer
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}
