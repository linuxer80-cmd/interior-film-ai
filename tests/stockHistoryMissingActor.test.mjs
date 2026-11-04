import test from 'node:test';
import assert from 'node:assert/strict';
import {stockHistoryRows} from '../lib/stockHistory.mjs';

test('a missing actor leaves the stock movement and amount intact', () => {
  const rows=stockHistoryRows({
    events:[], issues:[{id:'issue1', material_id:'m1',site_id:'s1',created_by:null,quantity:15,created_at:'2026-11-01T00:00:00Z'}],
    returns:[],trips:[],rolls:[],materials:[],sites:[],profiles:[],workers:[],
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].actor,'삭제되었거나 확인할 수 없는 사용자');
  assert.equal(rows[0].quantity,15);
});
