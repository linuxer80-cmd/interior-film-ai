import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../app/api/super-admin/bulk-register/route.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
function handler(admin) {
  let clients = 0;
  const context = { Response, process: { env: {} }, console, createClient: () => {
    clients++;
    assert.equal(clients, 1, 'untrusted request must never create service-role client');
    return { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) }, rpc: async () => ({ data: { is_super_admin: admin } }) };
  }};
  vm.createContext(context); vm.runInContext(source + '\nglobalThis.post=POST;', context);
  return context.post;
}
test('bulk writes reject unauthenticated requests', async () => {
  const response = await handler(false)({ headers: new Headers() });
  assert.equal(response.status, 401);
});
test('ordinary owner cannot select another company through bulk endpoint', async () => {
  const response = await handler(false)({ headers: new Headers({ authorization: 'Bearer test' }) });
  assert.equal(response.status, 403);
});
test('super administrator must provide valid target company and case', async () => {
  const response = await handler(true)({ headers: new Headers({ authorization: 'Bearer test', 'content-type': 'application/json' }), json: async () => ({ company_id: 'wrong', case_id: 'wrong' }) });
  assert.equal(response.status, 400);
});
