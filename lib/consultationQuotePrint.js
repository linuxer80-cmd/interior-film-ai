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

export function quoteHtml(quote) {
  const total = quoteTotals(quote.items);
  const money = (value) =>
    Number(value).toLocaleString("ko-KR");

  const rows = quote.items.map((item) => `
    <tr>
      <td>${escape(item.name)}</td>
      <td>${escape(item.detail)}</td>
      <td class="number">${
        item.unit_price === ""
          ? "미입력"
          : money(item.unit_price)
      }</td>
      <td>${escape(item.quantity)} ${escape(item.unit)}</td>
      <td>${escape(item.film_no)}</td>
      <td>${escape(item.note)}</td>
    </tr>
  `).join("");

  const tax =
    quote.vat === "separate"
      ? "부가세 별도 (10%)"
      : quote.vat === "included"
        ? "부가세 포함"
        : "";

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>${escape(quote.title)}</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, "Malgun Gothic", sans-serif;
      color: #111;
      background: #eee;
      margin: 0;
      padding: 20px;
    }

    .sheet {
      max-width: 900px;
      margin: auto;
      padding: 32px;
      background: white;
    }

    h1 {
      text-align: right;
      font-size: 25px;
      margin: 0 0 30px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      table-layout: fixed;
    }

    th,
    td {
      border: 1px solid #111;
      padding: 10px 8px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 14px;
    }

    th {
      font-weight: 500;
    }

    tr {
      break-inside: avoid;
    }

    thead {
      display: table-header-group;
    }

    .supplier {
      width: 58%;
      margin-left: auto;
      margin-bottom: 60px;
    }

    .supplier th {
      width: 30%;
    }

    .number {
      text-align: right;
    }

    .notes {
      border: 1px solid;
      padding: 12px;
      min-height: 95px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .draft {
      color: #b45309;
    }

    button {
      padding: 12px;
      margin: 0 8px 12px 0;
    }

    @page {
      size: A4;
      margin: 12mm;
    }

    @media print {
      body {
        padding: 0;
        background: white;
      }

      .sheet {
        padding: 0;
        max-width: none;
      }

      .toolbar {
        display: none;
      }

      h1 {
        font-size: 22px;
      }

      th,
      td {
        font-size: 11px;
        padding: 8px 5px;
      }

      .supplier {
        margin-bottom: 35px;
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="toolbar">
      <button onclick="window.print()">
        인쇄 / PDF 저장
      </button>
      <p>
        미리보기는 현재 입력값입니다.
        앱에서 견적서 저장도 눌러주세요.
      </p>
    </div>

    <h1>${escape(quote.title)}</h1>

    <table class="supplier">
      <tr>
        <th>사업자번호</th>
        <td>${escape(quote.business_number)}</td>
      </tr>
      <tr>
        <th>상호</th>
        <td>${escape(quote.company_name)}</td>
      </tr>
      <tr>
        <th>연락처</th>
        <td>${escape(quote.company_phone)}</td>
      </tr>
    </table>

    <table>
      <tr>
        <th>시공 일자</th>
        <td>${escape(quote.work_date)}</td>
        <th>공사기간</th>
        <td>${escape(quote.duration)}</td>
      </tr>
      <tr>
        <th>금액</th>
        <td
          colspan="3"
          class="number ${total.complete ? "" : "draft"}"
        >${
          total.complete
            ? `${money(total.amount)}원`
            : "미완성 · 단가 또는 수량 확인 필요"
        }</td>
      </tr>
      <tr>
        <th rowspan="4">고객사항</th>
        <th>성함</th>
        <td colspan="2">${escape(quote.customer_name)}</td>
      </tr>
      <tr>
        <th>연락처</th>
        <td colspan="2">${escape(quote.customer_phone)}</td>
      </tr>
      <tr>
        <th>주소</th>
        <td colspan="2">${escape(quote.address)}</td>
      </tr>
      <tr>
        <th>비고</th>
        <td colspan="2">${escape(quote.customer_note)}</td>
      </tr>
    </table>

    <table>
      <colgroup>
        <col style="width:20%">
        <col style="width:27%">
        <col style="width:16%">
        <col style="width:11%">
        <col style="width:13%">
        <col style="width:13%">
      </colgroup>
      <thead>
        <tr>
          <th>시공 항목</th>
          <th>상세내역</th>
          <th>단가</th>
          <th>수량</th>
          <th>film no.</th>
          <th>비고</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows ||
          '<tr><td colspan="6">시공 항목 확인 필요</td></tr>'
        }
      </tbody>
    </table>

    <table>
      <tr>
        <th style="width:25%">타 공정 일정</th>
        <td>${escape(quote.other_schedule)}</td>
      </tr>
    </table>

    <div class="notes">${escape(tax)}${
      tax ? "\n" : ""
    }${escape(quote.footer)}</div>
  </div>
</body>
</html>`;
}
