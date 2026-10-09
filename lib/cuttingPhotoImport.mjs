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
      enum: ["mm", "cm", "m", "unknown"],
    },
    raw: { type: "string" },
    notes: { type: "string" },
    issues: {
      type: "array",
      items: { type: "string" },
    },
  },
};

cutRowSchema.required = Object.keys(
  cutRowSchema.properties
);

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

const norm = value =>
  String(value || "").trim().toUpperCase();

const label = material =>
  [
    material.brand,
    material.product_code ||
      material.code ||
      material.product_name ||
      material.name,
  ]
    .filter(Boolean)
    .join(" / ")
    .trim()
    .toUpperCase();

export function checkAnalysis(data, pageCount) {
  if (
    !Array.isArray(data?.rows) ||
    data.rows.length > 300 ||
    !Array.isArray(data.warnings) ||
    data.warnings.some(
      value => typeof value !== "string"
    )
  ) {
    throw Error(
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
        [
          "group",
          "location",
          "part",
          "color",
          "raw",
          "notes",
        ].some(
          key => typeof row[key] !== "string"
        ) ||
        !["mm", "cm", "m", "unknown"].includes(
          row.unit
        ) ||
        !Array.isArray(row.issues) ||
        row.issues.some(
          value => typeof value !== "string"
        ) ||
        ["width", "height", "quantity"].some(
          key =>
            row[key] !== null &&
            (
              typeof row[key] !== "number" ||
              !Number.isFinite(row[key])
            )
        )
      ) {
        throw Error(
          "분석 결과 형식을 확인하지 못했습니다."
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

function sourceDimensions(raw) {
  const text = String(raw || "");

  const multiplied = text.match(
    /(^|[^\d.])(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)(?![\d.])/
  );

  if (multiplied) {
    return {
      width: Number(multiplied[2]),
      height: Number(multiplied[3]),
      decimal:
        multiplied[2].includes(".") ||
        multiplied[3].includes("."),
    };
  }

  const integers =
    text.match(
      /(^|[^\d.])(\d{2,})\s*\.\s*(\d{2,})(?!\d)/
    ) ||
    text.match(
      /(^|[^\d.])(\d{2,})\s+(\d{2,})(?![\d.])/
    );

  return integers
    ? {
        width: Number(integers[2]),
        height: Number(integers[3]),
        decimal: false,
      }
    : null;
}

function relaxMetadataIssues(row) {
  const kept = [];
  const moved = [];

  for (const original of row.issues || []) {
    for (
      const piece of String(original).split(
        /\s*\/\s*/
      )
    ) {
      const issue = piece.trim();
      if (!issue) continue;

      const numericOrMaterial =
        /수량|숫자|치수|폭|길이|가로|세로|중복|겹|취소|수정|덧쓴|괄호|필름|코드|브랜드|혼재|서로\s*다/.test(
          issue
        );

      const unitMissing =
        /단위/.test(issue) &&
        /명시되지|미표기|미기재|기재되지|없|누락|불명확|확인|모름/.test(
          issue
        );

      const labelMissing =
        /위치|부위|장소|제목/.test(issue) &&
        /명시되지|미표기|미기재|기재되지|없|누락|않음|공란/.test(
          issue
        );

      if (
        !numericOrMaterial &&
        (
          (
            unitMissing &&
            ["mm", "cm", "m"].includes(
              row.unit
            )
          ) ||
          labelMissing
        )
      ) {
        moved.push(issue);
      } else {
        kept.push(issue);
      }
    }
  }

  return {
    ...row,
    location: String(
      row.location || ""
    ).trim(),
    part: String(
      row.part || ""
    ).trim(),
    issues: [...new Set(kept)],
    notes: [
      ...new Set(
        [row.notes, ...moved].filter(Boolean)
      ),
    ].join(" · "),
  };
}

export function normalizePhotoRow(
  row,
  colors = [],
  defaultColor = ""
) {
  const next = {
    ...row,
    issues: [...(row.issues || [])],
  };

  const source = sourceDimensions(next.raw);

  if (source) {
    for (const key of ["width", "height"]) {
      if (
        next[key] == null ||
        next[key] === ""
      ) {
        next[key] = source[key];
      } else if (
        Math.abs(
          Number(next[key]) - source[key]
        ) > 0.000001
      ) {
        next.issues.push(
          "원문과 " +
            key +
            " 숫자가 달라 확인이 필요합니다."
        );
      }
    }
  }

  if (!["mm", "cm", "m"].includes(next.unit)) {
    if (
      source?.decimal &&
      source.width > 0 &&
      source.height > 0 &&
      source.width <= 50 &&
      source.height <= 50
    ) {
      next.unit = "m";
    } else if (
      (source && !source.decimal) ||
      (
        Number.isInteger(Number(next.width)) &&
        Number.isInteger(Number(next.height)) &&
        Number(next.width) >= 10 &&
        Number(next.height) >= 10
      )
    ) {
      next.unit = "mm";
    }
  }

  if (["mm", "cm", "m"].includes(next.unit)) {
    next.issues = next.issues.filter(
      issue =>
        !/^(치수\s*)?단위\s*(확인\s*필요|미표기|미기재|불명확|확인|모름)[.!]?\s*$/.test(
          issue.trim()
        )
    );
  }

  if (
    next.quantity == null ||
    next.quantity === ""
  ) {
    next.quantity = 1;
    next.notes = [
      next.notes,
      "수량 표기 없음: 1장",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const allowed = [
    ...new Set(
      colors.map(norm).filter(Boolean)
    ),
  ];

  const color = norm(next.color);

  if (allowed.length) {
    if (allowed.includes(color)) {
      next.color = color;
    } else if (color) {
      const matches = allowed.filter(
        value =>
          norm(value.split("/").at(-1)) === color
      );

      if (matches.length === 1) {
        next.color = matches[0];
      } else {
        next.issues.push(
          "현장 필름을 선택해주세요."
        );
      }
    } else {
      const fallback =
        norm(defaultColor) ||
        (
          allowed.length === 1
            ? allowed[0]
            : ""
        );

      if (allowed.includes(fallback)) {
        next.color = fallback;
      } else {
        next.issues.push(
          "현장 필름을 선택해주세요."
        );
      }
    }
  }

  next.issues = [...new Set(next.issues)];

  return relaxMetadataIssues(next);
}

export function confirmedSize(row) {
  if (!String(row.color || "").trim()) {
    throw Error("필름을 선택해주세요.");
  }

  const factor = {
    mm: 1,
    cm: 10,
    m: 1000,
  }[row.unit];

  if (!factor) {
    throw Error("치수 단위를 확인해주세요.");
  }

  const rawWidth = Number(row.width) * factor;
  const rawHeight = Number(row.height) * factor;
  const width = Math.round(rawWidth);
  const height = Math.round(rawHeight);
  const quantity = Number(row.quantity);

  if (
    ![
      rawWidth,
      rawHeight,
      quantity,
    ].every(Number.isFinite) ||
    Math.abs(rawWidth - width) > 0.000001 ||
    Math.abs(rawHeight - height) > 0.000001 ||
    ![
      width,
      height,
      quantity,
    ].every(Number.isSafeInteger) ||
    width <= 0 ||
    height <= 0 ||
    width > 100000 ||
    height > 100000 ||
    quantity < 1 ||
    quantity > 500
  ) {
    throw Error("폭·길이와 수량을 확인해주세요.");
  }

  return { width, height, quantity };
}

export function photoRowProblem(
  row,
  colors = []
) {
  row = relaxMetadataIssues(row);

  if (row.issues?.length) {
    return row.issues.join(" / ");
  }

  try {
    confirmedSize(row);

    if (
      colors.length &&
      !colors
        .map(norm)
        .includes(norm(row.color))
    ) {
      return "현장 필름을 선택해주세요.";
    }

    return "";
  } catch (error) {
    return error.message;
  }
}

export function appendPhotoRows(
  draft,
  rows,
  makeId
) {
  if (
    draft?.version !== 1 ||
    !Array.isArray(draft.sections) ||
    !Array.isArray(draft.rolls)
  ) {
    throw Error(
      "재단 입력을 준비하지 못했습니다. 화면을 다시 열어주세요."
    );
  }

  if (
    Object.values(
      draft.progress || {}
    ).some(Boolean)
  ) {
    throw Error(
      "완료 체크가 있습니다. 먼저 재단 계획 다시 작성을 눌러주세요."
    );
  }

  const knownSources = new Set(
    draft.sections.flatMap(section =>
      section.colors.flatMap(group =>
        group.sizes
          .map(size => size.photoSource?.importKey)
          .filter(Boolean)
      )
    )
  );

  const selected = rows.filter(
    row =>
      row.include &&
      (
        !row.importKey ||
        !knownSources.has(row.importKey)
      )
  );

  if (!selected.length) return draft;

  const groups = new Map();

  for (const row of selected) {
    const size = confirmedSize(row);
    const color = norm(row.color);
    const location = String(
      row.location || ""
    ).trim();
    const part = String(
      row.part || ""
    ).trim();

    const key = JSON.stringify([
      row.page,
      row.group,
      location,
      part,
      color,
    ]);

    if (!groups.has(key)) {
      groups.set(key, {
        id: makeId("section"),
        location,
        part,
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
        importKey: row.importKey || null,
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
    section.colors.every(group =>
      group.sizes.every(
        size => !size.width && !size.height
      )
    );

  const sections = [
    ...draft.sections.filter(
      section => !empty(section)
    ),
    ...groups.values(),
  ];

  if (sections.length > 500) {
    throw Error("부위가 너무 많습니다.");
  }

  const known = new Set(
    draft.rolls.map(
      roll => norm(roll.color)
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
    throw Error("롤이 너무 많습니다.");
  }

  return {
    ...draft,
    rolls,
    sections,
    result: null,
    progress: {},
  };
}

export function issuedCuttingRolls(
  stock,
  materials,
  siteId
) {
  const seen = new Set();

  return (stock.trips || [])
    .filter(
      trip =>
        trip.site_id === siteId &&
        trip.returned == null &&
        Number(trip.issued) > 0
    )
    .map(trip => {
      if (
        !trip.id ||
        seen.has(trip.id)
      ) {
        throw Error(
          "반출 롤 기록을 확인해주세요."
        );
      }

      seen.add(trip.id);

      const material = materials.find(
        item =>
          item.material_id === trip.material_id
      );

      if (!material) {
        throw Error(
          "반출 롤 " +
            (trip.label || trip.product_code) +
            "의 현장 필름 연결을 확인해주세요."
        );
      }

      const lengthM = Number(trip.issued);

      if (!Number.isFinite(lengthM)) {
        throw Error(
          "반출 길이가 올바르지 않습니다."
        );
      }

      return {
        id: "stock-trip-" + trip.id,
        stockTripId: trip.id,
        stockRollId: trip.roll_id,
        stockLabel: trip.label || "",
        color: label(material),
        lengthM,
        grainDirection: false,
      };
    });
}

export function seedIssuedDraft(
  draft,
  issued,
  makeId,
  force = false
) {
  const snapshot = JSON.stringify(
    issued
      .map(roll => [
        roll.stockTripId,
        roll.color,
        roll.lengthM,
      ])
      .sort((a, b) =>
        String(a[0]).localeCompare(
          String(b[0])
        )
      )
  );

  if (
    draft &&
    (
      draft.version !== 1 ||
      !Array.isArray(draft.rolls) ||
      !Array.isArray(draft.sections)
    )
  ) {
    throw Error(
      "저장된 재단 기록 형식을 확인해주세요."
    );
  }

  const blank =
    !draft ||
    (
      !draft.result &&
      !Object.values(
        draft.progress || {}
      ).some(Boolean) &&
      draft.rolls.every(
        roll =>
          !String(roll.lengthM ?? "").trim() ||
          Number(roll.lengthM) === 0
      )
    );

  if (!force && !blank) {
    return {
      draft,
      pending:
        draft.stockRollSnapshot !== snapshot,
    };
  }

  const first = issued[0]?.color || "";

  const rolls = issued.length
    ? issued
    : [
        {
          id: makeId("roll"),
          color: "",
          lengthM: "",
          grainDirection: false,
        },
      ];

  const sections = draft?.sections?.length
    ? draft.sections
    : [
        {
          id: makeId("section"),
          location: "",
          part: "",
          colors: [
            {
              id: makeId("color"),
              color: first,
              sizes: [
                {
                  id: makeId("size"),
                  width: "",
                  height: "",
                  quantity: 1,
                },
              ],
            },
          ],
        },
      ];

  return {
    pending: false,
    draft: {
      ...(draft || {}),
      version: 1,
      rolls,
      sections,
      rollMode: draft?.rollMode || "waste",
      result: null,
      progress: {},
      stockRollSnapshot: snapshot,
    },
  };
      }
