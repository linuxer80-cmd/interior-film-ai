export async function fetchEstimate(url, options={}, {fetchImpl=fetch, timeoutMs=30000}={}) {
  const controller=new AbortController();
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
    controller.abort();
    reject(new Error('응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'));
  },timeoutMs);});
  try {
    return await Promise.race([timeout,(async()=>{
      const response=await fetchImpl(url,{...options,signal:controller.signal});
      const body=await response.text();
      return {ok:response.ok,status:response.status,text:async()=>body};
    })()]);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.");
    throw error;
  } finally {clearTimeout(timer);}
}
