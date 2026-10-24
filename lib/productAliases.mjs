export const productAliasKey=value=>String(value??"").toLowerCase().replace(/[\s·＆&_-]+/g,"");
export function normalizeProductAliases(value){
 if(!Array.isArray(value)||value.length>20)throw Error("별칭은 최대 20개입니다.");
 const seen=new Set();
 return value.map(v=>{
  if(typeof v!=="string")throw Error("별칭은 제품명으로 입력해주세요.");
  const alias=v.trim(),key=productAliasKey(alias);
  if(key.length<2||alias.length>60||/^[a-z]+[0-9]+[a-z0-9-]*$/.test(key))throw Error("별칭은 2~60자의 제품명으로 입력해주세요. 제품번호는 별칭으로 등록하지 않습니다.");
  return {alias,key};
 }).filter(({key})=>{if(seen.has(key))return false;seen.add(key);return true;}).map(({alias})=>alias);
}
