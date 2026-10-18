import test from "node:test";
import assert from "node:assert/strict";
import {doorCaseType} from "../lib/doorCaseType.mjs";
test("door maintenance lists distinguish explicit kinds and unknown legacy titles",()=>{
 for(const kind of ["방문","방화문","중문","현관문"])assert.equal(doorCaseType({category:kind}),kind);
 assert.equal(doorCaseType({category:"문,문틀"}),"종류 확인 필요");
 assert.equal(doorCaseType({category:"문·문틀",sub_category:"경첩이 있는 방문"}),"방문");
 assert.equal(doorCaseType({category:"붙박이장",sub_category:"붙박이장 도어"}),"가구문");
 assert.equal(doorCaseType({category:"문틀",case_profile:{door_kind:"중문"}}),"중문");
 assert.equal(doorCaseType({category:"방화문",case_profile:{door_kind:"방문"}}),"방화문");
});
