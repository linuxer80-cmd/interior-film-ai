"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";

const PAGE_SIZE = 6;


/*
=========================================================
현대보닥 제품코드 기준 제품군

중요:
긴 prefix부터 검사해야 합니다.

예:
SPW03 -> SPW
W018  -> W
=========================================================
*/
const PRODUCT_GROUPS = [
  {
    prefix: "OGW",
    label: "옵티컬 그레인 우드",
    filter: "wood",
  },
  {
    prefix: "SPW",
    label: "스페셜우드",
    filter: "wood",
  },
  {
    prefix: "PNT",
    label: "프리미엄페인티드우드",
    filter: "color",
  },
  {
    prefix: "PTW",
    label: "페인티드우드",
    filter: "color",
  },
  {
    prefix: "ZSW",
    label: "슈퍼화이트우드",
    filter: "color",
  },
  {
    prefix: "ECF",
    label: "이지클린필름",
    filter: "color",
  },
  {
    prefix: "EXF",
    label: "외장용필름",
    filter: "color",
  },
  {
    prefix: "UMI",
    label: "고광택메탈",
    filter: "color",
  },
  {
    prefix: "APZ",
    label: "골드",
    filter: "color",
  },
  {
    prefix: "BLC",
    label: "모노블랑",
    filter: "color",
  },

  {
    prefix: "LW",
    label: "롱우드",
    filter: "wood",
  },
  {
    prefix: "ZX",
    label: "프리미엄우드",
    filter: "wood",
  },

  {
    prefix: "NS",
    label: "스톤앤마블",
    filter: "color",
  },
  {
    prefix: "PM",
    label: "프리미엄마블",
    filter: "color",
  },
  {
    prefix: "PNC",
    label: "프리미엄페인티드콘크리트",
    filter: "color",
  },
  {
    prefix: "RM",
    label: "리얼마블",
    filter: "color",
  },

  {
    prefix: "VM",
    label: "벨벳메탈",
    filter: "color",
  },

  {
    prefix: "SF",
    label: "소프트페브릭",
    filter: "color",
  },
  {
    prefix: "SL",
    label: "소프트레더",
    filter: "color",
  },
  {
    prefix: "RF",
    label: "리얼페브릭",
    filter: "color",
  },
  {
    prefix: "NF",
    label: "네츄럴페브릭",
    filter: "color",
  },

  {
    prefix: "SMT",
    label: "슈퍼매트",
    filter: "color",
  },

  {
    prefix: "CP",
    label: "텍스쳐필름",
    filter: "color",
  },
  {
    prefix: "HS",
    label: "텍스쳐필름",
    filter: "color",
  },
  {
    prefix: "LM",
    label: "텍스쳐필름",
    filter: "color",
  },
  {
    prefix: "LS",
    label: "텍스쳐필름",
    filter: "color",
  },

  /*
  반드시 W와 S는 아래쪽에 둡니다.
  다른 코드가 먼저 판별되어야 합니다.
  */
  {
    prefix: "W",
    label: "우드",
    filter: "wood",
  },
  {
    prefix: "S",
    label: "솔리드",
    filter: "color",
  },
];


/*
=========================================================
중복 제거
=========================================================
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
=========================================================
제품코드에서 제품군 찾기
=========================================================
*/
function getProductGroup(productCode) {
  const code = String(
    productCode || ""
  )
    .trim()
    .toUpperCase();

  if (!code) {
    return null;
  }

  return (
    PRODUCT_GROUPS.find(
      (group) =>
        code.startsWith(
          group.prefix
        )
    ) || null
  );
}


