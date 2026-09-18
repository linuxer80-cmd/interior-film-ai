import { formatWon } from "./adminUtils";

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

export async function createQuoteBlob(lead) {
  const canvas = document.createElement("canvas");

  canvas.width = 1080;
  canvas.height = 1500;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error(
      "견적 이미지를 만들 수 없습니다."
    );
  }

  ctx.fillStyle = "#f7f4ef";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#5d4037";
  ctx.fillRect(0, 0, canvas.width, 210);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 54px sans-serif";
  ctx.fillText("기분좋은공간", 70, 95);

  ctx.font = "30px sans-serif";
  ctx.fillText(
    "인테리어필름 최종 견적서",
    70,
    150
  );

  let y = 290;

  ctx.fillStyle = "#111827";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText("고객 정보", 70, y);

  y += 55;
  ctx.font = "28px sans-serif";

  ctx.fillText(
    `고객명 : ${lead.customer_name || "-"}`,
    70,
    y
  );

  y += 45;

  ctx.fillText(
    `지역 : ${
      lead.region || lead.address || "-"
    }`,
    70,
    y
  );

  y += 75;

  ctx.strokeStyle = "#d6d3d1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, y);
  ctx.lineTo(1010, y);
  ctx.stroke();

  y += 70;

  ctx.font = "bold 32px sans-serif";
  ctx.fillText("시공 내용", 70, y);

  y += 50;
  ctx.font = "27px sans-serif";

  const workLines = wrapCanvasText(
    ctx,
    lead.quote_work_details || "상담 후 확정",
    900
  );

  for (const line of workLines) {
    ctx.fillText(line, 70, y);
    y += 42;
  }

  y += 35;

  ctx.font = "bold 32px sans-serif";
  ctx.fillText("사용 자재", 70, y);

  y += 50;
  ctx.font = "27px sans-serif";

  const materialLines = wrapCanvasText(
    ctx,
    lead.quote_material || "협의",
    900
  );

  for (const line of materialLines) {
    ctx.fillText(line, 70, y);
    y += 42;
  }

  y += 45;

  ctx.fillStyle = "#5d4037";
  ctx.fillRect(70, y, 940, 150);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 31px sans-serif";
  ctx.fillText("최종 견적금액", 110, y + 58);

  ctx.font = "bold 46px sans-serif";
  ctx.textAlign = "right";

  ctx.fillText(
    formatWon(lead.final_price),
    960,
    y + 108
  );

  ctx.textAlign = "left";
  y += 220;

  ctx.fillStyle = "#111827";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("안내사항", 70, y);

  y += 48;
  ctx.font = "25px sans-serif";

  const noteLines = wrapCanvasText(
    ctx,
    lead.quote_note ||
      "현장 상태 및 추가 작업 발생 시 금액이 변경될 수 있습니다.",
    900
  );

  for (const line of noteLines) {
    ctx.fillText(line, 70, y);
    y += 39;
  }

  ctx.fillStyle = "#78716c";
  ctx.font = "23px sans-serif";

  ctx.fillText(
    `견적일 : ${new Date().toLocaleDateString(
      "ko-KR"
    )}`,
    70,
    1390
  );

  ctx.fillText(
    "기분좋은공간 · 대표 정근호",
    70,
    1435
  );

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new Error("견적 이미지 생성 실패")
          );
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.92
    );
  });
}
export async function shareQuote(lead, setLeadsMessage) {
  const phone = String(lead?.phone || "").replace(/[^\d+]/g, "");

  if (!phone) {
    setLeadsMessage?.("⚠️ 고객 전화번호가 없습니다.");
    return;
  }

  const price = Number(
    String(lead?.final_price || "").replace(/,/g, ""),
  );

  if (!Number.isFinite(price) || price <= 0) {
    setLeadsMessage?.("⚠️ 먼저 최종 견적금액을 저장해주세요.");
    return;
  }

  const customerName = String(lead?.customer_name || "고객").trim();

  const workDetails = String(
    lead?.quote_work_details || lead?.request_text || "",
  ).trim();

  const material = String(lead?.quote_material || "").trim();
  const note = String(lead?.quote_note || "").trim();

  const message = [
    `[기분좋은공간 인테리어필름 견적]`,
    "",
    `${customerName} 고객님, 요청하신 견적을 안내드립니다.`,
    "",
    workDetails ? `■ 시공 내용\n${workDetails}` : "",
    material ? `■ 사용 자재\n${material}` : "",
    `■ 최종 견적\n${price.toLocaleString("ko-KR")}원`,
    note ? `■ 안내사항\n${note}` : "",
    "",
    "감사합니다.",
    "기분좋은공간 · 대표 정근호",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
  } catch (error) {
    console.error("문자 작성 화면 열기 오류:", error);

    setLeadsMessage?.(
      `❌ 문자 앱을 열지 못했습니다: ${error?.message || "실패"}`,
    );
  }
      }
