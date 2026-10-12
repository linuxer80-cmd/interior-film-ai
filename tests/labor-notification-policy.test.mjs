import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canReceiveRecruitment,isRecruitmentNotice} from '../lib/laborNotificationPolicy.mjs';
test('employee unsolicited invitations muted; contract and application updates retained',async()=>{
 const db={rpc:async()=>({data:{relationships:[{relationship_type:'employee'}]}})};
 assert.equal(await canReceiveRecruitment(db,'u'),false);
 assert.equal(isRecruitmentNotice({title:'구인 제안'}),true);
 for(const title of ['구인이 확정되었습니다','새로운 시공자 지원','지원 만료']) assert.equal(isRecruitmentNotice({title}),false);
});
test('freelancer receives invitations; unknown relationship does not opt into recruiting',async()=>{
 assert.equal(await canReceiveRecruitment({rpc:async()=>({data:{relationships:[]}})},'u'),true);
 assert.equal(await canReceiveRecruitment({rpc:async()=>({error:{code:'PGRST202'}})},'u'),null);
 assert.equal(await canReceiveRecruitment({rpc:async()=>({data:{}})},'u'),null);
});
