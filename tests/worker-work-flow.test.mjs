import test from 'node:test';
import assert from 'node:assert/strict';
import { reportOverview, firstReportStep, workerWorkActions } from '../lib/workerWorkFlow.mjs';
const base = () => ({site:{status:'in_progress'},operations:{materials:[]},canSubmit:true,today:'2026-10-21'});

test('existing photos and confirmed material usage go straight to final review', () => {
  const context={afterCount:2,operations:{materials:[{returned:0,issued:10,used:10}]}};
  assert.equal(firstReportStep(context,{work_summary:'완료',photos:[]}),2);
  assert.equal(firstReportStep({...context,afterCount:0},{work_summary:'완료',photos:[]}),0);
  assert.equal(firstReportStep({...context,afterCount:0},{work_summary:'완료',photos:[{type:'after'}]}),2);
  assert.equal(firstReportStep(context,{work_summary:'',photos:[]}),1);
  context.operations.materials[0].returned=null;
  assert.equal(firstReportStep(context,{work_summary:'완료',photos:[]}),1);
});
test('uploaded photos are not counted again as new; existing expenses remain separate', () => {
  const expenses=[{id:'saved',amount:10000}];
  const form={photos:[{type:'after',uploaded:true},{type:'after',uploaded:false}],expenses:[{amount:5000}]};
  const summary=reportOverview({afterCount:3,operations:{materials:[{id:'m',returned:0}]}},form,expenses);
  assert.equal(summary.savedAfter,3);assert.equal(summary.newAfter,1);assert.equal(summary.uploadedPhotos,1);
  assert.equal(summary.existingExpenseTotal,10000);assert.equal(summary.unchecked.length,0);
  assert.deepEqual(form.expenses,[{amount:5000}]);
  assert.equal(reportOverview({},form,null).existingExpenseTotal,null);
});
test('preparation and returns are based on actual records, never price entry', () => {
  const value=base();value.operations.materials=[{issued:0,returned:null},{issued:10,returned:null,unitPrice:null}];
  assert.deepEqual(workerWorkActions(value).map(a=>a.id),['issue','return','report']);
  value.operations.materials=[{issued:10,returned:0,unitPrice:null}];
  assert.deepEqual(workerWorkActions(value).map(a=>a.id),['report']);
});
test('non-leaders get their own expense and handoff instructions instead of a blocked report button', () => {
  const value={...base(),canSubmit:false,operations:{canReturn:false,materials:[{issued:10,returned:null}]}};
  const actions=workerWorkActions(value);
  assert.deepEqual(actions.map(a=>a.id),['return','expenses']);assert.match(actions[0].text,/팀장/);
});
test('submitted, approved and rejected reports replace preparation tasks; cancelled work has none', () => {
  for(const status of ['pending','approved']) assert.deepEqual(workerWorkActions({...base(),report:{review_status:status}}).map(a=>a.id),['submitted']);
  const result=workerWorkActions({...base(),report:{review_status:'rejected',review_memo:'사진 보완'}});
  assert.deepEqual(result.map(a=>a.id),['revision']);assert.equal(result[0].text,'사진 보완');
  assert.deepEqual(workerWorkActions({...base(),site:{status:'cancelled'}}),[]);
  assert.deepEqual(workerWorkActions({...base(),operations:{locked:true}}).map(a=>a.id),['refresh']);
});
test('future assignments show preparation instead of premature completion, and invalid dates do not crash', () => {
  assert.deepEqual(workerWorkActions({...base(),site:{status:'scheduled',assigned_dates:[{work_date:'2026-10-23'}]}}).map(a=>a.id),['prepare']);
  assert.doesNotThrow(()=>workerWorkActions({...base(),site:{status:'scheduled',schedule_start:'invalid'}}));
});
