import {marketingDb,marketingJson,marketingError,connectionRow,syncDaangn} from '../../../../lib/onlineSalesServer';
import {syncNaver} from '../../../../lib/naverSalesServer';
import {MARKETING_COMPANY_ID} from '../../../../lib/onlineSales.mjs';
export const runtime='nodejs';
export const maxDuration=120;
export async function GET(request) {
  if(!process.env.CRON_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return marketingJson({error:'Unauthorized'},401);
  try {
    const db=marketingDb();
    const {data:company,error}=await db.from('companies').select('is_active').eq('id',MARKETING_COMPANY_ID).single();
    if(error)throw error;
    if(!company?.is_active)return marketingJson({skipped:true});
    const results={};
    for(const [platform,sync] of [['daangn',syncDaangn],['naver',syncNaver]]){
      try{
        if(!(await connectionRow(db,platform)).api_key_ciphertext){results[platform]='skipped';continue;}
        await sync(db);results[platform]='ok';
      }catch{results[platform]='failed';}
    }
    return marketingJson({results},Object.values(results).includes('failed')?502:200);
  } catch(e) { return marketingError(e); }
}
