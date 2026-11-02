import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mayAnalyzeSiteCall } from '../lib/siteCallAccess.mjs';

test('site call analysis is restricted to an active company owner', () => {
  const owner = {company_id:'company',role:'owner',is_active:true};
  assert.equal(mayAnalyzeSiteCall(owner), true);
  for (const profile of [null, {...owner,role:'worker'}, {...owner,role:'admin'}, {...owner,is_active:false}, {...owner,company_id:null}]) {
    assert.equal(mayAnalyzeSiteCall(profile), false);
  }
});
