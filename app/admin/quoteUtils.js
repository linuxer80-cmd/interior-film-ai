import { formatWon } from "./adminUtils";

/* =========================================================
   공통 문자열 정리
========================================================= */

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/* =========================================================
   Canvas 줄바꿈
========================================================= */

export function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);

  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current
      ? `${current} ${word}`
      : word;

    if (
      ctx.measureText(test).width > maxWidth &&
      current
    ) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

/* =========================================================
   견적 이미지 생성
========================================================= */

export async function createQuoteBlob(
  lead,
  companyName = "",
  representativeName = "",
) {
  const resolvedCompanyName =
    cleanText(companyName, "인테리어필름");

  const resolvedRepresentativeName =
    cleanText(representativeName);

  const canvas =
    document.createElement("canvas");

  canvas.width = 1080;
  canvas.height = 1500;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error(
      "견적 이미지를 만들 수 없습니다.",
    );
  }

  /* 배경 */
  ctx.fillStyle = "#f7f4ef";
  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  /* 상단 */
  ctx.fillStyle = "#5d4037";
  ctx.fillRect(
    0,
    0,
    canvas.width,
    210,
  );

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 54px sans-serif";

  const companyTitleLines =
    wrapCanvasText(
      ctx,
      resolvedCompanyName,
      930,
    );

  ctx.fillText(
    companyTitleLines[0] ||
      resolvedCompanyName,
    70,
    95,
  );

  ctx.font = "30px sans-serif";
  ctx.fillText(
    "인테리어필름 최종 견적서",
    70,
    150,
  );

  let y = 290;

  /* 고객 정보 */
  ctx.fillStyle = "#111827";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(
    "고객 정보",
    70,
    y,
  );

  y += 55;

  ctx.font = "28px sans-serif";

  ctx.fillText(
    `고객명 : ${
      lead?.customer_name || "-"
    }`,
    70,
    y,
  );

  y += 45;

  ctx.fillText(
    `지역 : ${
      lead?.region ||
      lead?.address ||
      "-"
    }`,
    70,
    y,
  );

  y += 75;

  ctx.strokeStyle = "#d6d3d1";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(70, y);
  ctx.lineTo(1010, y);
  ctx.stroke();

  y += 70;

  /* 시공 내용 */
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(
    "시공 내용",
    70,
    y,
  );

  y += 50;

  ctx.font = "27px sans-serif";

  const workLines =
    wrapCanvasText(
      ctx,
      lead?.quote_work_details ||
        "상담 후 확정",
      900,
    );

  for (const line of workLines) {
    ctx.fillText(
      line,
      70,
      y,
    );

    y += 42;
  }

  y += 35;

  /* 사용 자재 */
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(
    "사용 자재",
    70,
    y,
  );

  y += 50;

  ctx.font = "27px sans-serif";

  const materialLines =
    wrapCanvasText(
      ctx,
      lead?.quote_material ||
        "협의",
      900,
    );

  for (const line of materialLines) {
    ctx.fillText(
      line,
      70,
      y,
    );

    y += 42;
  }

  y += 45;

  /* 최종 금액 */
  ctx.fillStyle = "#5d4037";

  ctx.fillRect(
    70,
    y,
    940,
    150,
  );

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 31px sans-serif";

  ctx.fillText(
    "최종 견적금액",
    110,
    y + 58,
  );

  ctx.font = "bold 46px sans-serif";
  ctx.textAlign = "right";

  ctx.fillText(
    formatWon(
      lead?.final_price,
    ),
    960,
    y + 108,
  );

  ctx.textAlign = "left";

  y += 220;

  /* 안내사항 */
  ctx.fillStyle = "#111827";
  ctx.font = "bold 30px sans-serif";

  ctx.fillText(
    "안내사항",
    70,
    y,
  );

  y += 48;

  ctx.font = "25px sans-serif";

  const noteLines =
    wrapCanvasText(
      ctx,
      lead?.quote_note ||
        "현장 상태 및 추가 작업 발생 시 금액이 변경될 수 있습니다.",
      900,
    );

  for (const line of noteLines) {
    ctx.fillText(
      line,
      70,
      y,
    );

    y += 39;
  }

  /* 하단 */
  ctx.fillStyle = "#78716c";
  ctx.font = "23px sans-serif";

  ctx.fillText(
    `견적일 : ${new Date().toLocaleDateString(
      "ko-KR",
    )}`,
    70,
    1390,
  );

  const footerText =
    resolvedRepresentativeName
      ? `${resolvedCompanyName} · 대표 ${resolvedRepresentativeName}`
      : resolvedCompanyName;

  ctx.fillText(
    footerText,
    70,
    1435,
  );

  /* Blob 생성 */
  return await new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(
                "견적 이미지 생성 실패",
              ),
            );

            return;
          }

          resolve(blob);
        },
        "image/jpeg",
        0.92,
      );
    },
  );
}

/* =========================================================
   견적 미리보기
========================================================= */

