import { quoteTotals } from "./consultationQuote";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character])
  );

const hasValue = (value) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== "";

const money = (value) =>
  Number(value).toLocaleString("ko-KR");

function display(value, fallback = "—") {
  return hasValue(value)
    ? escape(value)
    : escape(fallback);
}

export function quoteHtml(quote) {
  const items = Array.isArray(quote.items)
    ? quote.items
    : [];

  const total = quoteTotals(items);

  const companyName =
    String(quote.company_name || "").trim() ||
    "인테리어필름";

  const title =
    String(quote.title || "").trim() ||
    "인테리어필름 시공 견적서";

  const taxLabel =
    quote.vat === "separate"
      ? "부가세 별도 · 10%"
      : quote.vat === "included"
        ? "부가세 포함"
        : "";

  const amountLabel =
    quote.vat === "separate"
      ? "견적금액 · 부가세 별도"
      : quote.vat === "included"
        ? "견적금액 · 부가세 포함"
        : "견적금액";

  const rows = items.map((item, index) => {
    const priced =
      hasValue(item.unit_price) &&
      hasValue(item.quantity) &&
      Number.isFinite(Number(item.unit_price)) &&
      Number.isFinite(Number(item.quantity)) &&
      Number(item.unit_price) >= 0 &&
      Number(item.quantity) >= 0;

    const rowAmount = priced
      ? Math.round(
          Number(item.unit_price) *
          Number(item.quantity)
        )
      : null;

    const details = [
      hasValue(item.detail)
        ? `<div class="item-detail">${escape(item.detail)}</div>`
        : "",

      hasValue(item.film_no)
        ? `
          <div class="film-code">
            <span>FILM</span>
            ${escape(item.film_no)}
          </div>
        `
        : "",

      hasValue(item.note)
        ? `
          <div class="item-note">
            <span>비고</span>
            ${escape(item.note)}
          </div>
        `
        : "",
    ].join("");

    const unitPrice = hasValue(item.unit_price)
      ? money(item.unit_price)
      : "미입력";

    const quantity = hasValue(item.quantity)
      ? `${escape(item.quantity)}${
          hasValue(item.unit)
            ? ` <span class="unit">${escape(item.unit)}</span>`
            : ""
        }`
      : '<span class="pending">확인 필요</span>';

    return `
      <tr>
        <td class="row-number">
          ${String(index + 1).padStart(2, "0")}
        </td>

        <td class="description-cell">
          <div class="item-name">
            ${display(item.name, "시공 항목")}
          </div>
          ${details}
        </td>

        <td class="numeric">
          ${unitPrice}
        </td>

        <td class="quantity">
          ${quantity}
        </td>

        <td class="numeric row-amount">
          ${
            rowAmount === null
              ? '<span class="pending">미입력</span>'
              : money(rowAmount)
          }
        </td>
      </tr>
    `;
  }).join("");

  const customerNote = hasValue(quote.customer_note)
    ? `
      <div class="customer-note">
        <span class="small-label">고객 요청사항</span>
        <div>${escape(quote.customer_note)}</div>
      </div>
    `
    : "";

  const otherSchedule = hasValue(quote.other_schedule)
    ? `
      <section class="note-card">
        <div class="section-heading">
          <span class="section-number">03</span>
          <h2>타 공정 일정</h2>
        </div>

        <div class="note-content">
          ${escape(quote.other_schedule)}
        </div>
      </section>
    `
    : "";

  const footerNote = hasValue(quote.footer)
    ? `
      <section class="notice">
        <h2>안내사항 · 입금 정보</h2>
        <div>${escape(quote.footer)}</div>
      </section>
    `
    : "";

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>${escape(title)}</title>

  <style>
    :root {
      --ink: #23364a;
      --text: #293746;
      --muted: #687887;
      --line: #dce3e9;
      --soft: #f4f7fa;
      --accent: #a67b4d;
    }

    * {
      box-sizing: border-box;
    }

    html {
      background: #e9edf1;
    }

    body {
      margin: 0;
      color: var(--text);
      font-family:
        "Pretendard",
        "Apple SD Gothic Neo",
        "Noto Sans KR",
        "Malgun Gothic",
        Arial,
        sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    button {
      font: inherit;
    }

    .toolbar {
      width: min(100% - 32px, 900px);
      margin: 20px auto 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .toolbar p {
      margin: 0;
      color: #5c6874;
      font-size: 13px;
      line-height: 1.6;
    }

    .print-button {
      flex-shrink: 0;
      min-height: 44px;
      padding: 12px 20px;
      border: 0;
      border-radius: 10px;
      background: var(--ink);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }

    .page-wrap {
      padding: 0 16px 32px;
      overflow-x: auto;
    }

    .sheet {
      width: 900px;
      min-height: 1160px;
      margin: 0 auto;
      padding: 48px 48px 32px;
      background: #fff;
      border-top: 7px solid var(--ink);
      box-shadow: 0 12px 40px #20304012;
    }

    .document-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 265px;
      align-items: start;
      gap: 32px;
      padding-bottom: 30px;
      border-bottom: 2px solid var(--ink);
    }

    .eyebrow {
      margin: 0 0 14px;
      color: var(--accent);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2.3px;
    }

    h1 {
      margin: 0;
      color: var(--ink);
      font-size: 31px;
      font-weight: 800;
      line-height: 1.45;
      letter-spacing: -1.2px;
      overflow-wrap: anywhere;
    }

    .document-subtitle {
      margin-top: 12px;
      color: var(--muted);
      font-size: 12px;
      letter-spacing: .4px;
    }

    .supplier {
      padding-left: 20px;
      border-left: 1px solid var(--line);
    }

    .company-name {
      margin-bottom: 15px;
      color: var(--ink);
      font-size: 20px;
      font-weight: 800;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    .supplier-row {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 8px;
      margin-top: 8px;
      font-size: 12px;
      line-height: 1.6;
    }

    .supplier-label {
      color: var(--muted);
    }

    .supplier-value {
      overflow-wrap: anywhere;
    }

    .section-heading {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 15px;
    }

    .section-number {
      color: var(--accent);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .8px;
    }

    h2 {
      margin: 0;
      color: var(--ink);
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -.35px;
    }

    .customer-section {
      margin-top: 28px;
    }

    .customer-card {
      padding: 20px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
    }

    .customer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px 26px;
    }

    .field {
      min-width: 0;
    }

    .field.full {
      grid-column: 1 / -1;
    }

    .small-label {
      display: block;
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 500;
      line-height: 1.5;
    }

    .field-value {
      color: var(--text);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.7;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .customer-note {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      font-size: 12px;
      line-height: 1.8;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .items-section {
      margin-top: 28px;
    }

    .items-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .currency-label {
      padding-bottom: 15px;
      color: var(--muted);
      font-size: 10px;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border-top: 2px solid var(--ink);
      border-bottom: 1px solid var(--line);
    }

    .items-table thead {
      display: table-header-group;
    }

    .items-table th {
      padding: 12px 8px;
      border-bottom: 1px solid var(--line);
      background: var(--soft);
      color: var(--ink);
      text-align: center;
      font-size: 11px;
      font-weight: 700;
    }

    .items-table th.description-heading {
      text-align: left;
      padding-left: 12px;
    }

    .items-table td {
      padding: 17px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      color: var(--text);
      font-size: 12px;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }

    .items-table tr:last-child td {
      border-bottom: 0;
    }

    .items-table tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .items-table td.row-number {
      color: #8996a3;
      text-align: center;
      font-size: 11px;
      font-weight: 600;
    }

    .items-table td.description-cell {
      padding-left: 12px;
      padding-right: 16px;
    }

    .item-name {
      color: var(--ink);
      font-size: 14px;
      font-weight: 800;
      line-height: 1.6;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .item-detail {
      margin-top: 5px;
      color: #617080;
      font-size: 11px;
      line-height: 1.8;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .film-code {
      margin-top: 8px;
      color: var(--ink);
      font-size: 11px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .film-code span {
      display: inline-block;
      margin-right: 6px;
      padding: 1px 5px;
      border: 1px solid #d6dfe7;
      border-radius: 3px;
      color: #6b7d8e;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .5px;
    }

    .item-note {
      margin-top: 7px;
      color: #788491;
      font-size: 10px;
      line-height: 1.8;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .item-note span {
      margin-right: 5px;
      font-weight: 700;
    }

    .numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .quantity {
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .unit {
      color: var(--muted);
      font-size: 10px;
    }

    .row-amount {
      font-weight: 800;
    }

    .pending {
      color: #a57135;
      font-size: 10px;
      font-weight: 500;
    }

    .empty-row {
      text-align: center;
      color: var(--muted);
    }

    .amount-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 20px;
      margin-top: 20px;
      padding: 23px 24px;
      border: 1.5px solid var(--ink);
      border-radius: 10px;
      background: var(--soft);
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .amount-label {
      color: var(--ink);
      font-size: 14px;
      font-weight: 800;
      line-height: 1.6;
    }

    .amount-caption {
      margin-top: 5px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.7;
    }

    .amount-value {
      color: var(--ink);
      text-align: right;
      font-size: 31px;
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: -1px;
      font-variant-numeric: tabular-nums;
    }

    .amount-value .won {
      margin-left: 4px;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: 0;
    }

    .amount-value.incomplete {
      color: #a57135;
      font-size: 20px;
      letter-spacing: -.4px;
    }

    .note-card {
      margin-top: 25px;
    }

    .note-content {
      padding: 16px 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: #536272;
      font-size: 12px;
      line-height: 1.9;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .notice {
      margin-top: 25px;
      padding: 18px 20px;
      border-left: 3px solid #b2916d;
      background: #faf8f5;
    }

    .notice h2 {
      margin-bottom: 9px;
      font-size: 13px;
    }

    .notice div {
      color: #626a71;
      font-size: 12px;
      line-height: 1.9;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .document-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      color: #8a949e;
      font-size: 10px;
      line-height: 1.7;
    }

    .document-footer strong {
      color: #617080;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .document-footer .footer-caption {
      text-align: right;
      letter-spacing: 1px;
      font-size: 9px;
    }

    @page {
      size: A4 portrait;
      margin: 13mm;
    }

    @media screen and (max-width: 620px) {
      .toolbar {
        align-items: flex-start;
      }

      .toolbar p {
        font-size: 12px;
      }

      .print-button {
        padding: 11px 13px;
        font-size: 12px;
      }

      .page-wrap {
        padding: 0 12px 24px;
      }
    }

    @media print {
      html,
      body {
        background: #fff;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .toolbar {
        display: none !important;
      }

      .page-wrap {
        padding: 0;
        overflow: visible;
      }

      .sheet {
        width: 100%;
        min-height: 0;
        margin: 0;
        padding: 7mm 0 0;
        border-top: 1.4mm solid var(--ink);
        box-shadow: none;
      }

      .document-header {
        grid-template-columns: minmax(0, 1fr) 58mm;
        gap: 7mm;
        padding-bottom: 6mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .eyebrow {
        margin-bottom: 3mm;
        font-size: 8px;
      }

      h1 {
        font-size: 23px;
        line-height: 1.5;
        letter-spacing: -.8px;
      }

      .document-subtitle {
        margin-top: 2mm;
        font-size: 9px;
      }

      .supplier {
        padding-left: 4mm;
      }

      .company-name {
        margin-bottom: 3mm;
        font-size: 16px;
      }

      .supplier-row {
        grid-template-columns: 17mm minmax(0, 1fr);
        gap: 1.5mm;
        margin-top: 1.5mm;
        font-size: 9px;
      }

      .customer-section,
      .items-section {
        margin-top: 6mm;
      }

      .section-heading {
        margin-bottom: 3mm;
        break-after: avoid;
        page-break-after: avoid;
      }

      .section-number {
        font-size: 9px;
      }

      h2 {
        font-size: 13px;
      }

      .customer-card {
        padding: 4mm;
        border-radius: 2mm;
      }

      .customer-grid {
        gap: 3mm 6mm;
      }

      .small-label {
        margin-bottom: 1mm;
        font-size: 9px;
      }

      .field-value {
        font-size: 11px;
      }

      .customer-note {
        margin-top: 3mm;
        padding-top: 3mm;
        font-size: 10px;
      }

      .currency-label {
        padding-bottom: 3mm;
        font-size: 8px;
      }

      .items-table th {
        padding: 2.5mm 1.5mm;
        font-size: 9px;
      }

      .items-table td {
        padding: 3.5mm 1.5mm;
        font-size: 10px;
      }

      .items-table td.description-cell,
      .items-table th.description-heading {
        padding-left: 2mm;
      }

      .items-table td.description-cell {
        padding-right: 3mm;
      }

      .items-table td.row-number {
        font-size: 9px;
      }

      .item-name {
        font-size: 11px;
      }

      .item-detail,
      .film-code {
        font-size: 9px;
      }

      .item-note {
        font-size: 8px;
      }

      .unit,
      .pending {
        font-size: 8px;
      }

      .amount-card {
        margin-top: 4mm;
        padding: 4.5mm 5mm;
        gap: 4mm;
        border-radius: 2mm;
      }

      .amount-label {
        font-size: 11px;
      }

      .amount-caption {
        font-size: 9px;
      }

      .amount-value {
        font-size: 27px;
      }

      .amount-value .won {
        font-size: 14px;
      }

      .amount-value.incomplete {
        font-size: 16px;
      }

      .note-card,
      .notice {
        margin-top: 5mm;
      }

      .note-content,
      .notice {
        padding: 3.5mm 4mm;
      }

      .note-content,
      .notice div {
        font-size: 10px;
      }

      .notice h2 {
        font-size: 11px;
      }

      .document-footer {
        margin-top: 6mm;
        padding-top: 3mm;
        font-size: 9px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .document-footer .footer-caption {
        font-size: 8px;
      }
    }
  </style>
</head>

<body>
  <div class="toolbar">
    <p>
      현재 입력한 내용의 미리보기입니다.<br>
      변경한 내용은 앱에서 견적서 저장도 눌러주세요.
    </p>

    <button
      type="button"
      class="print-button"
      onclick="window.print()"
    >
      인쇄 / PDF 저장
    </button>
  </div>

  <div class="page-wrap">
    <main class="sheet">

      <header class="document-header">
        <div>
          <p class="eyebrow">INTERIOR FILM</p>

          <h1>${escape(title)}</h1>

          <div class="document-subtitle">
            시공 범위와 금액을 안내드립니다.
          </div>
        </div>

        <div class="supplier">
          <div class="company-name">
            ${escape(companyName)}
          </div>

          <div class="supplier-row">
            <span class="supplier-label">사업자번호</span>
            <span class="supplier-value">
              ${display(quote.business_number)}
            </span>
          </div>

          <div class="supplier-row">
            <span class="supplier-label">연락처</span>
            <span class="supplier-value">
              ${display(quote.company_phone)}
            </span>
          </div>
        </div>
      </header>

      <section class="customer-section">
        <div class="section-heading">
          <span class="section-number">01</span>
          <h2>고객 · 시공 정보</h2>
        </div>

        <div class="customer-card">
          <div class="customer-grid">

            <div class="field">
              <span class="small-label">고객명</span>
              <div class="field-value">
                ${display(quote.customer_name)}
              </div>
            </div>

            <div class="field">
              <span class="small-label">연락처</span>
              <div class="field-value">
                ${display(quote.customer_phone)}
              </div>
            </div>

            <div class="field full">
              <span class="small-label">시공 주소</span>
              <div class="field-value">${display(quote.address)}</div>
            </div>

            <div class="field">
              <span class="small-label">시공 예정일</span>
              <div class="field-value">${display(quote.work_date, "협의 후 확정")}</div>
            </div>

            <div class="field">
              <span class="small-label">공사기간</span>
              <div class="field-value">${display(quote.duration, "협의 후 확정")}</div>
            </div>

          </div>

          ${customerNote}
        </div>
      </section>

      <section class="items-section">
        <div class="items-heading">
          <div class="section-heading">
            <span class="section-number">02</span>
            <h2>시공 상세내역</h2>
          </div>

          <span class="currency-label">금액 단위 : 원</span>
        </div>

        <table class="items-table">
          <colgroup>
            <col style="width:6%">
            <col style="width:43%">
            <col style="width:17%">
            <col style="width:12%">
            <col style="width:22%">
          </colgroup>

          <thead>
            <tr>
              <th scope="col">NO.</th>
              <th scope="col" class="description-heading">
                시공 항목 · 상세내역
              </th>
              <th scope="col">단가</th>
              <th scope="col">수량</th>
              <th scope="col">금액</th>
            </tr>
          </thead>

          <tbody>
            ${
              rows ||
              `
                <tr>
                  <td colspan="5" class="empty-row">
                    시공 항목을 입력해주세요.
                  </td>
                </tr>
              `
            }
          </tbody>
        </table>

        <div class="amount-card">
          <div>
            <div class="amount-label">
              ${escape(amountLabel)}
            </div>

            <div class="amount-caption">
              ${
                total.complete
                  ? (
                      taxLabel
                        ? escape(taxLabel)
                        : "시공 항목별 금액 합계"
                    )
                  : "단가와 수량을 모두 입력하면 합계가 확정됩니다."
              }
            </div>
          </div>

          <div class="amount-value ${
            total.complete ? "" : "incomplete"
          }">
            ${
              total.complete
                ? `${money(total.amount)}<span class="won">원</span>`
                : "작성 중"
            }
          </div>
        </div>
      </section>

      ${otherSchedule}

      ${footerNote}

      <footer class="document-footer">
        <strong>${escape(companyName)}</strong>

        <span class="footer-caption">
          INTERIOR FILM · QUOTATION
        </span>
      </footer>

    </main>
  </div>
</body>
</html>`;
}
