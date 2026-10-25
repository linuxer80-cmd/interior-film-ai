// Resolve only this company’s registered customer-facing contact number.
export async function alimtalkCompany(db,company){
 if(String(company.phone||'').trim())return company;
 const result=await db.from('company_public_profiles').select('public_phone').eq('company_id',company.id).maybeSingle();
 if(result.error)throw result.error;
 return {...company,phone:String(result.data?.public_phone||'').trim()};
}
