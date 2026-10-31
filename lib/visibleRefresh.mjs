// Background tabs do no work; focus + visibility events share one refresh.
export function observeVisibleRefresh(refresh, {interval=300000, minInterval=30000, events=[], windowObject=window, documentObject=document, now=Date.now, setTimer=setTimeout, clearTimer=clearTimeout}={}) {
  let stopped=false, last=now(), timer=null, eventTimer=null, running=false, queued=false;
  const visible=()=>documentObject.visibilityState==='visible';
  async function run(force=false) {
    if(stopped||!visible())return;
    if(running){queued ||= force;return;}
    if(!force&&now()-last<minInterval)return;
    last=now();running=true;
    try {await refresh();} catch { /* The component owns its error UI. */ }
    finally {running=false;if(queued){queued=false;void run(true);}}
  }
  function schedule() {if(stopped||!interval)return;timer=setTimer(()=>{void run();schedule();},interval);}
  const resume=()=>{void run();};
  const changed=()=>{clearTimer(eventTimer);eventTimer=setTimer(()=>{void run(true);},200);};
  windowObject.addEventListener('focus',resume);
  documentObject.addEventListener('visibilitychange',resume);
  events.forEach(event=>windowObject.addEventListener(event,changed));
  schedule();
  return ()=>{stopped=true;clearTimer(timer);clearTimer(eventTimer);windowObject.removeEventListener('focus',resume);documentObject.removeEventListener('visibilitychange',resume);events.forEach(event=>windowObject.removeEventListener(event,changed));};
}
