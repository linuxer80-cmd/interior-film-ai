import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../lib/superAdminLogin.js", import.meta.url), "utf8");
const { signInSuperAdmin, verifySuperAdmin } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
function client({ user = true, status = [{ is_super_admin: true }], authError = null, rpcError = null } = {}) {
  const calls = [];
  return { calls, auth: {
    async signInWithPassword(credentials) { calls.push(["signIn", credentials]); return { error: authError }; },
    async getUser() { calls.push(["getUser"]); return { data: { user: user ? { id: "u" } : null }, error: null }; },
    async signOut(options) { calls.push(["signOut", options]); return { error: null }; }
  }, async rpc(name) { calls.push([name]); return { data: status, error: rpcError }; } };
}
test("super admin login verifies authenticated user and database permission", async () => {
  const c = client();
  await signInSuperAdmin(c, " Admin@Example.com ", "sample");
  assert.deepEqual(c.calls.map(x => x[0]), ["signIn", "getUser", "get_super_admin_status"]);
  assert.equal(c.calls[0][1].email, "admin@example.com");
});
test("ordinary, missing and malformed permissions are denied and local session cleared", async () => {
  for (const status of [null, [], [{ is_super_admin: false }], { is_super_admin: "true" }]) {
    const c = client({ status });
    await assert.rejects(signInSuperAdmin(c, "a@b.c", "sample"), /권한이 없는/);
    assert.deepEqual(c.calls.at(-1), ["signOut", { scope: "local" }]);
  }
});
test("RPC errors fail closed", async () => {
  const c = client({ rpcError: new Error("offline") });
  await assert.rejects(signInSuperAdmin(c, "a@b.c", "sample"), /확인하지 못했습니다/);
  assert.equal(c.calls.at(-1)[0], "signOut");
});
test("bad password does not query permissions", async () => {
  const c = client({ authError: new Error("Invalid login credentials") });
  await assert.rejects(signInSuperAdmin(c, "a@b.c", "sample"), /올바르지/);
  assert.deepEqual(c.calls.map(x => x[0]), ["signIn"]);
});
test("existing admin session accepts object response; missing user never queries RPC", async () => {
  await verifySuperAdmin(client({ status: { is_super_admin: true } }));
  const c = client({ user: false });
  await assert.rejects(verifySuperAdmin(c), /로그인이 필요/);
  assert.deepEqual(c.calls.map(x => x[0]), ["getUser"]);
});
