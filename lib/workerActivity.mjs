// Optional achievement recording must never break the underlying tool.
export async function recordWorkerActivity(db,userId,feature){
 try{
  const {error}=await db.rpc('record_worker_activity_day',{p_actor:userId,p_feature:feature});
  if(error){console.warn('시공자 사용 배지 기록 실패',error.code||'database');return false;}
  return true;
 }catch{console.warn('시공자 사용 배지 기록 지연');return false;}
}
