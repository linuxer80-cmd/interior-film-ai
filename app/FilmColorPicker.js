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
 * 제품군 표시 이름
 * =========================================================
 */
const GRADE_NAME = {
  gold: "골드",
  mono_blanc: "모노블랑",
  texture_film: "텍스쳐필름",
  easy_clean_film: "이지클린필름",
  exterior_film: "외장용필름",

  long_wood: "롱우드",
  natural_fabric: "네츄럴페브릭",
  stone_marble: "스톤앤마블",
  optical_grain_wood: "옵티컬 그레인 우드",

  premium_marble: "프리미엄마블",
  premium_painted_concrete:
    "프리미엄페인티드콘크리트",

  premium_painted_wood:
    "프리미엄페인티드우드",

  painted_wood: "페인티드우드",

  real_fabric: "리얼페브릭",
  real_marble: "리얼마블",

  solid: "솔리드",

  soft_fabric: "소프트페브릭",
  soft_leather: "소프트레더",

  super_matt: "슈퍼매트",

  special_wood: "스페셜우드",

  high_gloss_metal: "고광택메탈",
  velvet_metal: "벨벳메탈",

  wood: "우드",

  super_white_wood: "슈퍼화이트우드",

  premium_wood: "프리미엄우드",
};

/*
 * grade 값이 없거나 예상하지 못한 경우
 * texture 표시용
 */
const TYPE_NAME = {
  solid: "솔리드",
  wood: "우드",
  marble: "마블",
  metal: "메탈",
  leather: "가죽",
  stone: "스톤",
  fabric: "패브릭",
  concrete: "콘크리트",
  exterior: "외장용",
  texture: "텍스쳐",
  super_matt: "슈퍼매트",
};

/*
 * =========================================================
 * 수종으로 선택할 자연우드 제품군
 * =========================================================
 *
 * 페인티드우드 계열은 여기에 넣지 않는다.
 *
 * PTW / PNT / ZSW 등은
 * 기존 color_family를 사용한다.
 */
const NATURAL_WOOD_GRADES = new Set([
  "wood",
  "long_wood",
  "special_wood",
  "premium_wood",
  "optical_grain_wood",
]);

const unique = (values) => [
  ...new Set(
    values.filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    )
  ),
];

/*
 * =========================================================
 * 공통 선택 버튼
 * =========================================================
 */
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

/*
 * =========================================================
 * 메인 컴포넌트
 * =========================================================
 */
