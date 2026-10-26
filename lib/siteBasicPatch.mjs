const textFields=['customer_name','customer_phone','site_name','address','address_detail','region','work_type','work_description','memo'];
const amountFields=['contract_amount','deposit_amount'];
export function siteBasicPatch(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>![...textFields,...amountFields].includes(key)))throw Error('기본정보 항목을 확인해주세요.');
 const patch={};
 for(const [key,entry] of Object.entries(value)){
  if(textFields.includes(key)){
   if(entry!==null&&(typeof entry!=='string'||entry.length>(['memo','work_description'].includes(key)?20000:1000)))throw Error('기본정보 입력 길이를 확인해주세요.');
   patch[key]=entry?.trim()||null;
  }else{
   if(entry!==null&&(typeof entry!=='number'||!Number.isFinite(entry)||entry<0||entry>1e12))throw Error('금액은 0 이상으로 입력해주세요.');
   patch[key]=entry;
  }
 }
 return patch;
}
