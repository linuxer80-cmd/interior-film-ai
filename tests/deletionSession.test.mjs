import test from 'node:test';
import assert from 'node:assert/strict';
import {clearDeletedAccountSession} from '../lib/accountDeletionSession.mjs';
test('clears only the confirmed subject local session',async()=>{
 const calls=[];const client={auth:{getSession:async()=>({data:{session:{user:{id:'deleted'}}}}),signOut:async opts=>{calls.push(opts);return {};}}};
 assert.equal(await clearDeletedAccountSession(client,'deleted'),true);assert.deepEqual(calls,[{scope:'local'}]);
});
test('account switch, absent session and auth read error never sign out another account',async()=>{
 for(const current of [{data:{session:{user:{id:'new-account'}}}},{data:{session:null}},{error:Error('read failed'),data:{session:{user:{id:'deleted'}}}}]){
 let signouts=0;const client={auth:{getSession:async()=>current,signOut:async()=>{signouts++;}}};
 assert.equal(await clearDeletedAccountSession(client,'deleted'),false);assert.equal(signouts,0);
 }
});
test('local storage/signout failure does not reject confirmed deletion completion',async()=>{
 for(const failure of [async()=>{throw Error('storage unavailable');},async()=>({error:Error('local failure')})]){
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'deleted'}}}}),signOut:failure}};
 assert.equal(await clearDeletedAccountSession(client,'deleted'),false);
 }
 assert.equal(await clearDeletedAccountSession(null,''),false);
});
