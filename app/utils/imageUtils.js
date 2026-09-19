// app/utils/imageUtils.js

// ======================================================
// 인테리어필름 AI 자동견적
// 이미지 처리 공통 함수
//
// 담당 기능
// - 고유 ID 생성
// - File → Data URL 변환
// - 이미지 로딩
// - 고객 사진 크기 축소
// - JPEG 변환
// - 미리보기 URL 생성
// - 미리보기 URL 해제
// ======================================================


// ------------------------------------------------------
// 고유 ID 생성
// ------------------------------------------------------

export function makeId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}


// ------------------------------------------------------
// File → Data URL
// ------------------------------------------------------

export async function fileToDataUrl(file) {
  if (!file) {
    throw new Error(
      "사진 파일이 없습니다."
    );
  }

  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () => {
        if (
          typeof reader.result !==
          "string"
        ) {
          reject(
            new Error(
              "사진 데이터를 읽을 수 없습니다."
            )
          );

          return;
        }

        resolve(
          reader.result
        );
      };

      reader.onerror = () => {
        reject(
          new Error(
            "사진 파일을 읽을 수 없습니다."
          )
        );
      };

      reader.readAsDataURL(
        file
      );
    }
  );
}


// ------------------------------------------------------
// Data URL → 브라우저 이미지 객체
// ------------------------------------------------------

export async function loadImageFromDataUrl(
  dataUrl
) {
  if (!dataUrl) {
    throw new Error(
      "이미지 데이터가 없습니다."
    );
  }

  return new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      image.onload = () => {
        resolve(image);
      };

      image.onerror = () => {
        reject(
          new Error(
            "사진을 불러올 수 없습니다."
          )
        );
      };

      image.src =
        dataUrl;
    }
  );
}


// ------------------------------------------------------
// 고객 사진 최적화
//
// 기본:
// 최대 크기 1200px
// JPEG 품질 0.68
//
// 휴대폰에서 촬영한 큰 사진을
// AI 분석 및 업로드에 적당한 크기로 변환
// ------------------------------------------------------

export async function prepareImage(
  file,
  maxSize = 1200,
  quality = 0.68
) {
  if (!file) {
    throw new Error(
      "사진 파일이 없습니다."
    );
  }

  let bitmap = null;
  let source = null;

  let originalWidth = 0;
  let originalHeight = 0;

  // ----------------------------------------------------
  // 가능하면 createImageBitmap 사용
  // ----------------------------------------------------

  try {
    if (
      typeof createImageBitmap ===
      "function"
    ) {
      bitmap =
        await createImageBitmap(
          file
        );
    }
  } catch (error) {
    console.warn(
      "createImageBitmap 사용 실패:",
      error
    );

    bitmap = null;
  }

  // ----------------------------------------------------
  // 이미지 크기 확인
  // ----------------------------------------------------

  if (bitmap) {
    source = bitmap;

    originalWidth =
      bitmap.width;

    originalHeight =
      bitmap.height;
  } else {
    const dataUrl =
      await fileToDataUrl(
        file
      );

    const image =
      await loadImageFromDataUrl(
        dataUrl
      );

    source = image;

    originalWidth =
      image.naturalWidth ||
      image.width;

    originalHeight =
      image.naturalHeight ||
      image.height;
  }

  if (
    !originalWidth ||
    !originalHeight
  ) {
    bitmap?.close?.();

    throw new Error(
      "사진 크기를 확인할 수 없습니다."
    );
  }

  // ----------------------------------------------------
  // 최대 크기에 맞춰 비율 유지 축소
  // ----------------------------------------------------

  let width =
    originalWidth;

  let height =
    originalHeight;

  if (
    width > maxSize ||
    height > maxSize
  ) {
    const ratio =
      Math.min(
        maxSize / width,
        maxSize / height
      );

    width =
      Math.round(
        width * ratio
      );

    height =
      Math.round(
        height * ratio
      );
  }

  // ----------------------------------------------------
  // Canvas 생성
  // ----------------------------------------------------

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    width;

  canvas.height =
    height;

  const context =
    canvas.getContext(
      "2d",
      {
        alpha: false,
      }
    );

  if (!context) {
    bitmap?.close?.();

    throw new Error(
      "이미지 처리 기능을 사용할 수 없습니다."
    );
  }

  // ----------------------------------------------------
  // JPEG 투명 배경 방지
  // ----------------------------------------------------

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    width,
    height
  );

  // ----------------------------------------------------
  // 이미지 그리기
  // ----------------------------------------------------

  context.drawImage(
    source,
    0,
    0,
    width,
    height
  );

  bitmap?.close?.();

  // ----------------------------------------------------
  // Canvas → JPEG Blob
  // ----------------------------------------------------

  const blob =
    await new Promise(
      (resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (!result) {
              reject(
                new Error(
                  "JPEG 이미지 변환에 실패했습니다."
                )
              );

              return;
            }

            resolve(
              result
            );
          },

          "image/jpeg",

          quality
        );
      }
    );

  // ----------------------------------------------------
  // 새로운 File 객체 생성
  // ----------------------------------------------------

  const convertedFile =
    new File(
      [blob],

      `customer-${makeId()}.jpg`,

      {
        type:
          "image/jpeg",

        lastModified:
          Date.now(),
      }
    );

  // ----------------------------------------------------
  // 화면 미리보기 URL
  // ----------------------------------------------------

  const preview =
    URL.createObjectURL(
      convertedFile
    );

  return {
    file:
      convertedFile,

    preview,

    width,

    height,

    originalWidth,

    originalHeight,
  };
}


// ------------------------------------------------------
// 미리보기 Blob URL 안전하게 해제
// ------------------------------------------------------

export function revokePreviewUrl(
  preview
) {
  if (
    typeof preview !==
      "string" ||
    !preview.startsWith(
      "blob:"
    )
  ) {
    return;
  }

  try {
    URL.revokeObjectURL(
      preview
    );
  } catch (error) {
    console.warn(
      "미리보기 URL 해제 실패:",
      error
    );
  }
}


// ------------------------------------------------------
// 이미지 객체 하나의 미리보기 제거
// ------------------------------------------------------

export function revokeImagePreview(
  image
) {
  if (!image) {
    return;
  }

  revokePreviewUrl(
    image.preview
  );
}


// ------------------------------------------------------
// 여러 이미지 미리보기 한번에 제거
// ------------------------------------------------------

export function revokeImagePreviews(
  images = []
) {
  if (
    !Array.isArray(
      images
    )
  ) {
    return;
  }

  for (
    const image of
      images
  ) {
    revokeImagePreview(
      image
    );
  }
    }
