import {marketingDb,marketingJson,marketingError,connectionRow,syncDaangn} from '../../../../lib/onlineSalesServer';
import {MARKETING_COMPANY_ID} from '../../../../lib/onlineSales.mjs';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request) {
  if(!process.env.CRON_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return marketingJson({error:'Unauthorized'},401);
  try {
    const db=marketingDb();
    const {data:company,error}=await db.from('companies').select('is_active').eq('id',MARKETING_COMPANY_ID).single();
    if(error)throw error;
    if(!company?.is_active)return marketingJson({skipped:true});
    if(!(await connectionRow(db)).api_key_ciphertext)return marketingJson({skipped:true});
    await syncDaangn(db);
    return marketingJson({ok:true});
  } catch(e) { return marketingError(e); }
}
