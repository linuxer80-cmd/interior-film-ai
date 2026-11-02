import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantRegistrationMode } from './assistantRegistration.mjs';
test('only explicit registration deep links open the modal', () => {
  assert.equal(assistantRegistrationMode(new URLSearchParams('tab=sites')), null);
  assert.equal(assistantRegistrationMode(new URLSearchParams('assistantRegister=0')), null);
});
test('all supported input methods are preserved; invalid modes fall back to direct', () => {
  for (const mode of ['direct','text','screenshot','call']) assert.equal(assistantRegistrationMode(new URLSearchParams({assistantRegister:'1',inputMode:mode})),mode);
  assert.equal(assistantRegistrationMode(new URLSearchParams('assistantRegister=1&inputMode=unknown')),'direct');
});