export async function createQuotePreview(
  lead,
  companyName = "",
  representativeName = "",
) {
  const price = Number(
    String(
      lead?.final_price || "",
    ).replace(/,/g, ""),
  );

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new Error(
      "먼저 최종 견적금액을 저장해주세요.",
    );
  }

  const blob =
    await createQuoteBlob(
      lead,
      companyName,
      representativeName,
    );

  if (!blob) {
    throw new Error(
      "견적 이미지를 만들지 못했습니다.",
    );
  }

  return {
    blob,
    url: URL.createObjectURL(blob),
  };
}

/* =========================================================
   JPEG → PNG
   기존 호환 기능 유지
========================================================= */

async function convertQuoteBlobToPng(
  blob,
) {
  const bitmap =
    await createImageBitmap(blob);

  const canvas =
    document.createElement("canvas");

  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context =
    canvas.getContext("2d");

  if (!context) {
    bitmap.close?.();

    throw new Error(
      "견적 이미지를 변환하지 못했습니다.",
    );
  }

  context.drawImage(
    bitmap,
    0,
    0,
  );

  bitmap.close?.();

  return await new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (pngBlob) => {
          if (!pngBlob) {
            reject(
              new Error(
                "견적 이미지 복사 준비에 실패했습니다.",
              ),
            );

            return;
          }

          resolve(pngBlob);
        },
        "image/png",
      );
    },
  );
}

/* =========================================================
   이미지 클립보드 복사
   기존 다른 코드 호환을 위해 유지
========================================================= */

export async function copyQuoteImage(
  blob,
) {
  if (!blob) {
    throw new Error(
      "먼저 견적서를 만들어주세요.",
    );
  }

  if (
    typeof navigator ===
      "undefined" ||
    !navigator.clipboard ||
    typeof ClipboardItem ===
      "undefined"
  ) {
    throw new Error(
      "이 브라우저에서는 이미지 복사를 지원하지 않습니다.",
    );
  }

  const pngBlob =
    await convertQuoteBlobToPng(
      blob,
    );

  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": pngBlob,
    }),
  ]);

  return true;
}

/* =========================================================
   견적 이미지 파일 생성
========================================================= */

export function makeQuoteFile(
  blob,
  lead,
  companyName = "",
) {
  if (!blob) {
    throw new Error(
      "견적 이미지가 없습니다.",
    );
  }

  const resolvedCompanyName =
    cleanText(
      companyName,
      "인테리어필름",
    );

  const customerName =
    cleanText(
      lead?.customer_name,
      "고객",
    );

  const safeCompanyName =
    resolvedCompanyName.replace(
      /[\\/:*?"<>|]/g,
      "_",
    );

  const safeCustomerName =
    customerName.replace(
      /[\\/:*?"<>|]/g,
      "_",
    );

  return new File(
    [blob],
    `${safeCompanyName}_견적_${safeCustomerName}.jpg`,
    {
      type:
        blob.type ||
        "image/jpeg",
    },
  );
}

/* =========================================================
   이미지 파일만 공유
   문자 본문 없음
========================================================= */

export async function shareQuoteImage(
  blob,
  lead,
  companyName = "",
) {
  const file =
    makeQuoteFile(
      blob,
      lead,
      companyName,
    );

  if (
    typeof navigator !==
      "undefined" &&
    typeof navigator.share ===
      "function"
  ) {
    const canShareFile =
      typeof navigator.canShare !==
        "function" ||
      navigator.canShare({
        files: [file],
      });

    if (canShareFile) {
      /*
       * 중요:
       * title / text를 넣지 않습니다.
       * 공유되는 데이터는 견적 이미지 파일뿐입니다.
       */
      await navigator.share({
        files: [file],
      });

      return {
        shared: true,
        downloaded: false,
      };
    }
  }

  /*
   * 파일 공유를 지원하지 않는 브라우저에서는
   * 이미지만 저장합니다.
   */
  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = file.name;

  document.body.appendChild(
    anchor,
  );

  anchor.click();
  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  return {
    shared: false,
    downloaded: true,
  };
}

/* =========================================================
   기존 함수명 호환
   문자 본문은 넣지 않음
========================================================= */

export function openCustomerSms(
  lead,
) {
  const phone = String(
    lead?.phone || "",
  ).replace(/[^\d+]/g, "");

  if (!phone) {
    throw new Error(
      "고객 전화번호가 없습니다.",
    );
  }

  /*
   * 기존 코드가 이 함수를 호출하더라도
   * 문자 본문은 절대 넣지 않습니다.
   */
  window.location.href =
    `sms:${phone}`;
}

/* =========================================================
   기존 shareQuote 호환
   문자 작성 대신 이미지 공유는 blob이 필요하므로
   이 함수에서는 자동 문자를 만들지 않음
========================================================= */

export async function shareQuote(
  lead,
  setLeadsMessage,
) {
  const price = Number(
    String(
      lead?.final_price || "",
    ).replace(/,/g, ""),
  );

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    setLeadsMessage?.(
      "⚠️ 먼저 최종 견적금액을 저장해주세요.",
    );

    return;
  }

  setLeadsMessage?.(
    "⚠️ 견적서 이미지를 먼저 만든 후 이미지 전송 버튼을 이용해주세요.",
  );
}
