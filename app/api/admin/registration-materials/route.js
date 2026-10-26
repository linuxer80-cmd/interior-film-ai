import {privateAuth, privateJson as json} from '../../../../lib/workerPrivate';
import {preparePlannedMaterials} from '../../../../lib/preparePlannedMaterials.mjs';
export const runtime='nodejs';
export async function POST(request) {
  try {
    const auth=await privateAuth(request);
    if(auth.error)return json({error:auth.error},auth.status);
    let body;
    try {body=await request.json();} catch {return json({error:'입력 형식을 확인해주세요.'},400);}
    const materials=await preparePlannedMaterials(auth.db,auth.companyId,body?.materials);
    return json({materials});
  } catch(error) {
    if(error.status===400)return json({error:error.message},400);
    console.error('현장 등록 자재 확인 실패:',error.code || error.message);
    return json({error:'자재·매입단가를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 저장해주세요.'},500);
  }
}
