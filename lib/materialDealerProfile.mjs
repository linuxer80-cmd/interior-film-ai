export function canonicalMaterialBrand(value) {
 const key=String(value||'').replace(/[^A-Za-z0-9가-힣]/g,'').toUpperCase();
 return ['영림','영림인테리어필름','YOUNGLIM'].includes(key)?'영림':key==='현대보닥'?'현대보닥':value;
}
export const materialBrandAliases = brand => brand==='영림'?['영림','영림 인테리어필름','영림인테리어필름','YOUNGLIM','Younglim']:['현대보닥'];
export const dealerFields = [
  ['name','대리점명',80], ['representative_name','대표자 이름',80],
  ['business_number','사업자등록번호',12], ['phone','대표 전화번호',25],
  ['postal_code','우편번호',5], ['address','사업장 주소',200],
  ['address_detail','상세주소',200], ['contact_name','출고 담당자',80],
  ['contact_phone','출고 담당자 전화번호',25], ['email','업무 이메일',200],
  ['business_type','업태',80], ['business_item','종목',80],
];
export function normalizeDealerProfile(input, {test=false}={}) {
  const result={};
  for(const [key,label,max] of dealerFields) {
    const value=String(input?.[key]??'').trim();
    if(value.length>max)throw Error(`${label}: ${max}자 이내로 입력해주세요.`);
    result[key]=value;
  }
  if(!result.name)throw Error('대리점명을 입력해주세요.');
  if(!test && ['representative_name','business_number','phone','address'].some(k=>!result[k]))throw Error('대표자·사업자등록번호·전화번호·주소를 입력해주세요.');
  const digits=result.business_number.replace(/-/g,'');
  if(digits && !/^\d{10}$/.test(digits))throw Error('사업자등록번호는 숫자 10자리로 입력해주세요.');
  if(digits) {
    const weights=[1,3,7,1,3,7,1,3,5];
    const sum=weights.reduce((n,w,i)=>n+Number(digits[i])*w,0)+Math.floor(Number(digits[8])*5/10);
    if((10-sum%10)%10!==Number(digits[9]))throw Error('사업자등록번호를 다시 확인해주세요.');
  }
  result.business_number=digits;
  for(const key of ['phone','contact_phone'])if(result[key]&&!/^[0-9+() -]{7,25}$/.test(result[key]))throw Error('전화번호를 확인해주세요.');
  if(result.postal_code&&!/^\d{5}$/.test(result.postal_code))throw Error('우편번호는 숫자 5자리입니다.');
  if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw Error('이메일을 확인해주세요.');
  const brands=input?.handled_brands??[];
  if(!Array.isArray(brands)||brands.some(b=>!['영림','현대보닥'].includes(b)))throw Error('취급 브랜드를 확인해주세요.');
  result.handled_brands=[...new Set(brands)];
  result.vat_included=false;
  return result;
}
export function orderSupplier(items, links) {
  const ids=new Set();
  let unlinked=false;
  for(const item of items) {
    const link=links.find(l=>canonicalMaterialBrand(l.brand)===canonicalMaterialBrand(item.brand));
    if(!link){unlinked=true;continue;}
    if(!link.enabled||!link.dealer_id||link.dealer?.status!=='active')throw Error(`${item.brand}: 출고 대리점 연결을 확인해주세요.`);
    ids.add(link.dealer_id);
  }
  if(ids.size>1)throw Error('출고 대리점이 다른 상품은 주문을 나눠주세요.');
  if(ids.size&&unlinked)throw Error('출고처가 지정된 상품과 미지정 상품은 주문을 나눠주세요.');
  return [...ids][0]||null;
}
