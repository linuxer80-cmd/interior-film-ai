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
              reject(new Error("사진
