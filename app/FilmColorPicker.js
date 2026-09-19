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
 * 2단계 - 큰 패턴 이름
 * =========================================================
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
  super_matt: "슈퍼매트",
  texture: "텍스쳐",
};


/*
 * =========================================================
 * 3단계 - 세부 제품군 이름
 * =========================================================
 */
const GRADE_NAME = {
  wood: "우드",
  long_wood: "롱우드",
  special_wood: "스페셜우드",
  premium_wood: "프리미엄우드",
  optical_grain_wood:
    "옵티컬 그레인 우드",

  painted_wood:
    "페인티드우드",

  premium_painted_wood:
    "프리미엄페인티드우드",

  super_white_wood:
    "슈퍼화이트우드",

  solid: "솔리드",

  mono_blanc:
    "모노블랑",

  easy_clean_film:
    "이지클린필름",

  stone_marble:
    "스톤앤마블",

  premium_marble:
    "프리미엄마블",

  real_marble:
    "리얼마블",

  premium_painted_concrete:
    "프리미엄페인티드콘크리트",

  velvet_metal:
    "벨벳메탈",

  high_gloss_metal:
    "고광택메탈",

  gold: "골드",

  soft_fabric:
    "소프트페브릭",

  natural_fabric:
    "네츄럴페브릭",

  real_fabric:
    "리얼페브릭",

  soft_leather:
    "소프트레더",

  super_matt:
    "슈퍼매트",

  texture_film:
    "텍스쳐필름",

  exterior_film:
    "외장용필름",
};


/*
 * =========================================================
 * 자연우드 제품군
 *
 * 이 제품군들은 마지막 단계에서
 * color_family가 아니라 wood_species를 사용
 * =========================================================
 */
