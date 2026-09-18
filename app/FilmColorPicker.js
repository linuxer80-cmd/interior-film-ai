"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";

const PAGE_SIZE = 6;

const TYPE_NAME = {
  solid: "솔리드",
  wood: "우드",
  marble: "마블",
  metal: "메탈",
  leather: "가죽",
  stone: "스톤",
  fabric: "패브릭",
};

const unique = (values) => [
  ...new Set(values.filter(Boolean)),
];

function Options({
  title,
  items,
  value,
  onChange,
}) {
  if (!items.length) return null;

  return (
    <div style={{ marginTop: "18px" }}>
      <strong>{title}</strong>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginTop: "8px",
        }}
      >
        {items.map((item) => {
          const active =
            value === item.value;

          return (
            <button
              key={item.value}
              type="button"
              onClick={() =>
                onChange(item.value)
              }
              style={{
                padding: "10px 14px",
                borderRadius: "999px",
                border: active
                  ? "2px solid #111827"
                  : "1px solid #d1d5db",
                background: active
                  ? "#111827"
                  : "#ffffff",
                color: active
                  ? "#ffffff"
                  : "#374151",
                fontWeight: "bold",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FilmColorPicker({
  onSelect,
  onGenerate,
}) {
  const [products, setProducts] =
    useState([]);
  const [brand, setBrand] =
    useState("");
  const [texture, setTexture] =
    useState("");
  const [family, setFamily] =
    useState("");
  const [search, setSearch] =
    useState("");
  const [selected, setSelected] =
    useState(null);
  const [limit, setLimit] =
    useState(PAGE_SIZE);
  const [loading, setLoading] =
    useState(true);
  const [message, setMessage] =
    useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data, error } =
        await supabase
          .from("film_products")
          .select(
            "id,brand,product_code,product_name,color_family,color_description,color_hex,texture,sample_image_path,material_price_per_meter,price_multiplier,additional_cost,sort_order"
          )
          .eq("is_active", true)
          .order("brand")
          .order("texture")
          .order("sort_order");

      if (!mounted) return;

      if (error) {
        console.error(error);

        setMessage(
          "필름 제품을 불러오지 못했습니다."
        );
      } else {
        const rows = data || [];

        setProducts(rows);

        const brandList = unique(
          rows.map(
            (item) => item.brand
          )
        );

        if (
          brandList.length === 1
        ) {
          setBrand(brandList[0]);
        }
      }

      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const brands = useMemo(
    () =>
      unique(
        products.map(
          (item) => item.brand
        )
      ),
    [products]
  );

  const textures = useMemo(() => {
    if (!brand) return [];

    return unique(
      products
        .filter(
          (item) =>
            item.brand === brand
        )
        .map(
          (item) =>
            item.texture
        )
    );
  }, [brand, products]);

  useEffect(() => {
    if (
      textures.length === 1 &&
      !texture
    ) {
      setTexture(textures[0]);
    }
  }, [texture, textures]);

  const families = useMemo(() => {
    if (!brand || !texture) {
      return [];
    }

    return unique(
      products
        .filter(
          (item) =>
            item.brand === brand &&
            item.texture === texture
        )
        .map(
          (item) =>
            item.color_family
        )
    );
  }, [
    brand,
    products,
    texture,
  ]);

  const matches = useMemo(() => {
    const keyword = search
      .trim()
      .toLowerCase();

    return products.filter(
      (item) => {
        if (
          item.brand !== brand ||
          item.texture !== texture
        ) {
          return false;
        }

        if (
          family &&
          item.color_family !== family
        ) {
          return false;
        }

        if (
          !family &&
          !keyword
        ) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        return [
          item.product_code,
          item.product_name,
          item.color_description,
          item.color_family,
        ]
          .filter(Boolean)
          .some((text) =>
            String(text)
              .toLowerCase()
              .includes(keyword)
          );
      }
    );
  }, [
    brand,
    family,
    products,
    search,
    texture,
  ]);

  function resetProduct() {
    setSelected(null);
    setSearch("");
    setLimit(PAGE_SIZE);
  }

  function chooseBrand(value) {
    setBrand(value);
    setTexture("");
    setFamily("");
    resetProduct();
  }

  function chooseTexture(value) {
    setTexture(value);
    setFamily("");
    resetProduct();
  }

  function chooseFamily(value) {
    setFamily(value);
    resetProduct();
  }

  function chooseProduct(product) {
    setSelected(product);

    if (onSelect) {
      onSelect(product);
    }
  }

  return (
    <section
      style={{
        marginTop: "18px",
        padding: "18px",
        border:
          "1px solid #e5e7eb",
        borderRadius: "18px",
        background: "#ffffff",
      }}
    >
      <h2 style={{ margin: 0 }}>
        가상 시공 필름 선택
      </h2>

      <p
        style={{
          color: "#6b7280",
          lineHeight: 1.6,
        }}
      >
        제조사, 패턴, 색상 계열을
        차례로 선택하세요.
      </p>

      {loading && (
        <p>
          필름 제품 불러오는 중...
        </p>
      )}

      {message && (
        <p
          style={{
            color: "#b91c1c",
          }}
        >
          {message}
        </p>
      )}

      {!loading && !message && (
        <>
          <Options
            title="1. 제조사"
            items={brands.map(
              (value) => ({
                value,
                label: value,
              })
            )}
            value={brand}
            onChange={chooseBrand}
          />

          {brand && (
            <Options
              title="2. 필름 패턴"
              items={textures.map(
                (value) => ({
                  value,
                  label:
                    TYPE_NAME[
                      value
                    ] || value,
                })
              )}
              value={texture}
              onChange={
                chooseTexture
              }
            />
          )}

          {brand && texture && (
            <Options
              title="3. 색상 계열"
              items={families.map(
                (value) => ({
                  value,
                  label: value,
                })
              )}
              value={family}
              onChange={
                chooseFamily
              }
            />
          )}

          {brand && texture && (
            <input
              value={search}
              onChange={(event) => {
                setSearch(
                  event.target.value
                );
                setLimit(
                  PAGE_SIZE
                );
              }}
              placeholder="제품번호 검색 (예: S245)"
              style={{
                width: "100%",
                marginTop: "18px",
                padding: "13px",
                border:
                  "1px solid #d1d5db",
                borderRadius:
                  "12px",
                boxSizing:
                  "border-box",
                fontSize: "16px",
              }}
            />
          )}

          {(family ||
            search.trim()) && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2, minmax(0, 1fr))",
                  gap: "10px",
                  marginTop: "18px",
                }}
              >
                {matches
                  .slice(0, limit)
                  .map((product) => {
                    const active =
                      selected?.id ===
                      product.id;

                    return (
                      <button
                        key={
                          product.id
                        }
                        type="button"
                        onClick={() =>
                          chooseProduct(
                            product
                          )
                        }
                        style={{
                          padding:
                            "9px",
                          borderRadius:
                            "13px",
                          border:
                            active
                              ? "3px solid #111827"
                              : "1px solid #d1d5db",
                          background:
                            "#ffffff",
                          textAlign:
                            "left",
                        }}
                      >
                        {product.sample_image_path ? (
                          <img
                            src={
                              product.sample_image_path
                            }
                            alt={
                              product.product_code
                            }
                            style={{
                              display:
                                "block",
                              width:
                                "100%",
                              aspectRatio:
                                "1.5 / 1",
                              objectFit:
                                "cover",
                              borderRadius:
                                "8px",
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              display:
                                "block",
                              width:
                                "100%",
                              aspectRatio:
                                "1.5 / 1",
                              borderRadius:
                                "8px",
                              border:
                                "1px solid #e5e7eb",
                              background:
                                product.color_hex ||
                                "#ffffff",
                            }}
                          />
                        )}

                        <strong
                          style={{
                            display:
                              "block",
                            marginTop:
                              "7px",
                          }}
                        >
                          {
                            product.product_code
                          }
                        </strong>

                        <span
                          style={{
                            color:
                              "#6b7280",
                            fontSize:
                              "12px",
                          }}
                        >
                          {product.color_description ||
                            product.color_family}
                        </span>
                      </button>
                    );
                  })}
              </div>

              {!matches.length && (
                <p
                  style={{
                    color:
                      "#6b7280",
                  }}
                >
                  조건에 맞는 제품이
                  없습니다.
                </p>
              )}

              {limit <
                matches.length && (
                <button
                  type="button"
                  onClick={() =>
                    setLimit(
                      (value) =>
                        value +
                        PAGE_SIZE
                    )
                  }
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    padding: "13px",
                    border:
                      "1px solid #d1d5db",
                    borderRadius:
                      "12px",
                    background:
                      "#ffffff",
                    fontWeight:
                      "bold",
                  }}
                >
                  색상 더보기 (
                  {matches.length -
                    limit}
                  개)
                </button>
              )}
            </>
          )}

          {selected && (
            <div
              style={{
                marginTop: "18px",
                padding: "15px",
                borderRadius:
                  "14px",
                background:
                  "#f3f4f6",
              }}
            >
              <div
                style={{
                  color: "#6b7280",
                  fontSize: "13px",
                }}
              >
                {selected.brand}
                {" 〉 "}
                {TYPE_NAME[
                  selected.texture
                ] ||
                  selected.texture}
                {" 〉 "}
                {
                  selected.color_family
                }
              </div>

              <div
                style={{
                  marginTop: "5px",
                  fontSize: "20px",
                  fontWeight: "bold",
                }}
              >
                {
                  selected.product_code
                }
              </div>

              <div
                style={{
                  marginTop: "3px",
                  color: "#4b5563",
                }}
              >
                {
                  selected.color_description
                }
              </div>

              {onGenerate && (
                <button
                  type="button"
                  onClick={() =>
                    onGenerate(
                      selected
                    )
                  }
                  style={{
                    width: "100%",
                    marginTop: "14px",
                    padding: "15px",
                    border: "none",
                    borderRadius:
                      "12px",
                    background:
                      "#111827",
                    color: "#ffffff",
                    fontSize: "17px",
                    fontWeight:
                      "bold",
                  }}
                >
                  이 필름으로 가상
                  시공하기
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
      }
