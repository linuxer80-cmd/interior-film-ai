import { pilotIdentity, pilotBuyer, pilotJson } from '../../../../lib/materialPilotServer';
export const runtime = 'nodejs';
export async function GET(request) {
  try {
    const {db,user}=await pilotIdentity(request);
    const companyId=await pilotBuyer(db,user.id);
    return pilotJson({allowed:!!companyId,companyId});
  } catch(error) {
    return pilotJson({allowed:false,error:error.status===401?'로그인해주세요.':'테스트 권한을 확인하지 못했습니다. 설정 SQL을 확인해주세요.'},error.status||503);
  }
}
