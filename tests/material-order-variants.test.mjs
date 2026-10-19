import { salesItem } from "../lib/materialPilot.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadOrderVariants,
  orderFlameLabel,
  saleOptions,
  selectSaleOption,
  orderVariantKey,
} from "../lib/materialOrderVariants.mjs";
const rows = [
  {
    id: "fire",
    brand: "현대",
    product_code: "S140",
    legacy_non_fire_code: "GS140",
    flame_type: "flame_retardant",
  },
  {
    id: "non",
    brand: "현대",
    product_code: "GS140",
    flame_type: "non_flame_retardant",
  },
  { id: "other", brand: "다른브랜드", product_code: "GS140" },
  { id: "off", brand: "현대", product_code: "S140", is_order_available: false },
  {
    id: "sold",
    brand: "현대",
    product_code: "S140",
    stock_status: "out_of_stock",
  },
  {
    id: "unpriced",
    brand: "현대",
    product_code: "S140",
    dealer_price_per_m: 0,
  },
].map((r) => ({
  is_active: true,
  is_order_available: true,
  stock_status: "in_stock",
  dealer_price_per_m: 13000,
  ...r,
}));
const db = {
  from() {
    let data = [...rows];
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        data = data.filter((r) => r[k] === v);
        return q;
      },
      in(k, v) {
        data = data.filter((r) => v.includes(r[k]));
        return q;
      },
      not(k, op, v) {
        data = data.filter((r) => r[k] != v);
        return q;
      },
      gt(k, v) {
        data = data.filter((r) => r[k] > v);
        return q;
      },
      maybeSingle() {
        return Promise.resolve({ data: data[0] || null });
      },
      then(resolve) {
        return Promise.resolve({ data }).then(resolve);
      },
    };
    return q;
  },
};
test("finds sale variants outside the list page, including non-fire alias", async () =>
  assert.deepEqual(
    (await loadOrderVariants(db, "fire")).map((r) => r.id),
    ["fire", "non"],
  ));
test("non-fire code resolves the matching base option without other brands or unavailable rows", async () =>
  assert.deepEqual(
    (await loadOrderVariants(db, "non")).map((r) => r.id),
    ["non", "fire"],
  ));
test("unavailable product does not become orderable", async () =>
  assert.deepEqual(await loadOrderVariants(db, "off"), []));
test("flame labels are Korean, unknown does not imply fire", () => {
  assert.equal(orderFlameLabel("flame_retardant"), "방염");
  assert.equal(orderFlameLabel("non_flame_retardant"), "비방염");
  assert.equal(orderFlameLabel(null), "방염 구분 미등록");
});

const younglim = {
  id: "px450",
  brand: "영림 인테리어필름",
  product_code: "PX450",
  flame_type: "non_flame_retardant",
  dealer_price_per_m: 6500,
  price_vat_included: false,
  is_active: true,
  is_order_available: true,
  stock_status: "in_stock",
};
const catalog = [
  {
    product_id: "px450",
    price_type: "fire",
    installer_price: 10500,
    vat_included: false,
  },
  {
    product_id: "px450",
    price_type: "non_fire",
    installer_price: 6500,
    vat_included: false,
  },
];
test("one Younglim catalog product exposes fire/non-fire with distinct VAT-exclusive installer prices and cart keys", () => {
  const options = saleOptions(younglim, catalog);
  assert.equal(options.length, 2);
  assert.equal(new Set(options.map(orderVariantKey)).size, 2);
  const fire = selectSaleOption(options, "px450", "fire", younglim.flame_type);
  const non = selectSaleOption(
    options,
    "px450",
    "non_fire",
    younglim.flame_type,
  );
  assert.equal(fire.dealer_price_per_m, 10500);
  assert.equal(non.dealer_price_per_m, 6500);
  assert.equal(fire.price_vat_included, false);
  assert.equal(non.price_vat_included, false);
  assert.equal(salesItem(fire, 40).total, 462000);
  assert.equal(salesItem(non, 40).total, 286000);
  assert.equal(younglim.flame_type, "non_flame_retardant");
});
test("non-fire-only products do not gain a fire option; absent and forged selections are rejected", () => {
  const options = saleOptions(
    younglim,
    catalog.filter((p) => p.price_type === "non_fire"),
  );
  assert.equal(options.length, 1);
  assert.throws(() =>
    selectSaleOption(options, "px450", "fire", younglim.flame_type),
  );
  assert.throws(() =>
    selectSaleOption(options, "px450", "invalid", younglim.flame_type),
  );
  assert.throws(() =>
    selectSaleOption(options, "another", "non_fire", younglim.flame_type),
  );
  assert.equal(
    selectSaleOption(options, "px450", undefined, younglim.flame_type)
      .dealer_price_per_m,
    6500,
  );
});
test("Younglim variant loading queries catalog prices and only exposes valid rows", async () => {
  const mock = {
    from(table) {
      let data =
        table === "film_products"
          ? [younglim]
          : [
              ...catalog,
              {
                product_id: "px450",
                price_type: "fire",
                installer_price: null,
                vat_included: false,
              },
            ];
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          data = data.filter((r) => r[k] === v);
          return q;
        },
        in(k, v) {
          data = data.filter((r) => v.includes(r[k]));
          return q;
        },
        not(k, o, v) {
          data = data.filter((r) => r[k] != v);
          return q;
        },
        gt(k, v) {
          data = data.filter((r) => r[k] > v);
          return q;
        },
        maybeSingle() {
          return Promise.resolve({ data: data[0] || null });
        },
        then(resolve) {
          return Promise.resolve({ data }).then(resolve);
        },
      };
      return q;
    },
  };
  const options = await loadOrderVariants(mock, "px450");
  assert.equal(options.length, 2);
  assert.deepEqual(
    options.map((p) => p.price_type),
    ["non_fire", "fire"],
  );
});
