function accountText(row){
 const bank=typeof row?.bank_name==='string'?row.bank_name.trim():'';
 const number=typeof row?.account_number==='string'?row.account_number.trim():'';
 const holder=typeof row?.account_holder==='string'?row.account_holder.trim():'';
 return bank&&holder&&/^[0-9 -]{3,50}$/.test(number)&&/\d/.test(number)?`${bank} ${number} (${holder})`:'';
}

// Server-side only. Call after authorizing the site's company/customer portal.
// Resolve the account owner from the company, never from a site's assigned crew.
export async function loadCompanyOwnerAccount(db,companyId){
 if(!companyId)return '';
 const owners=await db.from('profiles').select('id').eq('company_id',companyId).eq('role','owner').eq('is_active',true).limit(2);
 if(owners.error)throw owners.error;
 if(owners.data?.length!==1)return '';
 const ownerId=owners.data[0].id;
 const personal=await db.from('labor_personal_details').select('bank_name,account_number,account_holder').eq('user_id',ownerId).maybeSingle();
 if(personal.error)throw personal.error;
 // An explicitly cleared/incomplete personal account must not revive an old copy.
 if(personal.data)return accountText(personal.data);
 // Match the worker profile's legacy fallback, scoped to this company and owner.
 const workers=await db.from('workers').select('id').eq('company_id',companyId).eq('user_id',ownerId).eq('is_active',true).limit(2);
 if(workers.error)throw workers.error;
 if(workers.data?.length!==1)return '';
 const legacy=await db.from('worker_private_details').select('bank_name,account_number,account_holder').eq('company_id',companyId).eq('worker_id',workers.data[0].id).maybeSingle();
 if(legacy.error)throw legacy.error;
 return accountText(legacy.data);
}
