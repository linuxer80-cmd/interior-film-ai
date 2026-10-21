import test from "node:test";
import * as workerWorkFlow from "../lib/workerWorkFlow.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const swc = require("next/dist/build/swc");

await swc.loadBindings();

const { code } = await swc.transform(
  fs.readFileSync(
    new URL(
      "../app/components/WorkReportForm.js",
      import.meta.url
    ),
    "utf8"
  ),
  {
    jsc: {
      parser: {
        syntax: "ecmascript",
        jsx: true,
      },
      transform: {
        react: {
          runtime: "classic",
        },
      },
    },
    module: {
      type: "commonjs",
    },
  }
);

function findAll(node, predicate) {
  if (!node || typeof node !== "object") {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap((child) =>
      findAll(child, predicate)
    );
  }

  return [
    ...(predicate(node) ? [node] : []),
    ...findAll(node.props?.children, predicate),
  ];
}

async function form({
  trackedMaterials = [],
  missingPrices = [],
  failUploadOnce = false,
  failSaveOnce = false,
  existingExpenses = [],
  statusWarning = "",
  afterPhotos = true,
} = {}) {
  let cursor = 0;
  const slots = [];

  let uploads = 0;
  let submits = 0;
  let completed = 0;
  let mounted = false;

  const calls = [];
  const payloads = [];
  const effects = [];

  let reportClient;
  const React = {
    useCallback: fn => fn,
    createElement(type, props, ...children) {
      const next = { ...props, children };

      return typeof type === "function"
        ? type(next)
        : { type, props: next };
    },

    useState(value) {
      const index = cursor++;

      if (!(index in slots)) {
        slots[index] = value;
      }

      return [
        slots[index],
        (next) => {
          slots[index] =
            typeof next === "function"
              ? next(slots[index])
              : next;
        },
      ];
    },

    useRef(value) {
      const index = cursor++;

      if (!(index in slots)) {
        slots[index] = { current: value };
      }

      return slots[index];
    },

    useEffect(effect) {
      if (!mounted) {
        effects.push(effect);
      }
    },

    useMemo(callback) {
      return callback();
    },
  };

  class FormData {
    fields = {};

    append(key, value) {
      this.fields[key] = value;
    }
  }

  const ctx = vm.createContext({
    exports: {},
    React,
    FormData,
    AbortController,
    setTimeout, clearTimeout,
    requestAnimationFrame: callback => callback(),
    crypto,
    window: {addEventListener(){},removeEventListener(){}},
    console: {
      error() {},
    },
    URL: {
      createObjectURL: (file) => file.name,
      revokeObjectURL() {},
    },

    require(path) {
      if (path === "react") {
        return React;
      }

      if (path.includes("reportClient")) return reportClient;
      if (path.includes("workerWorkFlow")) return workerWorkFlow;
      if (path.includes("SiteOperations") || path.includes("ToolIllustration")) {
        return () => null;
      }

      return {
        supabase: {
          auth: {
            onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}),
            getSession: async () => ({
              data: {
                session: {
                  access_token: "token",
                  user: {id: "user"},
                },
              },
            }),
          },
        },
      };
    },

    async fetch(url, options) {
      if (url.includes("site-expenses?")) return {ok:true,json:async()=>({success:true,expenses:existingExpenses})};
      if (url.includes("report-support?")) return {ok:true,json:async()=>({operations:{materials:trackedMaterials,locked:false},afterCount:0,missingPrices})};
      if (url.includes("site-work-report?")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            laborWorkers: [],
            canSubmit: true,
          }),
        };
      }

      const upload = url.endsWith("site-photos");
      if (!upload) payloads.push(JSON.parse(options.body));

      calls.push(
        upload
          ? `photo:${options.body.fields.photoType}:${options.body.fields.photos.name}`
          : "report"
      );

      const failed = upload
        ? ++uploads === 2 && failUploadOnce
        : ++submits === 1 && failSaveOnce;

      return {
        ok: !failed,
        json: async () =>
          failed
            ? {
                success: false,
                error: "저장 실패",
              }
            : {
                success: true,
                count: 1,
                ...(!upload && statusWarning ? {statusWarning} : {}),
              },
      };
    },
  });

  const helperSource = fs.readFileSync(new URL('../app/utils/reportClient.js', import.meta.url), 'utf8')
    .replace('import { supabase } from "../../lib/supabase";', 'const supabase = require("supabase").supabase;')
    .replaceAll('export ', '');
  vm.runInContext(helperSource + '\nglobalThis.reportHelpers = {reportRequest, uploadReportPhotos};', ctx);
  reportClient = {...ctx.reportHelpers, draftStore:async()=>null, compressReportPhoto:async file=>file};
  vm.runInContext(code, ctx);

  const render = () => {
    cursor = 0;

    return ctx.exports.default({
      siteId: "site",
      site: {},
      onSubmitted: () => {
        completed++;
      },
    });
  };

  let tree = render();

  mounted = true;

  effects.forEach((effect) => effect());

  await new Promise((resolve) =>
    setImmediate(resolve)
  );

  tree = render();

  const summary = findAll(
    tree,
    (node) =>
      node.type === "textarea" && node.props.rows === 4
  )[0];

  summary.props.onChange({
    target: {
      value: "작업 완료",
    },
  });

  const files = findAll(
    tree,
    (node) => node.props.type === "file"
  );

  await files[0].props.onChange({
    target: {
      files: [{ name: "before.jpg" }],
    },
  });

  render();
  if (afterPhotos) await findAll(render(), node => node.props.type === "file")[1].props.onChange({
    target: {
      files: [
        { name: "after1.jpg" },
        { name: "after2.jpg" },
      ],
    },
  });

  // Follow the new final-review step before submitting the report.
  const review = findAll(render(), node => node.type === "button" &&
    node.props.children?.includes("3. 확인·제출"))[0];
  assert.ok(review, "final review step is available");
  review.props.onClick();

  return {
    calls,
    payloads,
    render,
    submit: () =>
      render().props.onSubmit?.({
        preventDefault() {},
      }),
    completed: () => completed,
  };
}

