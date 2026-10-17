export function parseMeasurements(text) {
 const rows=[];const errors=[];
 text.split(/\r?\n/).forEach((line,index)=>{
  if(!line.trim())return;
  const match=line.trim().match(/^(\d+(?:\.\d+)?)\s*(?:[xX×*,\t]|\s)\s*(\d+(?:\.\d+)?)(?:\s*(?:[xX×*,\t]|\s)\s*(\d+))?\s*$/);
  if(!match){errors.push(`${index+1}번째 줄: 가로 × 세로 × 수량 형식으로 입력해주세요.`);return;}
  const width=Number(match[1]),height=Number(match[2]),quantity=Number(match[3]||1);
  if(width<1||height<1||width>100000||height>100000||quantity<1||quantity>1000){errors.push(`${index+1}번째 줄: 치수는 1~100,000mm, 수량은 1~1,000장입니다.`);return;}
  rows.push({width:String(width),height:String(height),quantity});
 });
 if(rows.length>300)errors.push('한 번에 300개 치수까지 등록할 수 있습니다.');
 return {rows,errors};
}
