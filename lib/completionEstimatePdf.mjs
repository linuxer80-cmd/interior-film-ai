import { completionTotals } from './completionEstimate.mjs';

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
  const W=1240,H=1754,M=64,R=W-M,bottom=1630;
  const brown='#795738', ink='#252421', muted='#66615b', paper='#fdfcf9', fill='#f0ece6';
  const pages=[]; let canvas,ctx,y;
  const header=draft.header||{};
  const money=value=>Number(value||0).toLocaleString('ko-KR');
  function font(size=24,bold=false){ctx.font=`${bold?600:400} ${size}px "Noto Sans KR", "Malgun Gothic", Arial, sans-serif`;}
  function text(value,x,top,size=24,bold=false,align='left',color=ink){
    font(size,bold);ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='top';ctx.fillText(String(value??''),x,top);ctx.textAlign='left';
  }
  function lines(value,width,size=24,bold=false){
    font(size,bold);const result=[];
    for(const para of String(value??'').split('\n')){let line='';for(const char of para){if(line&&ctx.measureText(line+char).width>width){result.push(line);line='';}line+=char;}result.push(line);}
    return result;
  }
  function rule(top,left=M,right=R,color='#d5cfc7'){ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(right,top);ctx.stroke();}
  function rect(left,top,width,height,color=fill){ctx.fillStyle=color;ctx.fillRect(left,top,width,height);}
  function page(){
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');
    if(!ctx)throw Error('이 브라우저에서는 PDF를 만들 수 없습니다. Chrome에서 다시 시도해주세요.');
    rect(0,0,W,H,paper);
    text('E S T I M A T E',M,68,23,false,'left',brown);
    text(pages.length?'견적서 · 계속':'견적서',M,119,62,true);
    y=215;
  }
  async function finish(){
    rule(1670);text(header.company_name||'견적서',M,1690,18,false,'left',muted);text(String(pages.length+1),R,1690,18,false,'right',muted);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
    if(!blob)throw Error('PDF 이미지 생성에 실패했습니다.');
    pages.push(new Uint8Array(await blob.arrayBuffer()));canvas.width=1;canvas.height=1;
  }
  async function room(height){if(y+height>bottom){await finish();page();return true;}return false;}
  async function paragraph(value,size=23){for(const line of lines(value,R-M,size)){await room(size+14);text(line,M,y,size);y+=size+14;}}
  page();
  // Supplier details use the actual saved company information, never sample branding.
  let supplierY=90;
  for(const [value,size,bold] of [[header.company_name,32,true],[header.representative?`대표  ${header.representative}`:'',23,false],[header.company_phone?`연락처  ${header.company_phone}`:'',21,false],[header.business_number?`사업자번호  ${header.business_number}`:'',21,false]]){
    if(!value)continue;
    for(const line of lines(value,480,size,bold)){if(supplierY+size>bottom){y=supplierY;await room(size+12);supplierY=y;}text(line,680,supplierY,size,bold);supplierY+=size+12;}
  }
  y=Math.max(y,supplierY+34);rule(y,M,R,brown);y+=30;
  const cells=[['고객명',header.customer_name],['작성일',header.issued_date],['현장명',header.site_name],['시공일',header.work_date]];
  for(let i=0;i<cells.length;i+=2){
    const rows=cells.slice(i,i+2).map(([label,value])=>({label,values:lines(value||'—',370,23)}));
    const count=Math.max(...rows.map(row=>row.values.length));
    for(let start=0;start<count;start+=12){
      const n=Math.min(12,count-start),height=n*32+24;await room(height+8);
      rows.forEach((row,index)=>{const x=M+index*570;rect(x,y,542,height);text(start?'':row.label,x+18,y+12,23,true);row.values.slice(start,start+n).forEach((line,j)=>text(line,x+154,y+12+j*32,23));});y+=height+8;
    }
  }
  if(header.address){y+=10;await paragraph(`현장주소   ${header.address}`,22);}
  y+=28;
  const cols=[M,M+70,M+478,M+665,M+858,R];
  function tableHead(){text('견적 내역',M,y,29,true);text(`단위: 원 · ${draft.vat==='included'?'VAT 포함':draft.vat==='separate'?'VAT 별도':'부가세 가산 없음'}`,R,y+5,19,false,'right',muted);y+=48;rule(y,M,R,brown);rect(M,y+1,R-M,54);['No.','품명','수량 / 단위','단가','금액'].forEach((label,i)=>text(label,i>2?cols[i+1]-16:cols[i]+14,y+16,22,true,i>2?'right':'left'));y+=55;}
  await room(150);tableHead();
  for(const [index,row] of draft.items.entries()){
    const values=[String(index+1),row.name,`${row.quantity} ${row.unit||''}`,row.unit_price==null?'—':money(row.unit_price),money(row.amount)];
    const wrapped=values.map((value,i)=>lines(value,cols[i+1]-cols[i]-28,23));
    const count=Math.max(...wrapped.map(value=>value.length));
    for(let start=0;start<count;){
      if(y+62>bottom){await finish();page();tableHead();}
      const n=Math.min(count-start,Math.max(1,Math.floor((bottom-y-26)/32)));
      wrapped.forEach((value,i)=>value.slice(start,start+n).forEach((line,j)=>text(line,i>2?cols[i+1]-14:cols[i]+14,y+16+j*32,23,false,i>2?'right':'left')));
      y+=n*32+26;rule(y);start+=n;
    }
  }
  const totals=completionTotals(draft.items,draft.vat);
  y+=35;await room(230);
  text('총 견적금액',M+12,y+15,27,true,'left',brown);
  text('공급가액',650,y+12,24);text(`${money(totals.supply)} 원`,R-16,y+12,26,false,'right');rule(y+55,635,R);
  text(draft.vat==='included'?'부가세 (포함)':draft.vat==='separate'?'부가세 (10%)':'부가세 (가산 없음)',650,y+75,23);text(`${money(totals.tax)} 원`,R-16,y+75,26,false,'right');
  rect(620,y+129,R-620,92);text('합계',642,y+159,28,true,'left',brown);
  let totalSize=42;while(totalSize>24){font(totalSize,true);if(ctx.measureText(`${money(totals.total)} 원`).width<395)break;totalSize--;}
  text(`${money(totals.total)} 원`,R-18,y+155,totalSize,true,'right',brown);y+=255;
  if(draft.note){await room(75);rule(y,M,R,brown);y+=20;await paragraph('안내사항',25);await paragraph(draft.note);y+=15;}
  if(header.bank_account){await room(60);await paragraph(`입금 계좌   ${header.bank_account}`,23);}
  await finish();return jpegPagesPdf(pages,W,H);
}