const NATURAL_WOOD_GRADES =
  new Set([
    "wood",
    "long_wood",
    "special_wood",
    "premium_wood",
    "optical_grain_wood",
  ]);


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
 * 공통 선택 버튼
 * =========================================================
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

  const [
    brand,
    setBrand,
  ] = useState("");

  /*
   * 2단계
   * wood / solid / marble...
   */
  const [
    texture,
    setTexture,
  ] = useState("");

  /*
   * 3단계
   * special_wood / premium_wood...
   */
  const [
    grade,
    setGrade,
  ] = useState("");

  /*
   * 마지막 단계
   * 수종 또는 색상
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
   * =========================================================
   * Supabase 제품 불러오기
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
          .order("texture")
          .order("grade")
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
         * 제조사가 하나면
         * 자동 선택
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
   * =========================================================
   * 제조사
   * =========================================================
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
   * =========================================================
   * 2단계
   *
   * 제조사 선택 후
   * 큰 패턴
   *
   * 우드
   * 솔리드
   * 마블
   * 메탈
   * 패브릭
   * ...
   * =========================================================
   */
  const textures =
    useMemo(() => {

      if (!brand) {
        return [];
      }

      return unique(
        products
          .filter(
            (item) =>
              item.brand ===
              brand
          )
          .map(
            (item) =>
              item.texture
          )
      );

    }, [
      brand,
      products,
    ]);


  /*
   * =========================================================
   * 3단계 제품군
   *
   * 우드 선택 시:
   *
   * 우드
   * 롱우드
   * 스페셜우드
   * 프리미엄우드
   * 옵티컬그레인우드
   * 페인티드우드
   * 프리미엄페인티드우드
   * 슈퍼화이트우드
   *
   * 다른 패턴도
   * grade가 여러 개면
   * 해당 제품군 표시
   * =========================================================
   */
  const grades =
    useMemo(() => {

      if (
        !brand ||
        !texture
      ) {
        return [];
      }

      return unique(
        products
          .filter(
            (item) =>
              item.brand ===
                brand &&
              item.texture ===
                texture
          )
          .map(
            (item) =>
              item.grade
          )
      );

    }, [
      brand,
      texture,
      products,
    ]);


  /*
   * =========================================================
   * grade가 하나뿐이면
   * 자동 선택
   *
   * 예:
   * 솔리드 안에 실제 grade가
   * solid 하나뿐이면
   * 고객이 한번 더 누를 필요 없음
   * =========================================================
   */
  useEffect(() => {

    if (
      texture &&
      grades.length === 1
    ) {

      if (
        grade !==
        grades[0]
      ) {

        setGrade(
          grades[0]
        );

        setDetail("");

        setSelected(
          null
        );

        setSearch("");

        setLimit(
          PAGE_SIZE
        );
      }

    }

  }, [
    texture,
    grades,
    grade,
  ]);


  /*
   * =========================================================
   * 자연우드 여부
   * =========================================================
   */
  const isNaturalWood =
    NATURAL_WOOD_GRADES.has(
      grade
    );


  /*
   * =========================================================
   * 마지막 단계
   *
   * 자연우드:
   * wood_species
   *
   * 나머지:
   * color_family
   * =========================================================
   */
  const details =
    useMemo(() => {

      if (
        !brand ||
        !texture ||
        !grade
      ) {
        return [];
      }

      const rows =
        products.filter(
          (item) =>
            item.brand ===
              brand &&
            item.texture ===
              texture &&
            item.grade ===
              grade
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
      texture,
      grade,
      products,
    ]);


  /*
   * =========================================================
   * 검색 결과
   * =========================================================
   */
  const matches =
    useMemo(() => {

      const keyword =
        search
          .trim()
          .toLowerCase();

      return products.filter(
        (item) => {

          /*
           * 제조사
           */
          if (
            item.brand !==
            brand
          ) {
            return false;
          }

          /*
           * 큰 패턴
           */
          if (
            item.texture !==
            texture
          ) {
            return false;
          }

          /*
           * 세부 제품군
           */
          if (
            item.grade !==
            grade
          ) {
            return false;
          }

          /*
           * 수종 / 색상
           */
          if (detail) {

            if (
              NATURAL_WOOD_GRADES.has(
                grade
              )
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
           * 아무것도 선택하지 않고
           * 검색도 없으면
           * 제품 숨김
           */
          if (
            !detail &&
            !keyword
          ) {
            return false;
          }

          /*
           * 검색어 없으면
           * 필터된 제품 표시
           */
          if (!keyword) {
            return true;
          }

          /*
           * 제품번호
           * 제품명
           * 색상
           * 수종
           * 설명
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
      brand,
      texture,
      grade,
      detail,
      search,
      products,
    ]);


  /*
   * =========================================================
   * 초기화
   * =========================================================
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
   * =========================================================
   * 제조사 선택
   * =========================================================
   */
  function chooseBrand(
    value
  ) {

    setBrand(value);

    setTexture("");

    setGrade("");

    setDetail("");

    clearProduct();
  }


  /*
   * =========================================================
   * 큰 패턴 선택
   * =========================================================
   */
  function chooseTexture(
    value
  ) {

    setTexture(value);

    setGrade("");

    setDetail("");

    clearProduct();
  }


  /*
   * =========================================================
   * 제품군 선택
   * =========================================================
   */
  function chooseGrade(
    value
  ) {

    setGrade(value);

    setDetail("");

    clearProduct();
  }


  /*
   * =========================================================
   * 수종 / 색상 선택
   * =========================================================
   */
  function chooseDetail(
    value
  ) {

    setDetail(value);

    clearProduct();
  }


  /*
   * =========================================================
   * 제품 선택
   * =========================================================
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
   * =========================================================
   * 제품 카드 설명
   * =========================================================
   */
  function productInfo(
    product
  ) {

    if (
      NATURAL_WOOD_GRADES.has(
        product.grade
      )
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
        제조사와 필름 패턴을
        선택한 후 제품군과
        색상 또는 수종을
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
          }}
        >
          {message}
        </p>
      )}


      {!loading &&
        !message && (
          <>

            {/* ============================= */}
            {/* 1. 제조사 */}
            {/* ============================= */}

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


            {/* ============================= */}
            {/* 2. 큰 패턴 */}
            {/* ============================= */}

            {brand && (
              <Options
                title="2. 필름 패턴"
                items={
                  textures.map(
                    (value) => ({
                      value,
                      label:
                        TYPE_NAME[
                          value
                        ] ||
                        value,
                    })
                  )
                }
                value={texture}
                onChange={
                  chooseTexture
                }
              />
            )}


            {/* ============================= */}
            {/* 3. 제품군 */}
            {/* ============================= */}

            {brand &&
              texture &&
              grades.length >
                1 && (
                <Options
                  title="3. 제품군"
                  items={
                    grades.map(
                      (
                        value
                      ) => ({
                        value,
                        label:
                          GRADE_NAME[
                            value
                          ] ||
                          value,
                      })
                    )
                  }
                  value={grade}
                  onChange={
                    chooseGrade
                  }
                />
              )}


            {/* ============================= */}
            {/* 마지막 단계 */}
            {/* ============================= */}

            {brand &&
              texture &&
              grade && (
                <Options
                  title={
                    grades.length >
                    1
                      ? isNaturalWood
                        ? "4. 수종"
                        : "4. 색상 계열"
                      : isNaturalWood
                      ? "3. 수종"
                      : "3. 색상 계열"
                  }
                  items={
                    details.map(
                      (
                        value
                      ) => ({
                        value,
                        label:
                          value,
                      })
                    )
                  }
                  value={detail}
                  onChange={
                    chooseDetail
                  }
                />
              )}


            {/* ============================= */}
            {/* 검색 */}
            {/* ============================= */}

            {brand &&
              texture &&
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
                      ? "제품번호 검색 (예: SPW03)"
                      : "제품번호 검색 (예: S245)"
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


            {/* ============================= */}
            {/* 제품 결과 */}
            {/* ============================= */}

            {(detail ||
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

                                  fontSize:
                                    "12px",

                                  fontWeight:
                                    "bold",

                                  color:
                                    "#374151",
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
                              {productInfo(
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


            {/* ============================= */}
            {/* 선택 제품 */}
            {/* ============================= */}

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

                  {TYPE_NAME[
                    selected.texture
                  ] ||
                    selected.texture}

                  {" 〉 "}

                  {GRADE_NAME[
                    selected.grade
                  ] ||
                    selected.grade}

                  {" 〉 "}

                  {isNaturalWood
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

                  {NATURAL_WOOD_GRADES.has(
                    selected.grade
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
