import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCategory, normalizeAnalysisClassification, applyEstimateTarget, isMatchingConstructionScope } from "../app/utils/categoryUtils.js";
test("elevator walls and doors retain distinct classifications", () => {
  for (const [target, label] of [["elevator_interior", "엘리베이터 내부 벽면"], ["elevator_door", "엘리베이터 출입문·문틀"]]) {
    assert.equal(normalizeCategory(label), target);
    const result = normalizeAnalysisClassification({target_type:target, category:"엘리베이터", sub_category:label, classification_confidence:"high", view_completeness:"full"});
    assert.equal(result.target_type, target);
    assert.equal(result.requires_confirmation, false);
    assert.equal(applyEstimateTarget({}, target).target_type, target);
    assert.equal(isMatchingConstructionScope(result, {target_type:"wall"}), false);
    assert.equal(isMatchingConstructionScope(result, {target_type:"door"}), false);
  }
  assert.equal(isMatchingConstructionScope({target_type:"elevator_interior"}, {target_type:"elevator_door"}), false);
});
test("generic walls stay walls and ambiguous elevator views require confirmation", () => {
  assert.equal(normalizeCategory("벽면"), "wall");
  assert.equal(normalizeAnalysisClassification({category:"엘리베이터", sub_category:"전체"}).requires_confirmation, true);
});
