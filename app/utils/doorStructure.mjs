// 문 형태 분석은 기존 사진 분석 호출에서 함께 수행합니다.
export const DOOR_STRUCTURE_RULES = `
주 대상이 방문·중문·방화문이면 용도 분류와 별도로 문 형태를 자세히 관찰한다.
평판형, 홈형, 몰딩형, 유리형, 혼합형, 확인 필요로 구분한다.
홈/장식선의 방향·개수·배치, 사각 패널 구성, 돌출 테두리, 유리 위치·분할 수·가로살을 관찰한다.
나뭇결이나 그림자를 홈으로 단정하지 않는다. 사진에서 깊이가 불분명하면 홈/몰딩 구분 확인 필요라고 적는다.
문짝과 건축용 문틀을 분리하고 손잡이·경첩·잠금장치·열림 각도를 보이는 범위만 기록한다.
보이지 않는 뒷면·재질·치수·홈 깊이·전체 개수는 추정하지 않는다. 확인되지 않는 개수는 null이다.
사진에 보이는 표면과 실제 시공 범위는 다르다. 시공 전후 대응 사진이나 사용자가 명시한 범위 없이는 실제 시공 부위를 확정하지 않는다.
여러 문이 서로 다르면 하나의 형태로 합치지 말고 description에 문별 차이를 적는다.
기존 JSON 필드에 door_structure를 추가한다. 문이 아닌 주 대상은 null이다.
door_structure 형식:
{"shape":"몰딩형","pattern":"사각 패널 상하 2개","glass":"없음 또는 미확인 또는 위치·분할 설명","frame":"문틀·문선의 보이는 형태","hardware":"보이는 손잡이·경첩","opening":"여닫이·슬라이딩·미확인","visible_scope":"사진에 보이는 면과 잘린 범위","installation_scope":"실제 시공 범위 또는 확인 필요","uncertainties":["확인이 필요한 사항"]}
description에도 반드시 '문 형태: 형태 · 주요 구조'라는 짧은 문장을 포함하여 저장·검색에 활용되게 한다.
tags에는 문 형태와 핵심 패턴을 포함한다. 구조 정보는 가격이나 추가비용을 임의로 확정하는 근거가 아니다.
`;

const text = (value) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 300)
    : "";

export function doorStructureDescription(analysis = {}) {
  const description = text(
    analysis.description || analysis.ai_description
  );

  const detail = analysis.door_structure;

  if (
    !detail ||
    typeof detail !== "object" ||
    Array.isArray(detail)
  ) {
    return description;
  }

  const lines = [
    `문 형태: ${text(detail.shape) || "확인 필요"}${
      text(detail.pattern)
        ? ` · ${text(detail.pattern)}`
        : ""
    }`,

    ...[
      ["유리", "glass"],
      ["문틀", "frame"],
      ["부착물", "hardware"],
      ["개폐", "opening"],
      ["보이는 범위", "visible_scope"],
      ["시공 범위", "installation_scope"],
    ]
      .map(([label, key]) =>
        text(detail[key])
          ? `${label}: ${text(detail[key])}`
          : ""
      )
      .filter(Boolean),
  ];

  const unknown = Array.isArray(detail.uncertainties)
    ? detail.uncertainties
        .map(text)
        .filter(Boolean)
        .slice(0, 6)
    : [];

  if (unknown.length) {
    lines.push(`확인 필요: ${unknown.join(" · ")}`);
  }

  return [description, ...lines]
    .filter(Boolean)
    .join("\n");
}
