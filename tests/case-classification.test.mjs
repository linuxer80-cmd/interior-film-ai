import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProfile, mergeProfiles, profileMatch, profileSchema, PROFILE_FIELDS } from "../lib/caseClassification.mjs";
test("unknown or malformed classifications never become normal", () => {
  for (const input of [undefined, null, {}, {damage:"없는 값"}])
    assert.equal(normalizeProfile(input).damage, "확인 필요");
});
test("known space, structure, grooves and damage conflicts reject price candidates", () => {
  for (const [key, values] of Object.entries(PROFILE_FIELDS)) {
    assert.equal(profileMatch({[key]:values[1]}, {[key]:values[2]}).compatible, false, key);
    assert.equal(profileMatch({[key]:values[1]}, {}).compatible, true, key);
  }
});
test("multiple photos retain agreement but never hide conflicting damage as normal", () => {
  const profile = mergeProfiles([{part:"방문",damage:"정상 확인"}, {part:"방문",damage:"구멍"}]);
  assert.equal(profile.part,"방문");
  assert.equal(profile.damage,"확인 필요");
});
test("AI schema and saved profile share exactly the same fields", () => {
  assert.deepEqual(profileSchema.required,Object.keys(normalizeProfile({})));
  assert.equal(profileSchema.additionalProperties,false);
});