test('content and photos share the first step and edits survive navigating to final review', async () => {
  const h = await form();
  const button = label => findAll(h.render(), node => node.type === 'button' && node.props.children?.includes(label))[0];
  button('1. 내용·사진').props.onClick();
  for (const target of ['content','photos']) assert.equal(findAll(h.render(),node=>node.props['data-section']===target)[0].props.hidden,false);
  findAll(h.render(),node=>node.type==='textarea' && node.props.rows===4)[0].props.onChange({target:{value:'수정한 시공 내용'}});
  button('2. 자재·경비').props.onClick();
  assert.equal(findAll(h.render(),node=>node.props['data-section']==='content')[0].props.hidden,true);
  button('3. 확인·제출').props.onClick();
  assert.match(JSON.stringify(h.render()),/수정한 시공 내용/);
  await h.submit();
  assert.equal(h.payloads[0].work_summary,'수정한 시공 내용');
  assert.equal(h.render().type,'section');
  assert.match(JSON.stringify(h.render()),/관리자 검수 대기/);
});

test('missing completed photos directs the user to the first step without posting a report', async () => {
  const h = await form({afterPhotos:false});
  await h.submit();
  assert.equal(h.calls.includes('report'),false);
  assert.equal(findAll(h.render(),node=>node.props['data-section']==='photos')[0].props.hidden,false);
  assert.match(JSON.stringify(h.render()),/완료사진 없음/);
});

test(
  "all before/after photos precede submission; rapid double tap submits once",
  async () => {
    const h = await form();

    await Promise.all([
      h.submit(),
      h.submit(),
    ]);

    assert.deepEqual(h.calls, [
      "photo:before:before.jpg",
      "photo:after:after1.jpg",
      "photo:after:after2.jpg",
      "report",
    ]);

    assert.equal(h.completed(), 1);
  }
);

test(
  "photo failure leaves report unsubmitted; retry skips files already uploaded",
  async () => {
    const h = await form({
      failUploadOnce: true,
    });

    await h.submit();

    assert.equal(
      h.calls.includes("report"),
      false
    );
    assert.equal(h.completed(), 0);

    await h.submit();

    assert.deepEqual(h.calls, [
      "photo:before:before.jpg",
      "photo:after:after1.jpg",
      "photo:after:after1.jpg",
      "photo:after:after2.jpg",
      "report",
    ]);

    assert.equal(h.completed(), 1);
  }
);

test(
  "cost/report failure can be retried without duplicating uploaded photos",
  async () => {
    const h = await form({
      failSaveOnce: true,
    });

    await h.submit();

    assert.equal(h.completed(), 0);

    await h.submit();

    assert.deepEqual(h.calls, [
      "photo:before:before.jpg",
      "photo:after:after1.jpg",
      "photo:after:after2.jpg",
      "report",
      "report",
    ]);

    assert.equal(h.completed(), 1);
  }
);

test("missing tracked cost warns but still submits photos and report; usage checks remain mandatory", async () => {
 const material = {id:"material",code:"W192",issued:10,returned:2,used:8,unitPrice:null};
 const h=await form({trackedMaterials:[material],missingPrices:["material"]});
 const text=JSON.stringify(h.render());
 assert.ok(text.includes("완료보고는 저장할 수 있습니다"));
 await h.submit();
 assert.equal(h.completed(),1);
 assert.equal(h.calls.filter(x=>x==="report").length,1);
 const blocked=await form({trackedMaterials:[{...material,returned:null}],missingPrices:["material"]});
 await blocked.submit();
 assert.equal(blocked.completed(),0);
 assert.equal(blocked.calls.includes("report"),false);
});

 test("existing expense ledger is shown without being copied into the report payload", async () => {
 const h = await form({existingExpenses:[{id:"existing",amount:9000,expense_type:"meal",expense_date:"2026-10-21",description:"기존 식비"}]});
 assert.match(JSON.stringify(h.render()), /9,000원/);
 await h.submit();
 assert.equal(h.completed(),1);
 assert.deepEqual(h.payloads[0].expenses,[]);
 assert.ok(!JSON.stringify(h.payloads[0]).includes("existing"));
});

 test("a saved report with a status warning still completes the flow and cannot be resubmitted", async () => {
 const h=await form({statusWarning:"현장 상태 갱신을 확인해주세요."});
 await h.submit();
 assert.equal(h.completed(),1);
 assert.match(JSON.stringify(h.render()),/현장 상태 갱신/);
 await h.submit();
 assert.equal(h.calls.filter(call=>call==="report").length,1);
});