/*
=========================================================
선택 버튼
=========================================================
*/
function Options({
  title,
  items,
  value,
  onChange,
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: "18px",
      }}
    >
      <strong>
        {title}
      </strong>

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
                onChange(
                  item.value
                )
              }
              style={{
                padding:
                  "10px 14px",

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

                fontWeight:
                  "bold",

                cursor:
                  "pointer",
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


/*
=========================================================
메인
=========================================================
*/
export default function FilmColorPicker({
  onSelect,
  onGenerate,
}) {
  const [
    products,
    setProducts,
  ] = useState([]);

  const [
    brand,
    setBrand,
  ] = useState("");

  /*
  제품코드 prefix

  W
  S
  LW
  SPW
  ZX
  ...
  */
  const [
    groupPrefix,
    setGroupPrefix,
  ] = useState("");

  /*
  수종 또는 색상계열
  */
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
  ] = useState(
    PAGE_SIZE
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    message,
    setMessage,
  ] = useState("");


  /*
  =========================================================
  DB 제품 불러오기
  =========================================================
  */
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setMessage("");

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "film_products"
          )
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
            error.message || ""
          }`
        );

        setProducts([]);
      } else {
        const rows =
          data || [];

        setProducts(
          rows
        );

        const brandList =
          unique(
            rows.map(
              (item) =>
                item.brand
            )
          );

        /*
        제조사가 하나면
        현대보닥 자동선택
        */
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
  =========================================================
  제조사 목록
  =========================================================
  */
  const brands =
    useMemo(
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
  =========================================================
  선택한 제조사에 실제 존재하는 제품군만 표시

  여기서 texture / grade를 사용하지 않습니다.

  product_code prefix만 사용합니다.
  =========================================================
  */
  const availableGroups =
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

      return PRODUCT_GROUPS.filter(
        (group) =>
          brandProducts.some(
            (product) => {
              const found =
                getProductGroup(
                  product.product_code
                );

              return (
                found?.prefix ===
                group.prefix
              );
            }
          )
      );
    }, [
      brand,
      products,
    ]);


  /*
  =========================================================
  현재 선택된 제품군
  =========================================================
  */
  const selectedGroup =
    useMemo(
      () =>
        PRODUCT_GROUPS.find(
          (group) =>
            group.prefix ===
            groupPrefix
        ) || null,
      [groupPrefix]
    );


  /*
  =========================================================
  선택한 제품군의 제품들
  =========================================================
  */
  const groupProducts =
    useMemo(() => {
      if (
        !brand ||
        !groupPrefix
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

          const group =
            getProductGroup(
              product.product_code
            );

          return (
            group?.prefix ===
            groupPrefix
          );
        }
      );
    }, [
      brand,
      groupPrefix,
      products,
    ]);


  /*
  =========================================================
  3단계

  자연우드:
  wood_species

  나머지:
  color_family
  =========================================================
  */
  const details =
    useMemo(() => {
      if (
        !selectedGroup
      ) {
        return [];
      }

      if (
        selectedGroup.filter ===
        "wood"
      ) {
        return unique(
          groupProducts.map(
            (item) =>
              item.wood_species
          )
        );
      }

      return unique(
        groupProducts.map(
          (item) =>
            item.color_family
        )
      );
    }, [
      selectedGroup,
      groupProducts,
    ]);


  /*
  =========================================================
  제품 검색
  =========================================================
  */
  const matches =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return groupProducts.filter(
        (item) => {
          /*
          수종 / 색상 필터
          */
          if (detail) {
            if (
              selectedGroup?.filter ===
              "wood"
            ) {
              if (
                item.wood_species !==
                detail
              ) {
                return false;
              }
            } else {
              if (
                item.color_family !==
                detail
              ) {
                return false;
              }
            }
          }

          /*
          수종/색상을 선택하지 않았고
          검색어도 없으면 제품 숨김
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

          /*
          검색 대상
          */
          return [
            item.product_code,
            item.product_name,
            item.color_family,
            item.color_description,
            item.wood_species,
          ]
            .filter(Boolean)
            .some(
              (value) =>
                String(value)
                  .toLowerCase()
                  .includes(
                    keyword
                  )
            );
        }
      );
    }, [
      groupProducts,
      detail,
      search,
      selectedGroup,
    ]);


  /*
  =========================================================
  제품선택 초기화
  =========================================================
  */
  function clearProduct() {
    setSelected(null);

    setSearch("");

    setLimit(
      PAGE_SIZE
    );

    if (onSelect) {
      onSelect(null);
    }
  }


  /*
  =========================================================
  제조사
  =========================================================
  */
  function chooseBrand(
    value
  ) {
    setBrand(value);

    setGroupPrefix("");

    setDetail("");

    clearProduct();
  }


  /*
  =========================================================
  제품군
  =========================================================
  */
  function chooseGroup(
    value
  ) {
    setGroupPrefix(
      value
    );

    setDetail("");

    clearProduct();
  }


  /*
  =========================================================
  수종 / 색상
  =========================================================
  */
  function chooseDetail(
    value
  ) {
    setDetail(value);

    clearProduct();
  }


  /*
  =========================================================
  제품 선택
  =========================================================
  */
  function chooseProduct(
    product
  ) {
    setSelected(
      product
    );

    if (onSelect) {
      onSelect(
        product
      );
    }
  }


  /*
  =========================================================
  제품 카드 설명
  =========================================================
  */
  function getProductInfo(
    product
  ) {
    const group =
      getProductGroup(
        product.product_code
      );

    if (
      group?.filter ===
      "wood"
    ) {
      return [
        product.wood_species,
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


  /*
  =========================================================
  화면
  =========================================================
  */
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
      <h2
        style={{
          margin: 0,
        }}
      >
        가상 시공 필름 선택
      </h2>


      <p
        style={{
          color: "#6b7280",
          lineHeight: 1.6,
        }}
      >
        제조사와 필름 제품군을
        선택한 후{" "}
        {selectedGroup?.filter ===
        "wood"
          ? "수종을"
          : "색상 계열을"}{" "}
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


      {!loading &&
        !message && (
          <>

            {/* ========================= */}
            {/* 1. 제조사 */}
            {/* ========================= */}

            <Options
              title="1. 제조사"
              items={
                brands.map(
                  (value) => ({
                    value,
                    label: value,
                  })
                )
              }
              value={brand}
              onChange={
                chooseBrand
              }
            />


            {/* ========================= */}
            {/* 2. 제품군 */}
            {/* ========================= */}

            {brand && (
              <Options
                title="2. 필름 패턴"
                items={
                  availableGroups.map(
                    (group) => ({
                      value:
                        group.prefix,

                      label:
                        group.label,
                    })
                  )
                }
                value={
                  groupPrefix
                }
                onChange={
                  chooseGroup
                }
              />
            )}


            {/* ========================= */}
            {/* 3. 수종 / 색상 */}
            {/* ========================= */}

            {brand &&
              selectedGroup && (
                <Options
                  title={
                    selectedGroup.filter ===
                    "wood"
                      ? "3. 수종"
                      : "3. 색상 계열"
                  }
                  items={
                    details.map(
                      (value) => ({
                        value,
                        label:
                          value,
                      })
                    )
                  }
                  value={
                    detail
                  }
                  onChange={
                    chooseDetail
                  }
                />
              )}


            {/* ========================= */}
            {/* 제품 검색 */}
            {/* ========================= */}

            {brand &&
              selectedGroup && (
                <input
                  value={search}

                  onChange={(
                    event
                  ) => {
                    setSearch(
                      event
                        .target
                        .value
                    );

                    setLimit(
                      PAGE_SIZE
                    );
                  }}

                  placeholder={
                    selectedGroup.filter ===
                    "wood"
                      ? `제품번호 검색 (예: ${groupPrefix}03)`
                      : groupPrefix ===
                        "S"
                      ? "제품번호 검색 (예: S245)"
                      : "제품번호 검색"
                  }

                  style={{
                    width:
                      "100%",

                    marginTop:
                      "18px",

                    padding:
                      "13px",

                    border:
                      "1px solid #d1d5db",

                    borderRadius:
                      "12px",

                    boxSizing:
                      "border-box",

                    fontSize:
                      "16px",
                  }}
                />
              )}


            {/* ========================= */}
            {/* 결과 */}
            {/* ========================= */}

            {(detail ||
              search.trim()) &&
              selectedGroup && (
                <>

                  <div
                    style={{
                      marginTop:
                        "16px",

                      color:
                        "#6b7280",

                      fontSize:
                        "14px",
                    }}
                  >
                    제품{" "}

                    <strong
                      style={{
                        color:
                          "#111827",
                      }}
                    >
                      {
                        matches.length
                      }
                      개
                    </strong>
                  </div>


                  <div
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "repeat(2, minmax(0, 1fr))",

                      gap:
                        "10px",

                      marginTop:
                        "10px",
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

                                  fontSize:
                                    "15px",
                                }}
                              >
                                {
                                  product.product_code
                                }
                              </strong>


                              {product.product_name && (
                                <span
                                  style={{
                                    display:
                                      "block",

                                    marginTop:
                                      "2px",

                                    color:
                                      "#374151",

                                    fontSize:
                                      "12px",

                                    fontWeight:
                                      "bold",
                                  }}
                                >
                                  {
                                    product.product_name
                                  }
                                </span>
                              )}


                              <span
                                style={{
                                  display:
                                    "block",

                                  marginTop:
                                    "3px",

                                  color:
                                    "#6b7280",

                                  fontSize:
                                    "12px",

                                  lineHeight:
                                    1.4,
                                }}
                              >
                                {getProductInfo(
                                  product
                                )}
                              </span>

                            </button>
                          );
                        }
                      )}

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
                          "12px",

                        padding:
                          "13px",

                        border:
                          "1px solid #d1d5db",

                        borderRadius:
                          "12px",

                        background:
                          "#ffffff",

                        fontWeight:
                          "bold",

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


            {/* ========================= */}
            {/* 선택 제품 */}
            {/* ========================= */}

            {selected && (
              <div
                style={{
                  marginTop:
                    "18px",

                  padding:
                    "15px",

                  borderRadius:
                    "14px",

                  background:
                    "#f3f4f6",
                }}
              >

                <div
                  style={{
                    color:
                      "#6b7280",

                    fontSize:
                      "13px",

                    lineHeight:
                      1.5,
                  }}
                >
                  {
                    selected.brand
                  }

                  {" 〉 "}

                  {
                    selectedGroup
                      ?.label
                  }

                  {" 〉 "}

                  {selectedGroup
                    ?.filter ===
                  "wood"
                    ? selected.wood_species
                    : selected.color_family}
                </div>


                <div
                  style={{
                    marginTop:
                      "5px",

                    fontSize:
                      "20px",

                    fontWeight:
                      "bold",
                  }}
                >
                  {
                    selected.product_code
                  }
                </div>


                {selected.product_name && (
                  <div
                    style={{
                      marginTop:
                        "3px",

                      color:
                        "#374151",

                      fontWeight:
                        "bold",
                    }}
                  >
                    {
                      selected.product_name
                    }
                  </div>
                )}


                <div
                  style={{
                    marginTop:
                      "5px",

                    color:
                      "#4b5563",

                    lineHeight:
                      1.6,
                  }}
                >

                  {selectedGroup
                    ?.filter ===
                    "wood" &&
                    selected.wood_species && (
                      <>
                        수종:{" "}
                        <strong>
                          {
                            selected.wood_species
                          }
                        </strong>

                        <br />
                      </>
                    )}


                  {selected.color_family && (
                    <>
                      색상:{" "}
                      {
                        selected.color_family
                      }
                    </>
                  )}


                  {selected.color_description && (
                    <>
                      <br />

                      {
                        selected.color_description
                      }
                    </>
                  )}

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
                      width:
                        "100%",

                      marginTop:
                        "14px",

                      padding:
                        "15px",

                      border:
                        "none",

                      borderRadius:
                        "12px",

                      background:
                        "#111827",

                      color:
                        "#ffffff",

                      fontSize:
                        "17px",

                      fontWeight:
                        "bold",

                      cursor:
                        "pointer",
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
