import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export const imageHash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function signDraft(value,key,now=Date.now()){
 if(!key)throw new Error('Missing signing key');
 const payload=Buffer.from(JSON.stringify({...value,expires:now+3600000})).toString('base64url');
 return payload+'.'+createHmac('sha256',key).update(payload).digest('hex');
}
export function readDraft(token,key,now=Date.now()){
 const error=()=>Object.assign(new Error('분석 정보가 만료되었거나 올바르지 않습니다. 사진을 다시 분석해주세요.'),{status:400});
 if(!key||token.length>12000)throw error();
 const [payload,sig,...rest]=token.split('.');
 if(rest.length||!payload||!/^[a-f0-9]{64}$/.test(sig||''))throw error();
 const expected=createHmac('sha256',key).update(payload).digest();
 if(!timingSafeEqual(expected,Buffer.from(sig,'hex')))throw error();
 let value;try{value=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw error();}
 if(!Number.isFinite(value.expires)||value.expires<now)throw error();return value;
}
