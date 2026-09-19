"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const PAGE_SIZE = 6;


/* =========================================================
   제품 코드 → 실제 제품 라인
========================================================= */

const PRODUCT_LINES = [
  { prefix: "OGW", label: "옵티컬 그레인 우드", category: "wood", filter: "wood" },
  { prefix: "SPW", label: "스페셜우드", category: "wood", filter: "wood" },
  { prefix: "PNT", label: "프리미엄페인티드우드", category: "solid", filter: "color" },
  { prefix: "PTW", label: "페인티드우드", category: "solid", filter: "color" },
  { prefix: "ZSW", label: "슈퍼화이트우드", category: "solid", filter: "color" },

  { prefix: "ECF", label: "이지클린필름", category: "etc", filter: "color" },
  { prefix: "EXF", label: "외장용필름", category: "etc", filter: "color" },

  { prefix: "UMI", label: "고광택메탈", category: "metal", filter: "color" },
  { prefix: "APZ", label: "골드", category: "metal", filter: "color" },

  { prefix: "BLC", label: "모노블랑", category: "etc", filter: "color" },

  { prefix: "LW", label: "롱우드", category: "wood", filter: "wood" },
  { prefix: "ZX", label: "프리미엄우드", category: "wood", filter: "wood" },

  { prefix: "NS", label: "스톤앤마블", category: "stone", filter: "tone" },
  { prefix: "PM", label: "프리미엄마블", category: "stone", filter: "tone" },
  { prefix: "PNC", label: "프리미엄페인티드콘크리트", category: "stone", filter: "tone" },
  { prefix: "RM", label: "리얼마블", category: "stone", filter: "tone" },

  { prefix: "VM", label: "벨벳메탈", category: "metal", filter: "color" },

  { prefix: "SF", label: "소프트패브릭", category: "fabric", filter: "tone" },
  { prefix: "RF", label: "리얼패브릭", category: "fabric", filter: "tone" },
  { prefix: "NF", label: "네츄럴패브릭", category: "fabric", filter: "tone" },

  { prefix: "SL", label: "소프트레더", category: "leather", filter: "tone" },

  { prefix: "SMT", label: "슈퍼매트", category: "etc", filter: "color" },

  { prefix: "CP", label: "텍스쳐", category: "solid", filter: "color" },
  { prefix: "HS", label: "텍스쳐", category: "solid", filter: "color" },
  { prefix: "LM", label: "텍스쳐", category: "solid", filter: "color" },
  { prefix: "LS", label: "텍스쳐", category: "solid", filter: "color" },

  /*
   W와 S는 반드시 아래쪽
  */
  { prefix: "W", label: "우드", category: "wood", filter: "wood" },
  { prefix: "S", label: "솔리드", category: "solid", filter: "color" },
];


/* =========================================================
   대분류
========================================================= */

const CATEGORIES = [
  {
    key: "wood",
    label: "우드",
  },
  {
    key: "solid",
    label: "솔리드",
  },
  {
    key: "stone",
    label: "스톤&마블",
  },
  {
    key: "metal",
    label: "메탈",
  },
  {
    key: "fabric",
    label: "패브릭",
  },
  {
    key: "leather",
    label: "레더",
  },
  {
    key: "etc",
    label: "기타",
  },
];


/* =========================================================
   중복 제거
========================================================= */

