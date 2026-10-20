import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
async function click(clients,url='/worker/site/example'){
 const handlers={},opened=[];
 const self={location:{origin:'https://app.example'},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>clients,openWindow:async u=>opened.push(u)}};
 vm.runInNewContext(source,{self,URL});let pending;
 handlers.notificationclick({notification:{data:{url},close(){}},waitUntil(p){pending=p}});await pending;return opened;
}
test('detached app falls back to opening the notification destination',async()=>{
 const opened=await click([{url:'https://app.example/worker',focus:async()=>{throw Error('closed')},navigate:async()=>null}]);
 assert.deepEqual(opened,['https://app.example/worker/site/example']);
});
test('focus rejection still navigates and does not open duplicate windows',async()=>{
 let target;
 const client={url:'https://app.example/worker',focus:async()=>{throw Error('focus blocked')},navigate:async u=>{target=u;return client}};
 assert.deepEqual(await click([client]),[]);assert.equal(target,'https://app.example/worker/site/example');
});
test('foreign notification destination cannot open an external origin',async()=>{
 assert.deepEqual(await click([],'https://evil.example'),['https://app.example/']);
});
