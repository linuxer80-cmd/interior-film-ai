// Compatibility endpoint: completion notices now use the customer result-page link.
import {GET as stageGET,POST as stagePOST} from '../customer-stages/route';
export const runtime='nodejs';export const maxDuration=60;
export async function GET(request){const url=new URL(request.url);url.searchParams.set('stage','complete');return stageGET(new Request(url,{headers:request.headers}));}
export async function POST(request){try{const body=await request.json();return stagePOST(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({...body,stage:'complete'})}));}catch{return Response.json({error:'발송 요청을 확인해주세요.'},{status:400});}}
