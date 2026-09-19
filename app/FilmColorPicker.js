"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";

const PAGE_SIZE = 6;

/*
 * =========================================================
 * 제품 코드 → 제품 라인
 * =========================================================
 */

const PRODUCT_LINES = [
  // 우드
  {
    prefix: "OGW",
    label: "옵티컬 그레인 우드",
    category: "wood",
    filter: "wood",
  },
  {
    prefix: "SPW",
    label: "스페셜우드",
    category: "wood",
    filter: "wood",
  },
  {
    prefix: "LW",
    label: "롱우드",
    category: "wood",
    filter: "wood",
  },
  {
    prefix: "ZX",
    label: "프리미엄우드",
    category: "wood",
    filter: "wood",
  },

  // 솔리드
  {
    prefix: "PNT",
    label: "프리미엄페인티드우드",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "PTW",
    label: "페인티드우드",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "ZSW",
    label: "슈퍼화이트우드",
    category: "solid",
    filter: "color",
  },

  // 텍스쳐 계열
  {
    prefix: "CP",
    label: "텍스쳐",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "HS",
    label: "텍스쳐",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "LM",
    label: "텍스쳐",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "LS",
    label: "텍스쳐",
    category: "solid",
    filter: "color",
  },

  // 스톤 & 마블
  {
    prefix: "NS",
    label: "스톤앤마블",
    category: "stone",
    filter: "tone",
  },
  {
    prefix: "PM",
    label: "프리미엄마블",
    category: "stone",
    filter: "tone",
  },
  {
    prefix: "PNC",
    label: "프리미엄페인티드콘크리트",
    category: "stone",
    filter: "tone",
  },

  // 메탈
  {
    prefix: "UMI",
    label: "고광택메탈",
    category: "metal",
    filter: "color",
  },
  {
    prefix: "APZ",
    label: "골드",
    category: "metal",
    filter: "color",
  },
  {
    prefix: "RM",
    label: "리얼메탈",
    category: "metal",
    filter: "color",
  },
  {
    prefix: "VM",
    label: "벨벳메탈",
    category: "metal",
    filter: "color",
  },

  // 패브릭
  {
    prefix: "SF",
    label: "소프트패브릭",
    category: "fabric",
    filter: "tone",
  },
  {
    prefix: "RF",
    label: "리얼패브릭",
    category: "fabric",
    filter: "tone",
  },
  {
    prefix: "NF",
    label: "네츄럴패브릭",
    category: "fabric",
    filter: "tone",
  },

  // 레더
  {
    prefix: "SL",
    label: "소프트레더",
    category: "leather",
    filter: "tone",
  },

  // 기타
  {
    prefix: "ECF",
    label: "이지클린필름",
    category: "etc",
    filter: "color",
  },
  {
    prefix: "EXF",
    label: "외장용필름",
    category: "etc",
    filter: "color",
  },
  {
    prefix: "BLC",
    label: "모노블랑",
    category: "etc",
    filter: "color",
  },
  {
    prefix: "SMT",
    label: "슈퍼매트",
    category: "etc",
    filter: "color",
  },

  /*
   * 짧은 prefix는 반드시 마지막
   */
  {
    prefix: "W",
    label: "우드",
    category: "wood",
    filter: "wood",
  },
  {
    prefix: "S",
    label: "솔리드",
    category: "solid",
    filter: "color",
  },
];

/*
 * =========================================================
 * 대분류
 * =========================================================
 */

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

/*
 * =========================================================
 * 중복 제거
 * =========================================================
 */

function unique(values) {
  return [
    ...new Set(
      values
        .filter(
          (value) =>
            value !== null &&
            value !== undefined
        )
        .map((value) =>
          String(value).trim()
        )
        .filter(Boolean)
    ),
  ];
}

/*
 * =========================================================
 * 제품코드 → 제품라인
 * =========================================================
 */

function getProductLine(productCode) {
  const code = String(
    productCode || ""
  )
    .trim()
    .toUpperCase();

  if (!code) {
    return null;
  }

  return (
    PRODUCT_LINES.find((line) =>
      code.startsWith(
        line.prefix
      )
    ) || null
  );
}

