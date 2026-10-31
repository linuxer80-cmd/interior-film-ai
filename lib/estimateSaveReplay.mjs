export function validEstimateRequestId(value) {
  return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export async function findSavedEstimate(supabase,{requestId,companyId,sessionId}) {
  if(!requestId)return null;
  const {data,error}=await supabase.from('estimate_usage').select('id')
    .eq('id',requestId).eq('company_id',companyId).eq('session_id',String(sessionId)).maybeSingle();
  if(error)throw error;
  return data ? {success:true,usage_id:data.id,reused:true} : null;
}
