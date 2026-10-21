import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const swc = require("next/dist/build/swc");
await swc.loadBindings();
const { code } = await swc.transform(fs.readFileSync(new URL("../app/worker/site/[siteId]/WorkerSiteInfo.js", import.meta.url), "utf8"), { jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, Date, Intl, Set, Number, String, navigator: {}, require: name => name.endsWith(".css") ? { __esModule: true, default: new Proxy({}, {get:(_, key)=>key}) } : name.includes("SiteDirections") || name.includes("WorkerTeam") ? { __esModule: true, default: () => null } : require(name) });
const Info = module.exports.default;
const render = props => renderToStaticMarkup(React.createElement(Info, {siteId:"site",active:true,...props}));
test("worker information shows full descriptions, memo, personal dates and film specifications", () => {
 const html=render({site:{customer_name:"테스트 고객",assigned_dates:[{work_date:"2026-10-21",role:"leader"},{work_date:"2026-10-23",role:"member"}],work_type:"파티션",work_description:"전체 작업 범위\n측면 포함",memo:"출입 전 연락"}, materials:[{material_id:"m",brand:"영림",product_code:"PW803",price_type:"fire",quantity:15,unit:"m"}]});
 for(const value of ["위치·연락처","시공 일정·작업자","전체 작업 범위","측면 포함","출입 전 연락","PW803","방염","15m","책임 팀장","팀원"])assert.ok(html.includes(value), value);
 assert.ok(!html.includes("자재 반출하기"));
});
test("missing dates and quantities are explicit instead of guessed as today or zero", () => {
 const html=render({site:{},materials:[{material_id:"m",product_code:"PW803",quantity:0}]});
 assert.ok(html.includes("미정")); assert.ok(html.includes("상세 시공 내용 미등록")); assert.ok(!html.includes("0m")); assert.ok(!html.includes('href="tel:'));
});
test("customer call link removes non-phone characters and backend errors remain visible", () => {
 const html=render({site:{customer_phone:"010-1234-5678"},materialsMessage:"자재 조회 실패"});
 assert.ok(html.includes('href="tel:01012345678"')); assert.ok(html.includes('role="alert"')); assert.ok(html.includes("자재 조회 실패"));
});
