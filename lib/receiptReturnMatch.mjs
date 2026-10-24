import {receiptMatchesProduct,resolveFilmType} from './hyundaiFilmCode.js';
export function matchesReceiptReturn(row,roll,purchase,dealerId){
 if(!dealerId||roll.status!=='available'||!purchase||purchase.dealer_id!==dealerId||!receiptMatchesProduct(row,roll))return false;
 const receipt=resolveFilmType(roll.brand,row.code,row.priceType),stock=resolveFilmType(roll.brand,roll.product_code,purchase.price_type);
 return !receipt.conflict&&!stock.conflict&&receipt.resolvedType!=='unknown'&&receipt.resolvedType===stock.resolvedType;
}
// Suggest a unique eligible roll with enough stock. Never allocate a partial quantity across multiple rolls.
export function suggestReceiptReturn(row,rolls,purchases,dealerId){
 if(row.action!=='supplier_return'||row.done||row.returnSelectionTouched||row.rollIds?.length)return row;
 const total=Number(row.totalM),byRoll=new Map((purchases||[]).map(p=>[p.roll_id,p]));
 if(!Number.isFinite(total)||total<=0)return row;
 const candidates=(rolls||[]).filter(r=>matchesReceiptReturn(row,r,byRoll.get(r.id),dealerId));
 // Multiple matching rolls require a deliberate selection even when only one length matches.
 if(candidates.length!==1||Number(candidates[0].remaining)+0.001<total)return row;
 return {...row,rollIds:[candidates[0].id],lengthM:String(total),rollCount:'1',returnAutoMatched:true};
}

export function allocateReceiptReturn(row,rolls){
 const amount=Number(row.totalM),total=rolls.reduce((sum,r)=>sum+Number(r.remaining),0);
 if(!Number.isFinite(amount)||amount<=0||amount>total+0.001)throw Error(`반납 길이는 선택한 창고 잔량 ${total}m 이하여야 합니다.`);
 if(rolls.length>1&&Math.abs(total-amount)>0.001)throw Error('부분 반납은 한 롤을 선택해주세요. 여러 롤의 반납량을 임의로 나누지 않습니다.');
 return rolls.map(roll=>({roll,returnLength:rolls.length===1?Math.min(amount,Number(roll.remaining)):Number(roll.remaining)}));
}
