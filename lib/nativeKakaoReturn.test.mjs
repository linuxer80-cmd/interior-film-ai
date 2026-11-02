import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeKakaoReturn } from "./nativeKakaoReturn.mjs";
test("only valid native state can form a fixed application return URL", () => {
  assert.equal(nativeKakaoReturn(new URLSearchParams("code=test")), null);
  assert.equal(nativeKakaoReturn(new URLSearchParams("assistant_state=https://evil.example")), null);
  const p = new URLSearchParams({assistant_state:"a".repeat(43),code:"a-valid-code",redirect:"https://evil.example",access_token:"never-copy"});
  const target = new URL(nativeKakaoReturn(p));
  assert.equal(target.protocol,"filmjang-assistant:");
  assert.equal(target.host,"auth");assert.equal(target.pathname,"/kakao");
  assert.deepEqual([...target.searchParams.keys()],["state","code"]);
});
test("cancelled, missing or invalid codes return an error, never tokens", () => {
  for (const extra of [{error:"access_denied",code:"fake"},{},{code:"javascript:bad"}]) {
    const target = new URL(nativeKakaoReturn(new URLSearchParams({assistant_state:"b".repeat(43),...extra})));
    assert.equal(target.searchParams.get("error"),"authentication_failed");
    assert.equal(target.searchParams.has("code"),false);
  }
});
