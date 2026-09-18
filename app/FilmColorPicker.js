"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";

const ALL = "전체";

export default function FilmColorPicker({
  onSelect,
}) {
  const [products, setProducts] =
    useState([]);
  const [selected, setSelected] =
    useState(null);
  const [family, setFamily] =
    useState(ALL);
  const [loading, setLoading] =
    useState(true);
  const [message, setMessage] =
    useState("");

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      setLoading(true);
      setMessage("");

      const { data, error } =
        await supabase
          .from("film_products")
          .select(`
            id,
            brand,
            product_code,
            product_name,
            color_family,
            color_description,
            color_hex,
            texture,
            price_multiplier,
            additional_cost,
            sort_order
          `)
          .eq("brand", "현대보닥")
          .eq("texture", "solid")
          .eq("is_active", true)
          .order("sort_order", {
            ascending: true,
          });

      if (!active) return;

      if (error) {
        console.error(error);
        setMessage(
          "색상표를 불러오지 못했습니다."
        );
        setProducts([]);
      } else {
        setProducts(data || []);
      }

      setLoading(false);
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  const families = useMemo(() => {
    const names = products
      .map(
        (product) =>
          product.color_family
      )
      .filter(Boolean);

    return [
      ALL,
      ...new Set(names),
    ];
  }, [products]);

  const visibleProducts =
    useMemo(() => {
      if (family === ALL) {
        return products;
      }

      return products.filter(
        (product) =>
          product.color_family ===
          family
      );
    }, [family, products]);

  function chooseProduct(product) {
    setSelected(product);

    if (onSelect) {
      onSelect(product);
    }
  }

  return (
    <section
      style={{
        marginTop: "24px",
        padding: "22px",
        border:
          "1px solid #e5e7eb",
        borderRadius: "20px",
        background: "#ffffff",
      }}
    >
      <h2 style={{ marginTop: 0 }}>
        2. 가상 시공 색상 선택
      </h2>

      <p
        style={{
          color: "#6b7280",
          lineHeight: 1.6,
        }}
      >
        현대보닥 솔리드 필름 중 원하는
        색상을 선택하세요.
      </p>

      {loading && (
        <p>색상표 불러오는 중...</p>
      )}

      {message && (
        <div
          style={{
            padding: "12px",
            borderRadius: "10px",
            background: "#fef2f2",
            color: "#b91c1c",
          }}
        >
          {message}
        </div>
      )}

      {!loading && !message && (
        <>
          <div
            style={{
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              paddingBottom: "8px",
            }}
          >
            {families.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() =>
                  setFamily(name)
                }
                style={{
                  flex: "0 0 auto",
                  padding:
                    "9px 14px",
                  borderRadius:
                    "999px",
                  border:
                    family === name
                      ? "2px solid #111827"
                      : "1px solid #d1d5db",
                  background:
                    family === name
                      ? "#111827"
                      : "#ffffff",
                  color:
                    family === name
                      ? "#ffffff"
                      : "#374151",
                  fontWeight: "bold",
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(3, minmax(0, 1fr))",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            {visibleProducts.map(
              (product) => {
                const isSelected =
                  selected?.id ===
                  product.id;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() =>
                      chooseProduct(
                        product
                      )
                    }
                    style={{
                      padding: "8px",
                      borderRadius:
                        "12px",
                      border: isSelected
                        ? "3px solid #111827"
                        : "1px solid #d1d5db",
                      background:
                        "#ffffff",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        width: "100%",
                        aspectRatio:
                          "1.25 / 1",
                        borderRadius:
                          "8px",
                        border:
                          "1px solid #e5e7eb",
                        background:
                          product.color_hex ||
                          "#ffffff",
                      }}
                    />

                    <strong
                      style={{
                        display: "block",
                        marginTop: "7px",
                        fontSize: "14px",
                      }}
                    >
                      {
                        product.product_code
                      }
                    </strong>

                    <span
                      style={{
                        display: "block",
                        marginTop: "2px",
                        color: "#6b7280",
                        fontSize: "11px",
                      }}
                    >
                      {product.color_description ||
                        product.color_family}
                    </span>
                  </button>
                );
              }
            )}
          </div>

          {selected && (
            <div
              style={{
                marginTop: "16px",
                padding: "14px",
                borderRadius:
                  "12px",
                background: "#f3f4f6",
                lineHeight: 1.6,
              }}
            >
              선택 색상:{" "}
              <strong>
                {
                  selected.product_code
                }
              </strong>
              <br />
              {
                selected.color_description
              }
            </div>
          )}
        </>
      )}
    </section>
  );
}
