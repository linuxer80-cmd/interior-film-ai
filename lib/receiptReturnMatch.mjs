import {receiptMatchesProduct,resolveFilmType} from './hyundaiFilmCode.js';
export function matchesReceiptReturn(row,roll,purchase,dealerId){
 if(!dealerId||roll.status!=='available'||!purchase||purchase.dealer_id!==dealerId||!receiptMatchesProduct(row,roll))return false;
 const receipt=resolveFilmType(roll.brand,row.code,row.priceType),stock=resolveFilmType(roll.brand,roll.product_code,purchase.price_type);
 return !receipt.conflict&&!stock.conflict&&receipt.resolvedType!=='unknown'&&receipt.resolvedType===stock.resolvedType;
}
// Suggest only an exact full-roll return. Never allocate lengths across rolls or dealers.
export function suggestReceiptReturn(row,rolls,purchases,dealerId){
 if(row.action!=='supplier_return'||row.done||row.returnSelectionTouched||row.rollIds?.length)return row;
 const total=Number(row.totalM),byRoll=new Map((purchases||[]).map(p=>[p.roll_id,p]));
 if(!Number.isFinite(total)||total<=0)return row;
 const candidates=(rolls||[]).filter(r=>matchesReceiptReturn(row,r,byRoll.get(r.id),dealerId));
 // Multiple matching rolls require a deliberate selection even when only one length matches.
 if(candidates.length!==1||Math.abs(Number(candidates[0].remaining)-total)>0.001)return row;
 return {...row,rollIds:[candidates[0].id],lengthM:String(total),rollCount:'1',returnAutoMatched:true};
}
