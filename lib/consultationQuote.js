export const quoteItemSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      ["name", "detail", "quantity", "unit", "film_no", "note"]
        .map((key) => [key, { type: "string" }])
    ),
    required: [
      "name",
      "detail",
      "quantity",
      "unit",
      "film_no",
      "note",
    ],
  },
};

const clean = (value) =>
  typeof value === "string"
    ? value.trim().slice(0, 2000)
    : "";

export function consultationItems(raw) {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 60)
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        clean(item.name)
    )
    .map((item) => ({
      ...Object.fromEntries(
        ["name", "detail", "unit", "film_no", "note"]
          .map((key) => [key, clean(item[key])])
      ),
      quantity:
        /^\d+(\.\d{1,3})?$/.test(
          String(item.quantity ?? "")
        ) &&
        Number(item.quantity) <= 1000000
          ? String(item.quantity)
          : "",
      unit_price: "",
    }));
}

export function quoteSeed(data) {
  const items = consultationItems(data.quote_items);

  return {
    items: items.length
      ? items
      : data.work_description
        ? [{
            name: "시공 내용",
            detail: clean(data.work_description),
            quantity: "",
            unit: "",
            film_no: "",
            note: "수량 확인 필요",
            unit_price: "",
          }]
        : [],
    work_date: (data.work_dates || [data.date])
      .filter(Boolean)
      .join(", "),
    other_schedule: clean(data.other_schedule),
  };
}

export function quoteTotals(items) {
  const complete =
    items.length > 0 &&
    items.every(
      (item) =>
        String(item.quantity).trim() !== "" &&
        String(item.unit_price).trim() !== ""
    );

  const amount = items.reduce(
    (sum, item) =>
      sum +
      Math.round(
        Number(item.quantity || 0) *
        Number(item.unit_price || 0)
      ),
    0
  );

  return { complete, amount };
}

export function validateQuote(raw) {
  if (
    !raw ||
    !Array.isArray(raw.items) ||
    raw.items.length > 60
  ) {
    throw Error("견적 항목은 최대 60개입니다.");
  }

  const fields = [
    "title",
    "company_name",
    "business_number",
    "company_phone",
    "customer_name",
    "customer_phone",
    "address",
    "work_date",
    "duration",
    "customer_note",
    "other_schedule",
    "footer",
    "vat",
  ];

  const result = Object.fromEntries(
    fields.map((key) => [key, clean(raw[key])])
  );

  if (
    !["separate", "included", "none"].includes(result.vat)
  ) {
    throw Error("부가세 표시를 선택해주세요.");
  }

  result.items = raw.items.map((item, index) => {
    if (!item || !clean(item.name)) {
      throw Error(`${index + 1}번 항목명을 입력해주세요.`);
    }

    const row = Object.fromEntries(
      ["name", "detail", "unit", "film_no", "note"]
        .map((key) => [key, clean(item[key])])
    );

    for (const key of ["quantity", "unit_price"]) {
      const value = String(item[key] ?? "").trim();

      if (
        value !== "" &&
        (
          !/^\d+(\.\d{1,3})?$/.test(value) ||
          Number(value) >
            (key === "quantity" ? 1000000 : 1000000000) ||
          (
            key === "unit_price" &&
            !Number.isInteger(Number(value))
          )
        )
      ) {
        throw Error(
          `${index + 1}번 수량 또는 단가를 확인해주세요.`
        );
      }

      row[key] = value;
    }

    return row;
  });

  if (
    !Number.isSafeInteger(
      quoteTotals(result.items).amount
    )
  ) {
    throw Error("견적 합계가 너무 큽니다.");
  }

  return result;
}
