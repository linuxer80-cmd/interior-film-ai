// Expenses are already a project cost. These rows affect payouts only.
export async function workerReimbursements(db, companyId, month, workerIds, cutoff) {
  if (workerIds && !workerIds.length) return [];
  const [year, m] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year,m,1)).toISOString().slice(0,10);
  let query = db.from('site_expenses')
    .select('id,company_id,site_id,reimbursement_worker_id,amount,expense_date,description')
    .eq('company_id',companyId).not('reimbursement_worker_id','is',null)
    .gte('expense_date',`${month}-01`).lt('expense_date',end).order('id');
  if (workerIds) query=query.in('reimbursement_worker_id',workerIds);
  if (cutoff) query=query.lte('expense_date',cutoff);
  const result=[];
  for(let start=0;start<100000;start+=500){
    const {data,error}=await query.range(start,start+499);
    if(error) throw error;
    result.push(...data);
    if(data.length<500)return result;
  }
  throw Error('경비 내역이 너무 많습니다.');
}
