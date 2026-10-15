import { completionTotals, completionLabels, headerFields } from './completionEstimate.mjs';

// JPEG pages embedded in a standard PDF, with byte-accurate offsets. No remote script/font dependency.
export function jpegPagesPdf(pages, width = 1240, height = 1754) {
  const enc = new TextEncoder();
  const chunks = []; const offsets = [0]; let length = 0;
  const append = data => { const bytes = typeof data === 'string' ? enc.encode(data) : data; chunks.push(bytes); length += bytes.length; };
  const object = (id, body, stream) => {
    offsets[id] = length; append(`${id} 0 obj\n${body}`);
    if (stream) { append('\nstream\n'); append(stream); append('\nendstream'); }
    append('\nendobj\n');
  };
  append('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3+i*3} 0 R`).join(' ')}] >>`);
  pages.forEach((bytes, i) => {
    const id = 3 + i * 3;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
    object(id+1, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>`, bytes);
    const command = enc.encode('q 595.28 0 0 841.89 0 0 cm /Im Do Q');
    object(id+2, `<< /Length ${command.length} >>`, command);
  });
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

export async function completionPdf(draft) {
  await document.fonts?.ready;
  const W = 1240, H = 1754, M = 72, bottom = 1640;
  const pages = []; let canvas, ctx, y;
  const font = (size = 22, bold = false) => { ctx.font = `${bold ? 700 : 400} ${size}px "Noto Sans KR", "Malgun Gothic", sans-serif`; };
  const text = (value, x, lineY, size = 22, bold = false, align = 'left') => {
    font(size, bold); ctx.fillStyle = '#253949'; ctx.textAlign = align; ctx.fillText(String(value ?? ''), x, lineY); ctx.textAlign = 'left';
  };
  function wrap(value, maxWidth, size = 22) {
    font(size); const lines = [];
    for (const paragraph of String(value ?? '').split('\n')) {
      let line = '';
      for (const character of paragraph) {
        if (line && ctx.measureText(line + character).width > maxWidth) { lines.push(line); line = ''; }
        line += character;
      }
      lines.push(line);
    }
    return lines;
  }
  function newPage() {
    canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    if (!ctx) throw Error('이 브라우저에서는 PDF를 만들 수 없습니다. Chrome에서 다시 시도해주세요.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#203a35'; ctx.fillRect(M, 60, W - M*2, 8);
    text('업체 견적서', M, 124, 40, true);
    text(`${draft.header?.issued_date || ''}  ·  ${pages.length+1}`, W-M, 120, 20, false, 'right');
    y = 170;
  }
  async function finish() {
    text('필름장이 · 업체 견적서', M, H-55, 18);
    text(String(pages.length+1), W-M, H-55, 18, false, 'right');
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .94));
    if (!blob) throw Error('PDF 이미지 생성에 실패했습니다.');
    pages.push(new Uint8Array(await blob.arrayBuffer()));
    canvas.width = 1; canvas.height = 1;
  }
  async function room(height) { if (y+height > bottom) { await finish(); newPage(); } }
  async function paragraph(value, size = 22) {
    for (const line of wrap(value, W-M*2, size)) { await room(size+14); text(line, M, y, size); y += size+14; }
  }
  newPage();
  for (const [key, label] of Object.entries(headerFields)) {
    if (key === 'person_days') continue;
    if (draft.header?.[key]) await paragraph(`${label}   ${draft.header[key]}`);
  }
  y += 18;
  const money = number => Number(number || 0).toLocaleString('ko-KR');
  for (const [index, row] of draft.items.entries()) {
    await room(140);
    ctx.fillStyle = '#edf3f0'; ctx.fillRect(M, y-22, W-M*2, 38);
    text(`${String(index+1).padStart(2,'0')}  ${completionLabels[row.category] || '기타'}`, M+12, y+5, 21, true); y += 50;
    await paragraph(row.name, 24);
    const unitPrice = row.unit_price == null ? '직접 입력 금액' : `단가 ${money(row.unit_price)}원`;
    await paragraph(`수량 ${row.quantity} ${row.unit}   ·   ${unitPrice}   ·   금액 ${money(row.amount)}원`, 21);
    y += 14;
  }
  const totals = completionTotals(draft.items, draft.vat);
  await room(190); y += 20;
  await paragraph(`공급가액  ${money(totals.supply)}원`);
  await paragraph(`부가세  ${money(totals.tax)}원 (${draft.vat === 'separate' ? '별도 10%' : draft.vat === 'included' ? '포함' : '가산 없음'})`);
  text(`총 견적금액  ${money(totals.total)}원`, M, y+10, 34, true); y += 72;
  if (draft.note) { await paragraph('비고', 24); await paragraph(draft.note); }
  await finish();
  return jpegPagesPdf(pages, W, H);
}
