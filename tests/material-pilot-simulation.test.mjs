import test from 'node:test';
import assert from 'node:assert/strict';
import {canSimulateDealer,simulationRole} from '../lib/materialPilotSimulation.mjs';
import {transition} from '../lib/materialPilot.mjs';
const id='11111111-1111-4111-8111-111111111111';
const dealer={id,is_test:true,status:'active'};
const order={id,dealer_id:id,status:'assigned',items:[{quantity:10,total:110000}],shipping:{method:'parcel',workflow:{phase:'review'}},shipments:[],supply_prices:[6500]};
function db(row){return {from(table){assert.equal(table,'material_pilot_dealers');return {select(){return this;},eq(key,value){assert.equal(key,'id');assert.equal(value,id);return this;},async maybeSingle(){return {data:row};}};}};}
test('delegation requires super, exact assigned active test dealer; missing marker fails closed',()=>{
 assert.equal(canSimulateDealer('super',order,dealer),true);
 for(const role of ['buyer','dealer'])assert.equal(canSimulateDealer(role,order,dealer),false);
 for(const d of [null,{...dealer,is_test:false},{...dealer,is_test:undefined},{...dealer,status:'disabled'},{...dealer,id:'other'}]) assert.equal(canSimulateDealer('super',order,d),false);
});
test('server rejects forged delegation and never delegates payment, assignment or receipt',async()=>{
 for(const role of ['buyer','dealer'])await assert.rejects(simulationRole(db(dealer),{role},order,{simulateDealer:true,action:'accept'}),{status:403});
 for(const action of ['assign','test_pay','receive','cancel'])await assert.rejects(simulationRole(db(dealer),{role:'super'},order,{simulateDealer:true,action}),{status:403});
 await assert.rejects(simulationRole(db({...dealer,is_test:false}),{role:'super'},order,{simulateDealer:true,action:'ship'}),{status:403});
 assert.equal(await simulationRole(null,{role:'super'},order,{action:'accept'}),'super');
});
test('delegated flow keeps quantity and buyer-payment gates',async()=>{
 const role=await simulationRole(db(dealer),{role:'super'},order,{simulateDealer:true,action:'accept'});
 let next=transition(order,role,'accept',{});
 assert.equal(next.status,'preparing');
 assert.throws(()=>transition(next,role,'ship',{shipmentId:id,rolls:[{item:0,length:10}],tracking:'테스트'}));
 assert.throws(()=>transition(next,role,'ready',{quantities:[11]}));
 next=transition(next,role,'ready',{quantities:[10]});
 assert.equal(next.shipping.workflow.phase,'ready');
 assert.throws(()=>transition(next,role,'test_pay',{expectedTotal:110000}));
 next=transition(next,'buyer','test_pay',{expectedTotal:110000});
 assert.throws(()=>transition(next,role,'ship',{shipmentId:id,rolls:[{item:0,length:11}],tracking:'테스트'}));
 next=transition(next,role,'ship',{shipmentId:id,rolls:[{item:0,length:10}],tracking:'테스트 출고'});
 assert.equal(next.status,'shipped');
 assert.equal(order.status,'assigned');
});

test('API commits delegated action as real super actor and schedules the existing notification dispatcher',async()=>{
 const fs=await import('node:fs');
 const {createHash}=await import('node:crypto');
 const {visibleOrder,uuid}=await import('../lib/materialPilot.mjs');
 const route=fs.readFileSync(new URL('../app/api/material-pilot/route.js',import.meta.url),'utf8');
 let committed,scheduled=false;
 const server={from(table){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:table==='material_pilot_orders'?{...order,company_id:id,revision:0}:table==='material_pilot_companies'?{company_id:id}:table==='material_pilot_dealers'?dealer:null};}};},async rpc(name,args){assert.equal(name,'material_pilot_commit');committed=args;return {data:{...args.p_next,id,revision:1}};}};
 const actorId='22222222-2222-4222-8222-222222222222';
 const post=new Function('createHash','pilotIdentity','pilotRole','pilotJson','transition','visibleOrder','uuid','simulationRole','after','dispatchMaterialNotifications',route.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return POST;')(
 createHash,async()=>({db:server,user:{id:actorId}}),async()=>({role:'super'}),(body,status=200)=>Response.json(body,{status}),transition,visibleOrder,uuid,simulationRole,()=>{scheduled=true;},()=>{});
 const res=await post(new Request('https://example.test/api/material-pilot',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify({mode:'super',action:'accept',simulateDealer:true,orderId:id,requestId:actorId,revision:0})}));
 assert.equal(res.status,200);
 assert.equal(committed.p_actor,actorId);
 assert.equal(committed.p_action,'accept');
 assert.equal(committed.p_next.status,'preparing');
 assert.equal(scheduled,true);
});
