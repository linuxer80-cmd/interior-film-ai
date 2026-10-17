const fields=['site_name','address','customer_name','customer_phone','work_description','price_text','price_message_id','price_status','vat','vat_evidence','warnings'];
export const chatQuoteSchema={type:'object',additionalProperties:false,properties:Object.fromEntries(fields.map(key=>[key,{type:'string'}])),required:fields};
const clean=(value,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
export function chatMoney(value){
 const text=String(value||'').replace(/[\s,]/g,'');
 const match=text.match(/^(\d+(?:\.\d+)?)(억|천만|백만|십만|만|천)?원?$/);
 if(!match)return '';
 const amount=Number(match[1])*({'억':1e8,'천만':1e7,'백만':1e6,'십만':1e5,'만':1e4,'천':1e3}[match[2]]||1);
 return Number.isSafeInteger(amount)&&amount>=0&&amount<=1e9?amount:'';
}
export function normalizeChatQuote(raw,messages){
 const result=Object.fromEntries(fields.map(key=>[key,clean(raw?.[key],key==='warnings'?1500:500)]));
 result.customer_name=result.customer_name||'미정';
 result.customer_phone=result.customer_phone||'미정';
 const source=messages.find(m=>m.id===result.price_message_id&&m.sender==='owner');
 const evidenced=source&&result.price_text&&source.body.includes(result.price_text);
 const amount=evidenced&&['quoted','agreed'].includes(result.price_status)?chatMoney(result.price_text):'';
 const vatSource=messages.some(m=>m.sender==='owner'&&result.vat_evidence&&m.body.includes(result.vat_evidence));
 result.vat=vatSource&&['included','separate'].includes(result.vat)?result.vat:'';
 return {...result,contract_amount:amount,warnings:[result.warnings,amount===''?'관리자가 제시한 확실한 총 견적금액을 찾지 못했습니다. 금액을 직접 확인해주세요.':'',!result.vat?'부가세 포함 여부를 확인해주세요.':''].filter(Boolean).join('\n')};
}
export function chatCompletionDraft(source,chat){
 return {...source,header:{...source.header,...Object.fromEntries(['site_name','customer_name','address'].filter(k=>chat[k]?.trim()).map(k=>[k,chat[k].trim()]))},
 items:[{category:'expense',name:chat.work_description?.trim()||'인테리어필름 시공',quantity:1,unit:'식',unit_price:chat.contract_amount,amount:chat.contract_amount}],
 vat:chat.vat,note:[source.note,'채팅 상담을 바탕으로 작성한 견적입니다. 시공 범위와 금액을 확인해주세요.'].filter(Boolean).join('\n'),useDefaultNote:false};
}
