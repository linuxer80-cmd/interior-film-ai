import test from 'node:test';
import assert from 'node:assert/strict';
import {guardAdminSiteHistory} from '../lib/adminSiteHistory.mjs';
function browser(){
 const entries=[{url:'https://app.example/worker',state:{}},{url:'https://app.example/admin?site=abc',state:{__NA:true}}];let index=1;const listeners=new Set();
 const win={location:{href:entries[index].url},addEventListener:(n,f)=>listeners.add(f),removeEventListener:(n,f)=>listeners.delete(f)};
 win.history={get state(){return entries[index].state;},replaceState(state,_,url){entries[index]={state,url:String(url)};win.location.href=String(url);},pushState(state,_,url){entries.splice(++index);entries.push({state,url:String(url)});win.location.href=String(url);},back(){index--;win.location.href=entries[index].url;for(const f of listeners)f();}};
 return win;
}
test('native Back closes site and stays on admin rather than previous worker page',()=>{
 const win=browser();let closed=0;const guard=guardAdminSiteHistory(win,{canClose:()=>true,onClose:()=>closed++});win.history.back();assert.equal(closed,1);assert.equal(new URL(win.location.href).pathname,'/admin');assert.equal(win.history.state.__NA,true);guard.dispose();
});
test('cancelled Back retains modal and supports a later confirmed close',()=>{
 const win=browser();let allow=false,closed=0;const guard=guardAdminSiteHistory(win,{canClose:()=>allow,onClose:()=>closed++});win.history.back();assert.equal(closed,0);assert.equal(new URL(win.location.href).pathname,'/admin');allow=true;guard.close();assert.equal(closed,1);guard.dispose();
});
