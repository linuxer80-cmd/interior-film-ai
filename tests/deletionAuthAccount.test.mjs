import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteAuthAccount} from '../lib/deletionAuthAccount.mjs';
const id='00000000-0000-4000-8000-000000000001';
test('hard delete is independently verified',async()=>{let deleted=false;await deleteAuthAccount({deleteUser:async(u,soft)=>{assert.equal(u,id);assert.equal(soft,false);deleted=true;return {};},getUserById:async()=>{assert.equal(deleted,true);return {error:{code:'user_not_found'}};}},id);});
test('already deleted account supports retry',async()=>{await deleteAuthAccount({deleteUser:async()=>({error:{code:'user_not_found'}}),getUserById:async()=>({error:{code:'user_not_found'}})},id);});
test('network errors cannot be mistaken for absence',async()=>{await assert.rejects(deleteAuthAccount({deleteUser:async()=>({}),getUserById:async()=>({error:new Error('network failed')})},id),/network failed/);});
test('remaining account prevents success',async()=>{await assert.rejects(deleteAuthAccount({deleteUser:async()=>({}),getUserById:async()=>({data:{user:{id}}})},id),/not verified/);});
