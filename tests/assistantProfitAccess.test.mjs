import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assistantProfitAccess } from '../lib/assistantProfitAccess.mjs';

test('accepts only the active verified owner of the selected company', () => {
  const company = '12345678-1234-1234-1234-123456789abc';
  const owner = {company_id:company,role:'owner',is_active:true};
  assert.equal(assistantProfitAccess(owner, company), true);
  assert.equal(assistantProfitAccess(owner, '12345678-1234-1234-1234-123456789abd'), false);
  assert.equal(assistantProfitAccess({...owner,role:'worker'}, company), false);
  assert.equal(assistantProfitAccess({...owner,is_active:false}, company), false);
  assert.equal(assistantProfitAccess(null, company), false);
  assert.equal(assistantProfitAccess(owner, ''), false);
});
