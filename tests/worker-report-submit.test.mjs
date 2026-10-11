import test from "node:test";
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
      "../app/worker/site/[siteId]/WorkerWorkReport.js",
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
  failUploadOnce = false,
  failSaveOnce = false,
} = {}) {
  let cursor = 0;
  const slots = [];

  let uploads = 0;
  let submits = 0;
  let completed = 0;
  let mounted = false;

  const calls = [];
  const effects = [];

  const React = {
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

      if (path.includes("ToolIllustration")) {
        return () => null;
      }

      return {
        supabase: {
          auth: {
            getSession: async () => ({
              data: {
                session: {
                  access_token: "token",
                },
              },
            }),
          },
        },
      };
    },

    async fetch(url, options) {
      if (url.includes("site-work-report?")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            laborWorkers: [],
          }),
        };
      }

      const upload = url.endsWith("site-photos");

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
              },
      };
    },
  });

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
      node.type === "textarea" &&
      node.props.placeholder?.startsWith("예: 싱크대")
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

  files[0].props.onChange({
    target: {
      files: [{ name: "before.jpg" }],
    },
  });

  files[1].props.onChange({
    target: {
      files: [
        { name: "after1.jpg" },
        { name: "after2.jpg" },
      ],
    },
  });

  return {
    calls,
    render,
    submit: () =>
      render().props.onSubmit({
        preventDefault() {},
      }),
    completed: () => completed,
  };
}

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