/*
 * =========================================================
 * 톤 표시
 * =========================================================
 */

function getToneLabel(value) {
  if (value === "라이트톤") {
    return "라이트";
  }

  if (value === "미디엄톤") {
    return "미디엄";
  }

  if (value === "딥톤") {
    return "딥";
  }

  if (value === "기타톤") {
    return "포인트";
  }

  return value;
}

/*
 * =========================================================
 * 작은 가로 스크롤 선택 버튼
 * =========================================================
 */

function ChipRow({
  items = [],
  value,
  onChange,
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        gap: "7px",
        overflowX: "auto",
        paddingBottom: "4px",
        WebkitOverflowScrolling:
          "touch",
        scrollbarWidth: "none",
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
              flex: "0 0 auto",
              minHeight: "38px",
              padding:
                "8px 13px",
              borderRadius:
                "999px",
              border: active
                ? "2px solid #111827"
                : "1px solid #d1d5db",
              background: active
                ? "#111827"
                : "#ffffff",
              color: active
                ? "#ffffff"
                : "#374151",
              fontSize: "13px",
              fontWeight: "700",
              whiteSpace:
                "nowrap",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/*
 * =========================================================
 * 메인
 * =========================================================
 */

export default function FilmColorPicker({
  onSelect,
  onGenerate,
}) {
  const [
    products,
    setProducts,
  ] = useState([]);

  const [brand, setBrand] =
    useState("");

  const [
    category,
    setCategory,
  ] = useState("");

  const [
    lineKey,
    setLineKey,
  ] = useState("");

  const [
    detail,
    setDetail,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    selected,
    setSelected,
  ] = useState(null);

  const [
    limit,
    setLimit,
  ] = useState(PAGE_SIZE);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    message,
    setMessage,
  ] = useState("");

  /*
   * 핵심:
   * 평소에는 선택창을 닫아둔다.
   */
  const [
    pickerOpen,
    setPickerOpen,
  ] = useState(false);

  /*
   * =========================================================
   * 제품 불러오기
   * =========================================================
   */

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setMessage("");

      const {
        data,
        error,
      } = await supabase
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
        .eq(
          "is_active",
          true
        )
        .order("brand")
        .order(
          "sort_order"
        );

      if (!mounted) {
        return;
      }

      if (error) {
        console.error(
          error
        );

        setMessage(
          `필름 제품을 불러오지 못했습니다. ${
            error.message ||
            ""
          }`
        );

        setProducts([]);
      } else {
        const rows =
          data || [];

        setProducts(rows);

        const brandList =
          unique(
            rows.map(
              (item) =>
                item.brand
            )
          );

        if (
          brandList.length ===
          1
        ) {
          setBrand(
            brandList[0]
          );
        }
      }

      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * =========================================================
   * 팝업 열릴 때 body 스크롤 잠금
   * =========================================================
   */

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    const previous =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previous;
    };
  }, [pickerOpen]);

  /*
   * =========================================================
   * 제조사
   * =========================================================
   */

  const brands = useMemo(
    () =>
      unique(
        products.map(
          (item) =>
            item.brand
        )
      ),
    [products]
  );

  /*
   * =========================================================
   * 실제 존재하는 대분류
   * =========================================================
   */

  const availableCategories =
    useMemo(() => {
      if (!brand) {
        return [];
      }

      const brandProducts =
        products.filter(
          (item) =>
            item.brand ===
            brand
        );

      return CATEGORIES.filter(
        (cat) =>
          brandProducts.some(
            (product) => {
              const line =
                getProductLine(
                  product.product_code
                );

              return (
                line?.category ===
                cat.key
              );
            }
          )
      );
    }, [brand, products]);

  /*
   * =========================================================
   * 대분류 → 제품라인
   *
   * CP / HS / LM / LS = 텍스쳐 하나
   * =========================================================
   */

  const availableLines =
    useMemo(() => {
      if (
        !brand ||
        !category
      ) {
        return [];
      }

      const brandProducts =
        products.filter(
          (item) =>
            item.brand ===
            brand
        );

      const map =
        new Map();

      PRODUCT_LINES.filter(
        (line) =>
          line.category ===
          category
      ).forEach((line) => {
        const exists =
          brandProducts.some(
            (product) => {
              const found =
                getProductLine(
                  product.product_code
                );

              return (
                found?.prefix ===
                line.prefix
              );
            }
          );

        if (!exists) {
          return;
        }

        if (
          !map.has(
            line.label
          )
        ) {
          map.set(
            line.label,
            {
              key:
                line.label,

              label:
                line.label,

              prefixes: [],

              filter:
                line.filter,
            }
          );
        }

        map
          .get(line.label)
          .prefixes.push(
            line.prefix
          );
      });

      return [
        ...map.values(),
      ];
    }, [
      brand,
      category,
      products,
    ]);

  /*
   * =========================================================
   * 선택 제품라인
   * =========================================================
   */

  const selectedLine =
    useMemo(() => {
      return (
        availableLines.find(
          (line) =>
            line.key ===
            lineKey
        ) || null
      );
    }, [
      availableLines,
      lineKey,
    ]);

  /*
   * =========================================================
   * 선택 라인의 제품
   * =========================================================
   */

  const lineProducts =
    useMemo(() => {
      if (
        !brand ||
        !category ||
        !selectedLine
      ) {
        return [];
      }

      return products.filter(
        (product) => {
          if (
            product.brand !==
            brand
          ) {
            return false;
          }

          const line =
            getProductLine(
              product.product_code
            );

          if (!line) {
            return false;
          }

          return selectedLine
            .prefixes
            .includes(
              line.prefix
            );
        }
      );
    }, [
      brand,
      category,
      selectedLine,
      products,
    ]);

  /*
   * =========================================================
   * 세부 분류
   * =========================================================
   */

  const details =
    useMemo(() => {
      if (!selectedLine) {
        return [];
      }

      /*
       * 우드 → 수종
       */
      if (
        selectedLine.filter ===
        "wood"
      ) {
        return unique(
          lineProducts.map(
            (item) =>
              item.wood_species
          )
        );
      }

      /*
       * 스톤/패브릭/레더 → 톤
       */
      if (
        selectedLine.filter ===
        "tone"
      ) {
        const tones =
          unique(
            lineProducts.map(
              (item) =>
                item.tone_family
            )
          );

        const order = [
          "라이트톤",
          "미디엄톤",
          "딥톤",
          "기타톤",
        ];

        return tones.sort(
          (a, b) => {
            const ai =
              order.indexOf(a);

            const bi =
              order.indexOf(b);

            return (
              (ai === -1
                ? 999
                : ai) -
              (bi === -1
                ? 999
                : bi)
            );
          }
        );
      }

      /*
       * 솔리드/메탈/기타 → 컬러
       */

      return unique(
        lineProducts.map(
          (item) =>
            item.color_family
        )
      );
    }, [
      selectedLine,
      lineProducts,
    ]);

  /*
   * =========================================================
   * 제품 검색 결과
   * =========================================================
   */

  const matches =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return lineProducts.filter(
        (item) => {
          if (detail) {
            if (
              selectedLine
                ?.filter ===
              "wood"
            ) {
              if (
                item.wood_species !==
                detail
              ) {
                return false;
              }
            } else if (
              selectedLine
                ?.filter ===
              "tone"
            ) {
              if (
                item.tone_family !==
                detail
              ) {
                return false;
              }
            } else if (
              item.color_family !==
              detail
            ) {
              return false;
            }
          }

          /*
           * 세부조건도 없고 검색어도 없으면
           * 제품목록은 아직 표시하지 않음
           */

          if (
            !detail &&
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
            item.color_family,
            item.color_description,
            item.wood_species,
            item.tone_family,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value)
                .toLowerCase()
                .includes(
                  keyword
                )
            );
        }
      );
    }, [
      lineProducts,
      detail,
      search,
      selectedLine,
    ]);

  /*
   * =========================================================
   * 선택 초기화
   * =========================================================
   */

  function clearProduct() {
    setSelected(null);

    setSearch("");

    setLimit(PAGE_SIZE);

    if (onSelect) {
      onSelect(null);
    }
  }

  function chooseBrand(
    value
  ) {
    setBrand(value);

    setCategory("");

    setLineKey("");

    setDetail("");

    clearProduct();
  }

  function chooseCategory(
    value
  ) {
    setCategory(value);

    setLineKey("");

    setDetail("");

    clearProduct();
  }

  function chooseLine(
    value
  ) {
    setLineKey(value);

    setDetail("");

    clearProduct();
  }

  function chooseDetail(
    value
  ) {
    setDetail(value);

    clearProduct();
  }

  /*
   * =========================================================
   * 제품 선택
   *
   * 선택 즉시:
   * 1. onSelect
   * 2. 팝업 닫기
   * =========================================================
   */

  function chooseProduct(
    product
  ) {
    setSelected(product);

    if (onSelect) {
      onSelect(product);
    }

    setPickerOpen(false);
  }

  /*
   * =========================================================
   * 선택 제품 설명
   * =========================================================
   */

  function getProductInfo(
    product
  ) {
    const line =
      getProductLine(
        product?.product_code
      );

    if (
      line?.filter ===
      "wood"
    ) {
      return [
        product.wood_species,
        product.color_family,
      ]
        .filter(Boolean)
        .join(" · ");
    }

    if (
      line?.filter ===
      "tone"
    ) {
      return [
        getToneLabel(
          product.tone_family
        ),
        product.color_family,
      ]
        .filter(Boolean)
        .join(" · ");
    }

    return (
      product
        ?.color_description ||
      product
        ?.color_family ||
      ""
    );
  }

  /*
   * =========================================================
   * 세부 선택 제목
   * =========================================================
   */

  function getDetailTitle() {
    if (!selectedLine) {
      return "세부 선택";
    }

    if (
      selectedLine.filter ===
      "wood"
    ) {
      return "수종";
    }

    if (
      selectedLine.filter ===
      "tone"
    ) {
      return "톤";
    }

    return "컬러";
  }

  /*
   * =========================================================
   * 화면
   * =========================================================
   */

  return (
    <>
      {/* =====================================================
          평상시 보이는 압축 카드
          ===================================================== */}

      <section
        style={{
          marginTop: "14px",
          padding: "14px",
          border:
            "1px solid #e5e7eb",
          borderRadius: "16px",
          background:
            "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap: "10px",
          }}
        >
          <div
            style={{
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize:
                  "12px",
                color:
                  "#6b7280",
                fontWeight:
                  "700",
              }}
            >
              가상 시공 필름
            </div>

            {!selected ? (
              <>
                <div
                  style={{
                    marginTop:
                      "3px",
                    fontSize:
                      "17px",
                    fontWeight:
                      "800",
                    color:
                      "#111827",
                  }}
                >
                  원하는 필름을
                  선택하세요
                </div>

                <div
                  style={{
                    marginTop:
                      "3px",
                    fontSize:
                      "12px",
                    color:
                      "#6b7280",
                  }}
                >
                  제품을 선택하면
                  예상견적도 바로
                  변경됩니다.
                </div>
              </>
            ) : (
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap: "10px",
                  marginTop:
                    "5px",
                }}
              >
                {selected
                  .sample_image_path ? (
                  <img
                    src={
                      selected.sample_image_path
                    }
                    alt={
                      selected.product_code ||
                      "필름"
                    }
                    style={{
                      width:
                        "54px",
                      height:
                        "54px",
                      flex:
                        "0 0 54px",
                      borderRadius:
                        "9px",
                      objectFit:
                        "cover",
                      border:
                        "1px solid #e5e7eb",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width:
                        "54px",
                      height:
                        "54px",
                      flex:
                        "0 0 54px",
                      borderRadius:
                        "9px",
                      border:
                        "1px solid #e5e7eb",
                      background:
                        selected.color_hex ||
                        "#ffffff",
                    }}
                  />
                )}

                <div
                  style={{
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "16px",
                      fontWeight:
                        "800",
                      color:
                        "#111827",
                    }}
                  >
                    {
                      selected.product_code
                    }
                  </div>

                  <div
                    style={{
                      marginTop:
                        "2px",
                      fontSize:
                        "12px",
                      color:
                        "#4b5563",
                      whiteSpace:
                        "nowrap",
                      overflow:
                        "hidden",
                      textOverflow:
                        "ellipsis",
                    }}
                  >
                    {selected.brand}

                    {getProductInfo(
                      selected
                    )
                      ? ` · ${getProductInfo(
                          selected
                        )}`
                      : ""}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setPickerOpen(
                true
              )
            }
            style={{
              flex: "0 0 auto",
              minWidth: "76px",
              padding:
                "11px 14px",
              border:
                selected
                  ? "1px solid #d1d5db"
                  : "none",
              borderRadius:
                "10px",
              background:
                selected
                  ? "#ffffff"
                  : "#111827",
              color:
                selected
                  ? "#111827"
                  : "#ffffff",
              fontWeight:
                "800",
              fontSize:
                "13px",
              cursor:
                "pointer",
            }}
          >
            {selected
              ? "변경"
              : "필름 선택"}
          </button>
        </div>

        {onGenerate &&
          selected && (
            <button
              type="button"
              onClick={() =>
                onGenerate(
                  selected
                )
              }
              style={{
                width: "100%",
                marginTop:
                  "12px",
                padding:
                  "13px",
                border:
                  "none",
                borderRadius:
                  "10px",
                background:
                  "#111827",
                color:
                  "#ffffff",
                fontSize:
                  "15px",
                fontWeight:
                  "800",
                cursor:
                  "pointer",
              }}
            >
              이 필름으로 가상
              시공하기
            </button>
          )}
      </section>

      {/* =====================================================
          Bottom Sheet
          ===================================================== */}

      {pickerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background:
              "rgba(17,24,39,0.48)",
            display: "flex",
            alignItems:
              "flex-end",
            justifyContent:
              "center",
          }}
          onClick={() =>
            setPickerOpen(
              false
            )
          }
        >
          <div
            onClick={(event) =>
              event.stopPropagation()
            }
            style={{
              width: "100%",
              maxWidth:
                "720px",
              maxHeight:
                "86dvh",
              background:
                "#ffffff",
              borderRadius:
                "22px 22px 0 0",
              boxShadow:
                "0 -12px 35px rgba(0,0,0,0.18)",
              overflow:
                "hidden",
              display:
                "flex",
              flexDirection:
                "column",
            }}
          >
            {/* 손잡이 */}

            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "center",
                paddingTop:
                  "8px",
              }}
            >
              <div
                style={{
                  width:
                    "42px",
                  height:
                    "4px",
                  borderRadius:
                    "999px",
                  background:
                    "#d1d5db",
                }}
              />
            </div>

            {/* 상단 고정 */}

            <div
              style={{
                padding:
                  "10px 14px 11px",
                borderBottom:
                  "1px solid #e5e7eb",
                background:
                  "#ffffff",
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "space-between",
                  gap: "10px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize:
                        "18px",
                      fontWeight:
                        "900",
                    }}
                  >
                    필름 선택
                  </div>

                  <div
                    style={{
                      marginTop:
                        "2px",
                      color:
                        "#6b7280",
                      fontSize:
                        "11px",
                    }}
                  >
                    제품 선택 시
                    자동으로 닫힙니다.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPickerOpen(
                      false
                    )
                  }
                  aria-label="닫기"
                  style={{
                    width:
                      "38px",
                    height:
                      "38px",
                    border:
                      "none",
                    borderRadius:
                      "50%",
                    background:
                      "#f3f4f6",
                    color:
                      "#111827",
                    fontSize:
                      "20px",
                    cursor:
                      "pointer",
                  }}
                >
                  ×
                </button>
              </div>

              {/* 검색 */}

              <div
                style={{
                  position:
                    "relative",
                  marginTop:
                    "10px",
                }}
              >
                <span
                  style={{
                    position:
                      "absolute",
                    left:
                      "12px",
                    top: "50%",
                    transform:
                      "translateY(-50%)",
                    fontSize:
                      "15px",
                    pointerEvents:
                      "none",
                  }}
                >
                  🔍
                </span>

                <input
                  value={search}
                  onChange={(
                    event
                  ) => {
                    setSearch(
                      event.target
                        .value
                    );

                    setLimit(
                      PAGE_SIZE
                    );
                  }}
                  placeholder="제품번호 검색"
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    padding:
                      "11px 12px 11px 38px",
                    border:
                      "1px solid #d1d5db",
                    borderRadius:
                      "11px",
                    background:
                      "#f9fafb",
                    fontSize:
                      "16px",
                    outline:
                      "none",
                  }}
                />
              </div>
            </div>

            {/* 내용 스크롤 */}

            <div
              style={{
                flex: 1,
                overflowY:
                  "auto",
                padding:
                  "12px 14px 22px",
                WebkitOverflowScrolling:
                  "touch",
              }}
            >
              {loading && (
                <div
                  style={{
                    padding:
                      "25px 0",
                    textAlign:
                      "center",
                    color:
                      "#6b7280",
                  }}
                >
                  필름 제품
                  불러오는 중...
                </div>
              )}

              {message && (
                <div
                  style={{
                    padding:
                      "12px",
                    borderRadius:
                      "10px",
                    background:
                      "#fef2f2",
                    color:
                      "#b91c1c",
                    fontSize:
                      "13px",
                    lineHeight:
                      1.5,
                  }}
                >
                  {message}
                </div>
              )}

              {!loading &&
                !message && (
                  <>
                    {/* 제조사 */}

                    {brands.length >
                      1 && (
                      <div
                        style={{
                          marginBottom:
                            "11px",
                        }}
                      >
                        <div
                          style={{
                            marginBottom:
                              "6px",
                            fontSize:
                              "11px",
                            color:
                              "#6b7280",
                            fontWeight:
                              "800",
                          }}
                        >
                          제조사
                        </div>

                        <ChipRow
                          items={brands.map(
                            (
                              value
                            ) => ({
                              value,
                              label:
                                value,
                            })
                          )}
                          value={
                            brand
                          }
                          onChange={
                            chooseBrand
                          }
                        />
                      </div>
                    )}

                    {/* 대분류 */}

                    {brand && (
                      <div
                        style={{
                          marginBottom:
                            "11px",
                        }}
                      >
                        <div
                          style={{
                            marginBottom:
                              "6px",
                            fontSize:
                              "11px",
                            color:
                              "#6b7280",
                            fontWeight:
                              "800",
                          }}
                        >
                          종류
                        </div>

                        <ChipRow
                          items={availableCategories.map(
                            (
                              item
                            ) => ({
                              value:
                                item.key,
                              label:
                                item.label,
                            })
                          )}
                          value={
                            category
                          }
                          onChange={
                            chooseCategory
                          }
                        />
                      </div>
                    )}

                    {/* 제품라인 */}

                    {brand &&
                      category && (
                        <div
                          style={{
                            marginBottom:
                              "11px",
                          }}
                        >
                          <div
                            style={{
                              marginBottom:
                                "6px",
                              fontSize:
                                "11px",
                              color:
                                "#6b7280",
                              fontWeight:
                                "800",
                            }}
                          >
                            제품 라인
                          </div>

                          <ChipRow
                            items={availableLines.map(
                              (
                                item
                              ) => ({
                                value:
                                  item.key,
                                label:
                                  item.label,
                              })
                            )}
                            value={
                              lineKey
                            }
                            onChange={
                              chooseLine
                            }
                          />
                        </div>
                      )}

                    {/* 세부 */}

                    {selectedLine && (
                      <div
                        style={{
                          marginBottom:
                            "11px",
                        }}
                      >
                        <div
                          style={{
                            marginBottom:
                              "6px",
                            fontSize:
                              "11px",
                            color:
                              "#6b7280",
                            fontWeight:
                              "800",
                          }}
                        >
                          {getDetailTitle()}
                        </div>

                        <ChipRow
                          items={details.map(
                            (
                              value
                            ) => ({
                              value,
                              label:
                                selectedLine.filter ===
                                "tone"
                                  ? getToneLabel(
                                      value
                                    )
                                  : value,
                            })
                          )}
                          value={
                            detail
                          }
                          onChange={
                            chooseDetail
                          }
                        />
                      </div>
                    )}

                    {/* 안내 */}

                    {!selectedLine &&
                      !search.trim() && (
                        <div
                          style={{
                            marginTop:
                              "18px",
                            padding:
                              "18px",
                            borderRadius:
                              "12px",
                            background:
                              "#f9fafb",
                            color:
                              "#6b7280",
                            textAlign:
                              "center",
                            fontSize:
                              "13px",
                            lineHeight:
                              1.6,
                          }}
                        >
                          종류와 제품
                          라인을 선택하거나
                          제품번호를
                          검색해주세요.
                        </div>
                      )}

                    {/* 제품 목록 */}

                    {selectedLine &&
                      (detail ||
                        search.trim()) && (
                        <>
                          <div
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "space-between",
                              marginTop:
                                "5px",
                              marginBottom:
                                "8px",
                            }}
                          >
                            <strong
                              style={{
                                fontSize:
                                  "13px",
                              }}
                            >
                              제품
                            </strong>

                            <span
                              style={{
                                color:
                                  "#6b7280",
                                fontSize:
                                  "11px",
                              }}
                            >
                              {
                                matches.length
                              }
                              개
                            </span>
                          </div>

                          <div
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                "repeat(3, minmax(0, 1fr))",
                              gap:
                                "7px",
                            }}
                          >
                            {matches
                              .slice(
                                0,
                                limit
                              )
                              .map(
                                (
                                  product
                                ) => {
                                  const active =
                                    selected
                                      ?.id ===
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
                                        minWidth:
                                          0,
                                        padding:
                                          "5px",
                                        borderRadius:
                                          "10px",
                                        border:
                                          active
                                            ? "2px solid #111827"
                                            : "1px solid #e5e7eb",
                                        background:
                                          "#ffffff",
                                        textAlign:
                                          "left",
                                        cursor:
                                          "pointer",
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
                                            display:
                                              "block",
                                            width:
                                              "100%",
                                            aspectRatio:
                                              "1 / 1",
                                            objectFit:
                                              "cover",
                                            borderRadius:
                                              "7px",
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
                                              "1 / 1",
                                            borderRadius:
                                              "7px",
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
                                            "5px",
                                          fontSize:
                                            "12px",
                                          whiteSpace:
                                            "nowrap",
                                          overflow:
                                            "hidden",
                                          textOverflow:
                                            "ellipsis",
                                        }}
                                      >
                                        {
                                          product.product_code
                                        }
                                      </strong>

                                      <span
                                        style={{
                                          display:
                                            "block",
                                          marginTop:
                                            "1px",
                                          color:
                                            "#6b7280",
                                          fontSize:
                                            "9px",
                                          whiteSpace:
                                            "nowrap",
                                          overflow:
                                            "hidden",
                                          textOverflow:
                                            "ellipsis",
                                        }}
                                      >
                                        {getProductInfo(
                                          product
                                        ) ||
                                          product.product_name ||
                                          "필름"}
                                      </span>
                                    </button>
                                  );
                                }
                              )}
                          </div>

                          {!matches.length && (
                            <div
                              style={{
                                padding:
                                  "22px 0",
                                color:
                                  "#6b7280",
                                textAlign:
                                  "center",
                                fontSize:
                                  "13px",
                              }}
                            >
                              조건에 맞는
                              제품이 없습니다.
                            </div>
                          )}

                          {limit <
                            matches.length && (
                            <button
                              type="button"
                              onClick={() =>
                                setLimit(
                                  (
                                    value
                                  ) =>
                                    value +
                                    PAGE_SIZE
                                )
                              }
                              style={{
                                width:
                                  "100%",
                                marginTop:
                                  "10px",
                                padding:
                                  "11px",
                                border:
                                  "1px solid #d1d5db",
                                borderRadius:
                                  "10px",
                                background:
                                  "#ffffff",
                                color:
                                  "#111827",
                                fontSize:
                                  "13px",
                                fontWeight:
                                  "800",
                                cursor:
                                  "pointer",
                              }}
                            >
                              제품 더보기 (
                              {matches.length -
                                limit}
                              개)
                            </button>
                          )}
                        </>
                      )}
                  </>
                )}
            </div>
          </div>
        </div>
      )}
    </>
  );
       }
