export const cutRowSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer" },
    group: { type: "string" },
    location: { type: "string" },
    part: { type: "string" },
    color: { type: "string" },
    width: { type: ["number", "null"] },
    height: { type: ["number", "null"] },
    quantity: { type: ["integer", "null"] },
    unit: {
      type: "string",
      enum: ["mm", "cm", "unknown"],
    },
    raw: { type: "string" },
    notes: { type: "string" },
    issues: {
      type: "array",
      items: { type: "string" },
    },
  },
};

cutRowSchema.required = Object.keys(cutRowSchema.properties);

export const cutSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    rows: {
      type: "array",
      items: cutRowSchema,
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["rows", "warnings"],
};

export function checkAnalysis(data, pageCount) {
  if (
    !Array.isArray(data?.rows) ||
    data.rows.length > 300 ||
    !Array.isArray(data.warnings) ||
    data.warnings.some(value => typeof value !== "string")
  ) {
    throw new Error(
      "분석 결과가 불완전합니다. 사진을 나눠 다시 분석해주세요."
    );
  }

  return {
    warnings: data.warnings,
    rows: data.rows.map((row, index) => {
      if (
        !row ||
        !Number.isInteger(row.page) ||
        row.page < 1 ||
        row.page > pageCount ||
        ["group", "location", "part", "color", "raw", "notes"].some(
          key => typeof row[key] !== "string"
        ) ||
        !["mm", "cm", "unknown"].includes(row.unit) ||
        !Array.isArray(row.issues) ||
        row.issues.some(value => typeof value !== "string") ||
        ["width", "height", "quantity"].some(
          key =>
            row[key] !== null &&
            (
              typeof row[key] !== "number" ||
              !Number.isFinite(row[key])
            )
        )
      ) {
        throw new Error(
          "분석 결과 형식을 확인하지 못했습니다. 다시 분석해주세요."
        );
      }

      return {
        ...row,
        id: "photo-row-" + index,
        include: false,
      };
    }),
  };
}

export function confirmedSize(row) {
  if (
    !row.location?.trim() ||
    !row.part?.trim() ||
    !row.color?.trim()
  ) {
    throw new Error(
      "선택한 항목의 위치·부위·필름을 입력해주세요."
    );
  }

  if (!["mm", "cm"].includes(row.unit)) {
    throw new Error("치수 단위를 선택해주세요.");
  }

  const factor = row.unit === "cm" ? 10 : 1;
  const width = Number(row.width) * factor;
  const height = Number(row.height) * factor;
  const quantity = Number(row.quantity);

  if (
    ![width, height, quantity].every(Number.isSafeInteger) ||
    width <= 0 ||
    height <= 0 ||
    width > 100000 ||
    height > 100000 ||
    quantity < 1 ||
    quantity > 500
  ) {
    throw new Error(
      "폭·길이는 양의 mm 정수, 수량은 1~500장으로 확인해주세요."
    );
  }

  return { width, height, quantity };
}

export function appendPhotoRows(draft, rows, makeId) {
  if (
    draft?.version !== 1 ||
    !Array.isArray(draft.sections) ||
    !Array.isArray(draft.rolls)
  ) {
    throw new Error(
      "현재 재단 입력을 저장하지 못했습니다. 재단 화면을 다시 열어주세요."
    );
  }

  if (Object.values(draft.progress || {}).some(Boolean)) {
    throw new Error(
      "완료 체크가 있는 도면입니다. 먼저 재단 계획 다시 작성을 눌러주세요."
    );
  }

  const selected = rows.filter(row => row.include);

  if (!selected.length) {
    throw new Error(
      "확인한 항목의 추가 체크를 선택해주세요."
    );
  }

  const groups = new Map();

  for (const row of selected) {
    const size = confirmedSize(row);
    const color = row.color.trim().toUpperCase();

    const key = JSON.stringify([
      row.page,
      row.group,
      row.location.trim(),
      row.part.trim(),
      color,
    ]);

    if (!groups.has(key)) {
      groups.set(key, {
        id: makeId("section"),
        location: row.location.trim(),
        part: row.part.trim(),
        colors: [
          {
            id: makeId("color"),
            color,
            sizes: [],
          },
        ],
      });
    }

    groups.get(key).colors[0].sizes.push({
      id: makeId("size"),
      ...size,
      photoSource: {
        page: row.page,
        raw: row.raw,
        notes: row.notes,
        issues: row.issues,
      },
    });
  }

  const empty = section =>
    !section.location &&
    !section.part &&
    section.colors?.every(group =>
      group.sizes?.every(size => !size.width && !size.height)
    );

  const sections = [
    ...draft.sections.filter(section => !empty(section)),
    ...groups.values(),
  ];

  if (sections.length > 500) {
    throw new Error(
      "부위가 너무 많습니다. 재단 계획을 나눠주세요."
    );
  }

  const known = new Set(
    draft.rolls.map(roll =>
      String(roll.color || "").trim().toUpperCase()
    )
  );

  const rolls = [...draft.rolls];

  for (const section of groups.values()) {
    const color = section.colors[0].color;

    if (!known.has(color)) {
      rolls.push({
        id: makeId("roll"),
        color,
        lengthM: "",
        grainDirection: false,
      });

      known.add(color);
    }
  }

  if (rolls.length > 100) {
    throw new Error("보유 필름 목록이 너무 많습니다.");
  }

  return {
    ...draft,
    sections,
    rolls,
    result: null,
    progress: {},
  };
        }
