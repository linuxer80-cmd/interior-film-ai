export const ALIMTALK_UNIT_PRICE=30;
export const ALIMTALK_PACKAGES=[100,500,1000].map(quantity=>({quantity,amount:quantity*ALIMTALK_UNIT_PRICE}));
export function alimtalkChargeAmount(quantity){
 return Number.isInteger(quantity)&&quantity>0&&quantity<=1000000?quantity*ALIMTALK_UNIT_PRICE:null;
}