function unique(values) {
  return [
    ...new Set(
      values
        .filter(
          (value) =>
            value !== null &&
            value !== undefined
        )
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ];
}


/* =========================================================
   제품코드 → 제품라인 찾기
========================================================= */

function getProductLine(productCode) {
  const code = String(productCode || "")
    .trim()
    .toUpperCase();

  if (!code) return null;

  return (
    PRODUCT_LINES.find((line) =>
      code.startsWith(line.prefix)
    ) || null
  );
}


/* =========================================================
   톤 화면 표시 이름
========================================================= */

function getToneLabel(value) {
  if (value === "라이트톤") return "라이트";
  if (value === "미디엄톤") return "미디엄";
  if (value === "딥톤") return "딥";

  /*
   DB의 기타톤은 고객 화면에서는
   포인트톤으로 표시
  */
  if (value === "기타톤") return "포인트";

  return value;
}


/* =========================================================
   공통 버튼
========================================================= */

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
          const active = value === item.value;

          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
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
                cursor: "pointer",
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


/* =========================================================
   메인
========================================================= */

export default function FilmColorPicker({
  onSelect,
  onGenerate,
}) {
  const [products, setProducts] = useState([]);

  const [brand, setBrand] = useState("");

  /*
   2단계 대분류
   wood / solid / stone / metal...
  */
  const [category, setCategory] = useState("");

  /*
   3단계 제품라인
   W / SPW / ZX / S...
  */
  const [linePrefix, setLinePrefix] = useState("");

  /*
   4단계
   수종 / 컬러 / 톤
  */
  const [detail, setDetail] = useState("");

  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState(null);

  const [limit, setLimit] = useState(PAGE_SIZE);

  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState("");


  /* =========================================================
     DB 불러오기
  ========================================================= */

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("film_products")
        .select(
          [
            "id",
            "brand",
            "product_code",
            "product_name",
            "color_family",
            "color_description",
            "color_hex",
            "texture",
            "grade",
            "wood_species",
            "tone_family",
            "sample_image_path",
            "material_price_per_meter",
            "price_multiplier",
            "additional_cost",
            "sort_order",
          ].join(",")
        )
        .eq("is_active", true)
        .order("brand")
        .order("sort_order");

      if (!mounted) return;

      if (error) {
        console.error(error);

        setMessage(
          `필름 제품을 불러오지 못했습니다. ${
            error.message || ""
          }`
        );

        setProducts([]);
      } else {
        const rows = data || [];

        setProducts(rows);

        const brandList = unique(
          rows.map((item) => item.brand)
        );

        /*
         제조사가 하나면 자동선택
        */
        if (brandList.length === 1) {
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


  /* =========================================================
     제조사
  ========================================================= */

  const brands = useMemo(() => {
    return unique(
      products.map((item) => item.brand)
    );
  }, [products]);


  /* =========================================================
     선택 제조사에 존재하는 대분류
  ========================================================= */

  const availableCategories = useMemo(() => {
    if (!brand) return [];

    const brandProducts = products.filter(
      (item) => item.brand === brand
    );

    return CATEGORIES.filter((cat) => {
      return brandProducts.some((product) => {
        const line = getProductLine(
          product.product_code
        );

        return line?.category === cat.key;
      });
    });
  }, [brand, products]);


  /* =========================================================
     선택 대분류 안의 제품라인
  ========================================================= */

  const availableLines = useMemo(() => {
    if (!brand || !category) return [];

    const brandProducts = products.filter(
      (item) => item.brand === brand
    );

    /*
     같은 label의 제품라인을 하나로 묶음

     예:
     CP / HS / LM / LS
     → 화면에서는 "텍스쳐" 버튼 하나
    */

    const map = new Map();

    PRODUCT_LINES
      .filter((line) => line.category === category)
      .forEach((line) => {
        const exists = brandProducts.some((product) => {
          const found = getProductLine(
            product.product_code
          );

          return found?.prefix === line.prefix;
        });

        if (!exists) return;

        if (!map.has(line.label)) {
          map.set(line.label, {
            key: line.label,
            label: line.label,
            prefixes: [],
            filter: line.filter,
          });
        }

        map.get(line.label).prefixes.push(
          line.prefix
        );
      });

    return [...map.values()];
  }, [brand, category, products]);


  /* =========================================================
     현재 선택 제품라인
  ========================================================= */

  const selectedLine = useMemo(() => {
    return (
      availableLines.find(
        (line) => line.key === linePrefix
      ) || null
    );
  }, [availableLines, linePrefix]);


  /* =========================================================
     제품라인에 포함된 실제 제품
  ========================================================= */

  const lineProducts = useMemo(() => {
    if (
      !brand ||
      !category ||
      !selectedLine
    ) {
      return [];
    }

    return products.filter((product) => {
      if (product.brand !== brand) {
        return false;
      }

      const line = getProductLine(
        product.product_code
      );

      if (!line) return false;

      return selectedLine.prefixes.includes(
        line.prefix
      );
    });
  }, [
    brand,
    category,
    selectedLine,
    products,
  ]);


  /* =========================================================
     4단계 목록

     우드 → 수종
     솔리드/메탈 → 컬러
     마블/패브릭/레더 → 톤
  ========================================================= */

  const details = useMemo(() => {
    if (!selectedLine) return [];

    if (selectedLine.filter === "wood") {
      return unique(
        lineProducts.map(
          (item) => item.wood_species
        )
      );
    }

    if (selectedLine.filter === "tone") {
      const tones = unique(
        lineProducts.map(
          (item) => item.tone_family
        )
      );

      /*
       고객 화면 순서
      */

      const order = [
        "라이트톤",
        "미디엄톤",
        "딥톤",
        "기타톤",
      ];

      return tones.sort((a, b) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);

        return (
          (ai === -1 ? 999 : ai) -
          (bi === -1 ? 999 : bi)
        );
      });
    }

    return unique(
      lineProducts.map(
        (item) => item.color_family
      )
    );
  }, [selectedLine, lineProducts]);


  /* =========================================================
     필터된 제품
  ========================================================= */

  const matches = useMemo(() => {
    const keyword = search
      .trim()
      .toLowerCase();

    return lineProducts.filter((item) => {
      if (detail) {
        if (selectedLine?.filter === "wood") {
          if (item.wood_species !== detail) {
            return false;
          }
        }

        else if (
          selectedLine?.filter === "tone"
        ) {
          if (item.tone_family !== detail) {
            return false;
          }
        }

        else {
          if (item.color_family !== detail) {
            return false;
          }
        }
      }

      /*
       아무 세부조건도 없고
       검색어도 없으면 제품 숨김
      */

      if (!detail && !keyword) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        item.product_code,
        item.product_name,
        item.color_family,
        item.color_description,
        item.wood_species,
        item.tone_family,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(keyword)
        );
    });
  }, [
    lineProducts,
    detail,
    search,
    selectedLine,
  ]);


  /* =========================================================
     선택 초기화
  ========================================================= */

  function clearProduct() {
    setSelected(null);
    setSearch("");
    setLimit(PAGE_SIZE);

    if (onSelect) {
      onSelect(null);
    }
  }


  /* =========================================================
     제조사 선택
  ========================================================= */

  function chooseBrand(value) {
    setBrand(value);

    setCategory("");
    setLinePrefix("");
    setDetail("");

    clearProduct();
  }


  /* =========================================================
     대분류 선택
  ========================================================= */

  function chooseCategory(value) {
    setCategory(value);

    setLinePrefix("");
    setDetail("");

    clearProduct();
  }


  /* =========================================================
     제품라인 선택
  ========================================================= */

  function chooseLine(value) {
    setLinePrefix(value);

    setDetail("");

    clearProduct();
  }


  /* =========================================================
     세부 선택
  ========================================================= */

  function chooseDetail(value) {
    setDetail(value);

    clearProduct();
  }


  /* =========================================================
     제품 선택
  ========================================================= */

  function chooseProduct(product) {
    setSelected(product);

    if (onSelect) {
      onSelect(product);
    }
  }


  /* =========================================================
     4단계 제목
  ========================================================= */

  function getDetailTitle() {
    if (!selectedLine) {
      return "4. 세부 선택";
    }

    if (selectedLine.filter === "wood") {
      return "4. 수종";
    }

    if (selectedLine.filter === "tone") {
      return "4. 톤";
    }

    return "4. 컬러";
  }


  /* =========================================================
     제품 카드 설명
  ========================================================= */

  function getProductInfo(product) {
    if (selectedLine?.filter === "wood") {
      return [
        product.wood_species,
        product.color_family,
      ]
        .filter(Boolean)
        .join(" · ");
    }

    if (selectedLine?.filter === "tone") {
      return [
        getToneLabel(product.tone_family),
        product.color_family,
      ]
        .filter(Boolean)
        .join(" · ");
    }

    return (
      product.color_description ||
      product.color_family ||
      ""
    );
  }


  /* =========================================================
     화면
  ========================================================= */

  return (
    <section
      style={{
        marginTop: "18px",
        padding: "18px",
        border: "1px solid #e5e7eb",
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
        원하는 필름 종류와 제품 라인을
        선택하세요.
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
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>
      )}


      {!loading && !message && (
        <>

          {/* 1 제조사 */}

          <Options
            title="1. 제조사"
            items={brands.map((value) => ({
              value,
              label: value,
            }))}
            value={brand}
            onChange={chooseBrand}
          />


          {/* 2 대분류 */}

          {brand && (
            <Options
              title="2. 필름 종류"
              items={availableCategories.map(
                (item) => ({
                  value: item.key,
                  label: item.label,
                })
              )}
              value={category}
              onChange={chooseCategory}
            />
          )}


          {/* 3 제품라인 */}

          {brand && category && (
            <Options
              title="3. 제품 라인"
              items={availableLines.map(
                (item) => ({
                  value: item.key,
                  label: item.label,
                })
              )}
              value={linePrefix}
              onChange={chooseLine}
            />
          )}


          {/* 4 수종 / 컬러 / 톤 */}

          {selectedLine && (
            <Options
              title={getDetailTitle()}
              items={details.map((value) => ({
                value,

                label:
                  selectedLine.filter === "tone"
                    ? getToneLabel(value)
                    : value,
              }))}
              value={detail}
              onChange={chooseDetail}
            />
          )}


          {/* 제품 검색 */}

          {selectedLine && (
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder="제품번호 검색"
              style={{
                width: "100%",
                marginTop: "18px",
                padding: "13px",
                border: "1px solid #d1d5db",
                borderRadius: "12px",
                boxSizing: "border-box",
                fontSize: "16px",
              }}
            />
          )}


          {/* 제품 */}

          {(detail || search.trim()) &&
            selectedLine && (
              <>

                <div
                  style={{
                    marginTop: "16px",
                    color: "#6b7280",
                    fontSize: "14px",
                  }}
                >
                  제품{" "}
                  <strong
                    style={{
                      color: "#111827",
                    }}
                  >
                    {matches.length}개
                  </strong>
                </div>


                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(2, minmax(0, 1fr))",
                    gap: "10px",
                    marginTop: "10px",
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
                          key={product.id}
                          type="button"
                          onClick={() =>
                            chooseProduct(product)
                          }
                          style={{
                            padding: "9px",
                            borderRadius: "13px",

                            border: active
                              ? "3px solid #111827"
                              : "1px solid #d1d5db",

                            background: "#ffffff",
                            textAlign: "left",
                            cursor: "pointer",
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
                              loading="lazy"
                              decoding="async"
                              style={{
                                display: "block",
                                width: "100%",
                                aspectRatio: "1.5 / 1",
                                objectFit: "cover",
                                borderRadius: "8px",
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                display: "block",
                                width: "100%",
                                aspectRatio: "1.5 / 1",
                                borderRadius: "8px",
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
                              display: "block",
                              marginTop: "7px",
                              fontSize: "15px",
                            }}
                          >
                            {product.product_code}
                          </strong>


                          {product.product_name && (
                            <span
                              style={{
                                display: "block",
                                marginTop: "2px",
                                color: "#374151",
                                fontSize: "12px",
                                fontWeight: "bold",
                              }}
                            >
                              {product.product_name}
                            </span>
                          )}


                          <span
                            style={{
                              display: "block",
                              marginTop: "3px",
                              color: "#6b7280",
                              fontSize: "12px",
                              lineHeight: 1.4,
                            }}
                          >
                            {getProductInfo(product)}
                          </span>

                        </button>
                      );
                    })}
                </div>


                {!matches.length && (
                  <p
                    style={{
                      color: "#6b7280",
                    }}
                  >
                    조건에 맞는 제품이 없습니다.
                  </p>
                )}


                {limit < matches.length && (
                  <button
                    type="button"
                    onClick={() =>
                      setLimit(
                        (value) =>
                          value + PAGE_SIZE
                      )
                    }
                    style={{
                      width: "100%",
                      marginTop: "12px",
                      padding: "13px",
                      border:
                        "1px solid #d1d5db",
                      borderRadius: "12px",
                      background: "#ffffff",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    제품 더보기 (
                    {matches.length - limit}개)
                  </button>
                )}

              </>
            )}


          {/* 선택한 제품 */}

          {selected && (
            <div
              style={{
                marginTop: "18px",
                padding: "15px",
                borderRadius: "14px",
                background: "#f3f4f6",
              }}
            >
              <div
                style={{
                  color: "#6b7280",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                {selected.brand}
                {" 〉 "}

                {
                  CATEGORIES.find(
                    (item) =>
                      item.key === category
                  )?.label
                }

                {" 〉 "}

                {selectedLine?.label}

                {" 〉 "}

                {selectedLine?.filter === "wood"
                  ? selected.wood_species
                  : selectedLine?.filter === "tone"
                  ? getToneLabel(
                      selected.tone_family
                    )
                  : selected.color_family}
              </div>


              <div
                style={{
                  marginTop: "5px",
                  fontSize: "20px",
                  fontWeight: "bold",
                }}
              >
                {selected.product_code}
              </div>


              {selected.product_name && (
                <div
                  style={{
                    marginTop: "3px",
                    color: "#374151",
                    fontWeight: "bold",
                  }}
                >
                  {selected.product_name}
                </div>
              )}


              <div
                style={{
                  marginTop: "7px",
                  color: "#4b5563",
                  lineHeight: 1.6,
                }}
              >

                {selectedLine?.filter ===
                  "wood" &&
                  selected.wood_species && (
                    <>
                      수종:{" "}
                      <strong>
                        {selected.wood_species}
                      </strong>
                      <br />
                    </>
                  )}


                {selectedLine?.filter ===
                  "tone" &&
                  selected.tone_family && (
                    <>
                      톤:{" "}
                      <strong>
                        {getToneLabel(
                          selected.tone_family
                        )}
                      </strong>
                      <br />
                    </>
                  )}


                {selected.color_family && (
                  <>
                    컬러:{" "}
                    {selected.color_family}
                  </>
                )}


                {selected.color_description && (
                  <>
                    <br />
                    {selected.color_description}
                  </>
                )}

              </div>


              {onGenerate && (
                <button
                  type="button"
                  onClick={() =>
                    onGenerate(selected)
                  }
                  style={{
                    width: "100%",
                    marginTop: "14px",
                    padding: "15px",
                    border: "none",
                    borderRadius: "12px",
                    background: "#111827",
                    color: "#ffffff",
                    fontSize: "17px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  이 필름으로 가상 시공하기
                </button>
              )}

            </div>
          )}

        </>
      )}

    </section>
  );
      }
