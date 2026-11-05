// Local HTTP smoke check. Uses dummy credentials and makes no authenticated DB calls.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const port = 3197;
const origin = `http://127.0.0.1:${port}`;
let output = '';
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: {...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-smoke-only', SUPABASE_SERVICE_ROLE_KEY: ''},
  stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
const exited = new Promise(resolve => child.once('exit', resolve));
try {
  let response;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (child.exitCode !== null) throw new Error(output);
    try { response = await fetch(`${origin}/account/delete`, {signal: AbortSignal.timeout(20000)}); break; }
    catch { await delay(500); }
  }
  assert.ok(response, 'Next server must respond');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('내 계정 삭제 요청'));
  assert.ok(html.includes('계정 및 데이터 삭제 요청'));
  console.log('PASS actual deletion page HTTP 200 and server-rendered content');
  for (const method of ['GET', 'POST']) {
    const res = await fetch(`${origin}/api/account/deletion`, {
      method, signal: AbortSignal.timeout(20000),
      ...(method === 'POST' ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify({confirmation: '계정 삭제 요청', userId: 'forged-subject', processRequest: true})} : {}),
    });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), {error: '로그인이 필요합니다.'});
    console.log(`PASS actual ${method} route rejects unauthenticated access and disables caching`);
  }
} finally {
  if (child.exitCode === null) {
    process.kill(-child.pid, 'SIGTERM');
    await Promise.race([exited, delay(5000)]);
    if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL');
  }
}
