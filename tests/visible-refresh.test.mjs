import test from 'node:test';
import assert from 'node:assert/strict';
import {observeVisibleRefresh} from '../lib/visibleRefresh.mjs';
const flush=()=>new Promise(setImmediate);
function harness(refresh){
 const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';let time=0,id=0;const timers=new Map();
 const stop=observeVisibleRefresh(refresh,{windowObject:win,documentObject:doc,now:()=>time,interval:300000,minInterval:30000,events:['changed'],setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:id=>timers.delete(id)});
 return {win,doc,stop,timers,setTime:v=>time=v,tick(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());}};
}
test('hidden polling stops; focus and visibility returning together cause one request',async()=>{
 let calls=0;const h=harness(async()=>calls++);h.setTime(300000);h.doc.visibilityState='hidden';h.tick();await flush();assert.equal(calls,0);
 h.doc.visibilityState='visible';h.win.dispatchEvent(new Event('focus'));h.doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(calls,1);
 h.stop();assert.equal(h.timers.size,0);h.setTime(600000);h.win.dispatchEvent(new Event('focus'));assert.equal(calls,1);
});
test('change bursts debounce and a change during a pending request triggers one follow-up',async()=>{
 let calls=0,resolve;const pending=new Promise(r=>resolve=r);const h=harness(async()=>{if(++calls===1)await pending;});
 h.win.dispatchEvent(new Event('changed'));h.win.dispatchEvent(new Event('changed'));h.tick();assert.equal(calls,1);
 h.win.dispatchEvent(new Event('changed'));h.tick();assert.equal(calls,1);resolve();await flush();assert.equal(calls,2);h.stop();
});
