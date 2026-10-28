import {customerStageState,customerPhotoRows,customerTradeAmounts} from './customerStages.mjs';
import {workDates} from './siteAlimtalk.mjs';
import {koreanToday} from './aiScheduleDate.mjs';
import {loadCompanyOwnerAccount} from './companyOwnerAccount.mjs';
export async function loadCustomerStage(db,companyId,siteId){
 const [s,r,b]=await Promise.all([
 db.from('sites').select('status,contract_amount,work_dates,schedule_date,schedule_start,schedule_end').eq('company_id',companyId).eq('id',siteId).single(),
 db.from('work_reports').select('review_status,reviewed_at').eq('company_id',companyId).eq('site_id',siteId),
 db.from('site_receivable_balances').select('confirmed,paid,amount_source,supply_amount,contract_amount,legacy_payment_complete').eq('company_id',companyId).eq('id',siteId).maybeSingle()]);
 if(s.error||r.error||b.error)throw s.error||r.error||b.error;
 const state=customerStageState({...s.data,work_dates:workDates(s.data)},r.data||[],b.data,koreanToday());
 if(!state.complete)return {...state,amount:null,vatAmount:null,totalAmount:null,paid:null,outstanding:null,bankAccount:'',before:[],after:[]};
 const cutoff=r.data.map(x=>x.reviewed_at).sort().at(-1);
 const [photos,bankAccount,trade]=await Promise.all([
 db.from('site_photos').select('photo_type,storage_path,created_at').eq('company_id',companyId).eq('site_id',siteId).in('photo_type',['before','after']).lte('created_at',cutoff).order('created_at').limit(80),
 loadCompanyOwnerAccount(db,companyId),
 db.rpc('customer_trade_receivables',{p_company:companyId,p_site:siteId})]);
 if(photos.error||trade.error)throw photos.error||trade.error;
 const rows=customerPhotoRows(photos.data||[],companyId,siteId,cutoff);
 const paths=[...new Set(rows.map(p=>p.storage_path))];const signed=new Map();
 if(paths.length){const urls=await db.storage.from('work-photos').createSignedUrls(paths,1800);if(urls.error)throw urls.error;for(const p of urls.data||[])if(p.signedUrl)signed.set(p.path,p.signedUrl);}
 return {...state,bankAccount,tradeReceivables:trade.data?{...trade.data,amounts:customerTradeAmounts(state,trade.data)}:null,before:rows.filter(p=>p.photo_type==='before').map(p=>signed.get(p.storage_path)).filter(Boolean),after:rows.filter(p=>p.photo_type==='after').map(p=>signed.get(p.storage_path)).filter(Boolean)};
}
