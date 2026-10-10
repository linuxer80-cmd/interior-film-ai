import { doorStructureDescription } from "./doorStructure.mjs";

export const WINDOW_STRUCTURE_RULES = `
주 대상이 샤시·샷시·창호이면 window로 분류하고 창 구조를 자세히 관찰한다.
일반 창, 발코니 출입창, 고정창, 혼합형, 확인 필요를 구분한다. 유리라는 이유로 중문으로 분류하지 않는다.
미닫이·여닫이·고정·혼합 여부는 레일, 경첩, 손잡이, 창짝 겹침 등 보이는 근거로 판단한다.
외곽 고정틀, 움직이는 창짝틀, 고정 유리부, 중간 기둥, 주변 마감 몰딩은 서로 다른 부위다.
눈에 보이는 창짝 구성과 전체 창짝 수를 구분한다. 겹침·가림 때문에 개수를 확정할 수 없으면 전체 개수는 null로 남긴다.
이중창은 안팎 창짝과 레일 근거가 확인될 때만 판단한다. 복층유리는 이중창과 다르며 유리 두께·재질을 사진만으로 확정하지 않는다.
앞쪽 발코니 출입 샤시와 유리 너머 발코니 외창은 별개 대상이다. 배경 외창·난간·유리 반사를 앞쪽 창짝이나 프레임으로 세지 않는다.
유리 너머 다른 창은 background_windows에 기록하고 주 대상의 시공 범위·창짝 수에 포함하지 않는다.
여러 사진을 볼 때 같은 창의 다른 각도인지 구조·주변 배치로 비교하되, 창 모양이 같다는 이유만으로 동일 대상으로 확정하지 않는다. 단일 사진만으로 사진 간 동일성은 판단하지 않는다.
정확한 가로·세로·깊이, 프레임 재질, 보이지 않는 레일 수, 바깥면은 추정하지 않는다.
보이는 면과 실제 시공 범위를 분리한다. 외곽틀만/창짝 포함/몰딩 포함, 실내면/양면 여부는 사용자 지정이나 대응 전후사진 근거가 없으면 확인 필요다.
유리·고무 패킹·모헤어·손잡이·잠금장치·레일 작동부는 프레임 필름 시공 표면과 구분한다.
기존 JSON에 window_structure를 추가한다. 샤시가 아닌 주 대상은 null이다.
형식:
{"kind":"일반 창 또는 발코니 출입창 등","opening":"미닫이 등","sashes":"보이는 창짝의 구성과 겹침 설명","confirmed_sash_count":null,"layers":"이중창 여부와 관찰 근거 또는 미확인","frame":"외곽틀·창짝틀·중간 기둥 구성","trim":"주변 마감 몰딩 구성 또는 미확인","hardware":"보이는 손잡이·잠금장치","background_windows":"유리 너머 별도 창 또는 없음 또는 미확인","visible_scope":"사진에 보이는 면과 가림","installation_scope":"확인된 실제 시공 범위 또는 확인 필요","uncertainties":["확인 사항"]}
description에도 반드시 '샤시 구조: 종류 · 개폐 방식 · 보이는 구성' 요약을 포함하고 tags에 핵심 구조를 넣는다.
구조만으로 시공금액이나 추가비용을 임의로 확정하지 않는다.
`;

const text = (value) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 300)
    : "";

export function photoStructureDescription(analysis = {}) {
  const detail = analysis.window_structure;

  if (
    !detail ||
    typeof detail !== "object" ||
    Array.isArray(detail)
  ) {
    return doorStructureDescription(analysis);
  }

  const description =
    typeof (analysis.description || analysis.ai_description) === "string"
      ? (analysis.description || analysis.ai_description).trim()
      : "";

  const lines = [
    `샤시 구조: ${
      [
        text(detail.kind),
        text(detail.opening),
        text(detail.sashes),
      ]
        .filter(Boolean)
        .join(" · ") || "확인 필요"
    }`,

    ...[
      ["창 겹침", "layers"],
      ["프레임", "frame"],
      ["주변 몰딩", "trim"],
      ["부착물", "hardware"],
      ["배경의 별도 창", "background_windows"],
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

  if (
    Number.isInteger(detail.confirmed_sash_count) &&
    detail.confirmed_sash_count > 0 &&
    detail.confirmed_sash_count <= 50
  ) {
    lines.push(
      `확인된 창짝 수: ${detail.confirmed_sash_count}개`
    );
  }

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
