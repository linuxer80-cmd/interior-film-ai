export function extraAmount(value, required = false) {
 if (value == null || String(value).trim() === '') {
  if (required) throw Object.assign(Error('금액을 입력해주세요.'), {status:400});
  return null;
 }
 if (!/^(0|[1-9]\d*)$/.test(String(value)) || Number(value)>1000000000)
  throw Object.assign(Error('금액은 0~10억원 사이의 원 단위로 입력해주세요.'),{status:400});
 return Number(value);
}
export function extraDescription(value) {
 if(typeof value!=='string'||!value.trim()||value.trim().length>3000)
  throw Object.assign(Error('추가 작업 내용을 1~3000자로 입력해주세요.'),{status:400});
 return value.trim();
}
export function imageType(bytes) {
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return ['image/jpeg','jpg'];
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return ['image/png','png'];
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return ['image/webp','webp'];
 throw Object.assign(Error('사진은 JPG·PNG·WEBP로 등록해주세요.'),{status:400});
}
