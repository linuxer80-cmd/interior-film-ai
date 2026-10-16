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

import {registerAdminOverlay} from '../lib/adminOverlayHistory.mjs';
test('Back closes photo above site, then site, preserving administrator URL',()=>{
 const win=browser();const closed=[];
 const site=registerAdminOverlay(win,{priority:1001,onClose:()=>closed.push('site')});
 const photo=registerAdminOverlay(win,{priority:10000,onClose:()=>closed.push('photo')});
 win.history.back();assert.deepEqual(closed,['photo']);photo.dispose();
 assert.equal(new URL(win.location.href).pathname,'/admin');
 win.history.back();assert.deepEqual(closed,['photo','site']);site.dispose();
 assert.equal(new URL(win.location.href).pathname,'/admin');
});
test('busy top popup blocks Back without closing underlying site',()=>{
 const win=browser();const closed=[];let busy=true;
 const site=registerAdminOverlay(win,{onClose:()=>closed.push('site')});
 const invite=registerAdminOverlay(win,{priority:1300,canClose:()=>!busy,onClose:()=>closed.push('invite')});
 win.history.back();assert.deepEqual(closed,[]);
 busy=false;invite.close();assert.deepEqual(closed,['invite']);invite.dispose();
 win.history.back();assert.deepEqual(closed,['invite','site']);site.dispose();
});
test('highest visible overlay wins even when a lower layer registers later',()=>{
 const win=browser();const closed=[];
 const photo=registerAdminOverlay(win,{priority:10000,onClose:()=>closed.push('photo')});
 const more=registerAdminOverlay(win,{priority:900,onClose:()=>closed.push('more')});
 win.history.back();assert.deepEqual(closed,['photo']);photo.dispose();more.dispose();
});