export default function FilmColorPicker({
  onSelect,
  onGenerate,
}) {
  const [products, setProducts] =
    useState([]);

  const [brand, setBrand] =
    useState("");

  /*
   * 기존 texture 대신
   * 실제 선택 UI에서는 grade를 사용한다.
   */
  const [grade, setGrade] =
    useState("");

  /*
   * 자연우드일 경우:
   * family = wood_species
   *
   * 나머지:
   * family = color_family
   */
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

  /*
   * =========================================================
   * DB 제품 불러오기
   * =========================================================
   */
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setMessage("");

      const { data, error } =
        await supabase
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
              "sample_image_path",
              "material_price_per_meter",
              "price_multiplier",
              "additional_cost",
              "sort_order",
            ].join(",")
          )
          .eq("is_active", true)
          .order("brand")
          .order("grade")
          .order("sort_order");

      if (!mounted) return;

      if (error) {
        console.error(error);

        setMessage(
          `필름 제품을 불러오지 못했습니다. ${error.message || ""}`
        );

        setProducts([]);
      } else {
        const rows = data || [];

        setProducts(rows);

        const brandList = unique(
          rows.map(
            (item) => item.brand
          )
        );

        /*
         * 제조사가 하나뿐이면 자동선택
         */
        if (
          brandList.length === 1
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
   * 제조사 목록
   * =========================================================
   */
  const brands = useMemo(
    () =>
      unique(
        products.map(
          (item) => item.brand
        )
      ),
    [products]
  );

  /*
   * =========================================================
   * 선택한 제조사의 제품군 목록
   * =========================================================
   */
  const grades = useMemo(() => {
    if (!brand) {
      return [];
    }

    return unique(
      products
        .filter(
          (item) =>
            item.brand === brand
        )
        .map((item) => {
          /*
           * grade가 있으면 grade 사용
           * 혹시 없는 데이터는 texture 사용
           */
          return (
            item.grade ||
            item.texture
          );
        })
    );
  }, [
    brand,
    products,
  ]);

  /*
   * 제품군이 하나뿐이면 자동 선택
   */
  useEffect(() => {
    if (
      grades.length === 1 &&
      !grade
    ) {
      setGrade(
        grades[0]
      );
    }
  }, [
    grade,
    grades,
  ]);

  /*
   * =========================================================
   * 현재 제품군이 자연우드인지 확인
   * =========================================================
   */
  const isNaturalWood =
    NATURAL_WOOD_GRADES.has(
      grade
    );

  /*
   * =========================================================
   * 3단계 선택 목록
   *
   * 자연우드:
   * wood_species
   *
   * 그 외:
   * color_family
   * =========================================================
   */
  const families = useMemo(() => {
    if (
      !brand ||
      !grade
    ) {
      return [];
    }

    const rows =
      products.filter(
        (item) => {
          const itemGrade =
            item.grade ||
            item.texture;

          return (
            item.brand === brand &&
            itemGrade === grade
          );
        }
      );

    if (
      NATURAL_WOOD_GRADES.has(
        grade
      )
    ) {
      return unique(
        rows.map(
          (item) =>
            item.wood_species
        )
      );
    }

    return unique(
      rows.map(
        (item) =>
          item.color_family
      )
    );
  }, [
    brand,
    grade,
    products,
  ]);

  /*
   * =========================================================
   * 필터된 제품
   * =========================================================
   */
  const matches = useMemo(() => {
    const keyword = search
      .trim()
      .toLowerCase();

    return products.filter(
      (item) => {
        const itemGrade =
          item.grade ||
          item.texture;

        /*
         * 제조사
         */
        if (
          item.brand !== brand
        ) {
          return false;
        }

        /*
         * 제품군
         */
        if (
          itemGrade !== grade
        ) {
          return false;
        }

        /*
         * 3단계 필터
         */
        if (family) {
          if (
            NATURAL_WOOD_GRADES.has(
              grade
            )
          ) {
            if (
              item.wood_species !==
              family
            ) {
              return false;
            }
          } else {
            if (
              item.color_family !==
              family
            ) {
              return false;
            }
          }
        }

        /*
         * 수종/색상도 선택하지 않았고
         * 검색어도 없으면
         * 제품목록을 아직 보여주지 않는다.
         */
        if (
          !family &&
          !keyword
        ) {
          return false;
        }

        /*
         * 검색어 없으면
         * 현재 필터에 맞는 제품 전부
         */
        if (!keyword) {
          return true;
        }

        /*
         * 제품번호 / 제품명 /
         * 설명 / 색상 / 수종 검색
         */
        return [
          item.product_code,
          item.product_name,
          item.color_description,
          item.color_family,
          item.wood_species,
          item.grade,
          item.texture,
        ]
          .filter(Boolean)
          .some((text) =>
            String(text)
              .toLowerCase()
              .includes(
                keyword
              )
          );
      }
    );
  }, [
    brand,
    family,
    grade,
    products,
    search,
  ]);

  /*
   * =========================================================
   * 제품 선택 초기화
   * =========================================================
   */
  function resetProduct() {
    setSelected(null);
    setSearch("");
    setLimit(PAGE_SIZE);

    /*
     * 부모 selectedFilm도
     * 초기화할 수 있도록 null 전달
     */
    if (onSelect) {
      onSelect(null);
    }
  }

  /*
   * =========================================================
   * 제조사 선택
   * =========================================================
   */
  function chooseBrand(value) {
    setBrand(value);
    setGrade("");
    setFamily("");
    resetProduct();
  }

  /*
   * =========================================================
   * 제품군 선택
   * =========================================================
   */
  function chooseGrade(value) {
    setGrade(value);
    setFamily("");
    resetProduct();
  }

  /*
   * =========================================================
   * 수종 / 색상 선택
   * =========================================================
   */
  function chooseFamily(value) {
    setFamily(value);
    resetProduct();
  }

  /*
   * =========================================================
   * 제품 선택
   * =========================================================
   */
  function chooseProduct(product) {
    setSelected(product);

    if (onSelect) {
      onSelect(product);
    }
  }

  /*
   * =========================================================
   * 제품군 이름
   * =========================================================
   */
  function getGradeName(value) {
    return (
      GRADE_NAME[value] ||
      TYPE_NAME[value] ||
      value
    );
  }

  /*
   * =========================================================
   * 카드 보조정보
   * =========================================================
   */
  function getProductInfo(
    product
  ) {
    if (
      NATURAL_WOOD_GRADES.has(
        product.grade ||
          product.texture
      )
    ) {
      const parts = [
        product.wood_species,
        product.color_family,
      ].filter(Boolean);

      if (parts.length) {
        return parts.join(" · ");
      }
    }

    return (
      product.color_description ||
      product.color_family ||
      product.product_name ||
      ""
    );
  }

  /*
   * =========================================================
   * 화면
   * =========================================================
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
        {isNaturalWood
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
            {/* 제조사 */}
            <Options
              title="1. 제조사"
              items={brands.map(
                (value) => ({
                  value,
                  label: value,
                })
              )}
              value={brand}
              onChange={
                chooseBrand
              }
            />

            {/* 제품군 */}
            {brand && (
              <Options
                title="2. 필름 패턴"
                items={grades.map(
                  (value) => ({
                    value,
                    label:
                      getGradeName(
                        value
                      ),
                  })
                )}
                value={grade}
                onChange={
                  chooseGrade
                }
              />
            )}

            {/* 수종 또는 색상 */}
            {brand &&
              grade && (
                <Options
                  title={
                    isNaturalWood
                      ? "3. 수종"
                      : "3. 색상 계열"
                  }
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

            {/* 제품번호 검색 */}
            {brand &&
              grade && (
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
                    isNaturalWood
                      ? "제품번호 또는 수종 검색 (예: SPW03, 오크)"
                      : "제품번호 검색 (예: S245)"
                  }
                  style={{
                    width: "100%",
                    marginTop:
                      "18px",
                    padding: "13px",
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

            {/* 제품 목록 */}
            {(family ||
              search.trim()) && (
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
                  검색 결과{" "}
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
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(2, minmax(0, 1fr))",
                    gap: "10px",
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
                    조건에 맞는
                    제품이 없습니다.
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
                      width: "100%",
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

            {/* 선택 제품 */}
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
                  {getGradeName(
                    selected.grade ||
                      selected.texture
                  )}
                  {" 〉 "}
                  {NATURAL_WOOD_GRADES.has(
                    selected.grade ||
                      selected.texture
                  )
                    ? selected.wood_species ||
                      selected.color_family
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
                      1.5,
                  }}
                >
                  {NATURAL_WOOD_GRADES.has(
                    selected.grade ||
                      selected.texture
                  ) &&
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
