"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

import FilmColorPicker from "./FilmColorPicker";
import VirtualInstallPanel from "./VirtualInstallPanel";

import EstimatePhotoUploader from "./components/EstimatePhotoUploader";
import EstimateResult from "./components/EstimateResult";
import EstimateTotal from "./components/EstimateTotal";
import ServiceSelector from "./components/ServiceSelector";
import FilmPriceSelector from "./components/FilmPriceSelector";
import FilmAdjustedEstimate from "./components/FilmAdjustedEstimate";
import LeadForm from "./components/LeadForm";
import VirtualToneSelector from "./components/VirtualToneSelector";

import useEstimate from "./hooks/useEstimate";

import {
  adjustEstimateByFilm,
} from "./utils/estimatePrice";

export default function Home() {
  /*
   * =========================================================
   * AI 자동견적
   * =========================================================
   */

  const {
    images,
    loading,
    imageLoading,
    message,
    groups,
    totalEstimate,

    usageIdRef,
    estimatePhotoPathsRef,

    addImages,
    removeImage,
    handleAnalyze,

    readJsonSafely,
  } = useEstimate();

  /*
   * =========================================================
   * 화면 상태
   * =========================================================
   */

  const [resultMode, setResultMode] =
    useState("");

  const [
    selectedFilm,
    setSelectedFilm,
  ] = useState(null);

  /*
   * 기본 시공조건 = 비방염
   */

  const [fireType, setFireType] =
    useState("non_fire");

  /*
   * 부분 톤 상태
   */

  const [
    useSplitTone,
    setUseSplitTone,
  ] = useState(false);

  const [
    areaFilms,
    setAreaFilms,
  ] = useState({});

  /*
   * =========================================================
   * 상담 신청 상태
   * =========================================================
   */

  const [
    customerName,
    setCustomerName,
  ] = useState("");

  const [phone, setPhone] =
    useState("");

  const [region, setRegion] =
    useState("");

  const [
    privacyAgree,
    setPrivacyAgree,
  ] = useState(false);

  const [
    leadLoading,
    setLeadLoading,
  ] = useState(false);

  const [
    leadComplete,
    setLeadComplete,
  ] = useState(false);

  const [
    leadMessage,
    setLeadMessage,
  ] = useState("");

  /*
   * =========================================================
   * 전화번호 자동 형식
   * =========================================================
   */

  function handlePhoneChange(
    value
  ) {
    const numbers = String(
      value || ""
    )
      .replace(
        /[^0-9]/g,
        ""
      )
      .slice(0, 11);

    if (
      numbers.length <= 3
    ) {
      setPhone(numbers);

      return;
    }

    if (
      numbers.length <= 7
    ) {
      setPhone(
        `${numbers.slice(
          0,
          3
        )}-${numbers.slice(
          3
        )}`
      );

      return;
    }

    setPhone(
      `${numbers.slice(
        0,
        3
      )}-${numbers.slice(
        3,
        7
      )}-${numbers.slice(7)}`
    );
  }

  /*
   * =========================================================
   * 필름 선택
   * =========================================================
   */

  async function handleFilmSelect(
    film
  ) {
    if (!film) {
      setSelectedFilm(null);

      return;
    }

    let completedFilm = {
      ...film,
    };

    const alreadyHasPrice =
      Number(
        film.fire_price_per_meter ||
          0
      ) > 0 ||
      Number(
        film.non_fire_price_per_meter ||
          0
      ) > 0;

    /*
     * FilmColorPicker에서 가격이
     * 전달되지 않은 경우 DB 재조회
     */

    if (!alreadyHasPrice) {
      try {
        let query =
          supabase
            .from(
              "film_products"
            )
            .select(
              `
                id,
                fire_price_per_meter,
                non_fire_price_per_meter
              `
            );

        if (film.id) {
          query =
            query.eq(
              "id",
              film.id
            );
        } else {
          query =
            query
              .eq(
                "brand",
                film.brand
              )
              .eq(
                "product_code",
                film.product_code
              );
        }

        const {
          data,
          error,
        } =
          await query
            .limit(1)
            .maybeSingle();

        if (error) {
          console.error(
            "필름 가격 조회 오류:",
            error
          );
        }

        if (data) {
          completedFilm = {
            ...film,
            ...data,
          };
        }
      } catch (error) {
        console.error(
          "필름 가격 조회 오류:",
          error
        );
      }
    }

    /*
     * 가격까지 합쳐진 필름정보 저장
     */

    setSelectedFilm(
      completedFilm
    );

    /*
     * 선택한 제품이
     * 비방염/방염 중 한 종류만 존재하면
     * 가능한 조건으로 자동 선택
     */

    const hasNonFire =
      Number(
        completedFilm.non_fire_price_per_meter ||
          0
      ) > 0;

    const hasFire =
      Number(
        completedFilm.fire_price_per_meter ||
          0
      ) > 0;

    if (
      !hasNonFire &&
      hasFire
    ) {
      setFireType("fire");
    } else if (
      hasNonFire &&
      !hasFire
    ) {
      setFireType(
        "non_fire"
      );
    }
  }

  /*
   * =========================================================
   * 부분시공 부위 → 필름 연결
   * =========================================================
   *
   * 기본 선택:
   *   selectedFilm
   *
   * 부위별 다르게:
   *   areaFilms.upper
   *   areaFilms.lower
   *   areaFilms.fridge
   *   areaFilms.tall
   *   areaFilms.pantry
   *   areaFilms.island
   *   areaFilms.door_leaf
   *   areaFilms.door_frame
   *
   * AI 그룹이 "싱크대/주방가구"처럼 하나로 묶여 있는 경우에는
   * 해당 주방 부위들의 평균 자재단가를 사용한다.
   */

  function normalizeGroupText(group) {
    return [
      group?.key,
      group?.category,
      group?.subCategory,
      group?.sub_category,
      group?.name,
      group?.label,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function getAreaKeyForGroup(group) {
    const text =
      normalizeGroupText(group);

    if (
      text.includes("냉장고장") ||
      text.includes("냉장고")
    ) {
      return "fridge";
    }

    if (
      text.includes("키큰장") ||
      text.includes("키높이장") ||
      text.includes("톨장")
    ) {
      return "tall";
    }

    if (
      text.includes("팬트리") ||
      text.includes("펜트리")
    ) {
      return "pantry";
    }

    if (
      text.includes("아일랜드")
    ) {
      return "island";
    }

    if (
      text.includes("상부장") ||
      text.includes("상부")
    ) {
      return "upper";
    }

    if (
      text.includes("하부장") ||
      text.includes("하부")
    ) {
      return "lower";
    }

    if (
      text.includes("문틀") ||
      text.includes("도어프레임") ||
      text.includes("doorframe")
    ) {
      return "door_frame";
    }

    if (
      text.includes("문짝") ||
      text.includes("도어짝") ||
      text.includes("doorleaf")
    ) {
      return "door_leaf";
    }

    return "";
  }

  function getFilmPriceValue(
    film,
    type
  ) {
    if (!film) {
      return 0;
    }

    if (type === "fire") {
      return Number(
        film.fire_price_per_meter ||
          0
      );
    }

    return Number(
      film.non_fire_price_per_meter ||
        0
    );
  }

  function makeAverageFilm(
    films
  ) {
    const validFilms = films.filter(
      Boolean
    );

    if (!validFilms.length) {
      return selectedFilm;
    }

    const averagePrice = (
      type
    ) => {
      const prices =
        validFilms
          .map((film) =>
            getFilmPriceValue(
              film,
              type
            )
          )
          .filter(
            (price) => price > 0
          );

      if (!prices.length) {
        return 0;
      }

      return (
        prices.reduce(
          (sum, price) =>
            sum + price,
          0
        ) / prices.length
      );
    };

    return {
      ...selectedFilm,

      fire_price_per_meter:
        averagePrice("fire"),

      non_fire_price_per_meter:
        averagePrice(
          "non_fire"
        ),
    };
  }

  function getKitchenAverageFilm() {
    const keys = [
      "upper",
      "lower",
      "fridge",
      "tall",
      "pantry",
      "island",
    ];

    /*
     * 싱크대 기본은 상부장 + 하부장.
     * 추가 부위가 실제 선택되어 있으면 함께 계산.
     */
    const activeKeys = [
      "upper",
      "lower",
      ...keys.filter(
        (key) =>
          ![
            "upper",
            "lower",
          ].includes(key) &&
          areaFilms?.[key]
      ),
    ];

    const films =
      activeKeys.map(
        (key) =>
          areaFilms?.[key] ||
          selectedFilm
      );

    return makeAverageFilm(
      films
    );
  }

  function getDoorAverageFilm() {
    return makeAverageFilm([
      areaFilms?.door_leaf ||
        selectedFilm,
      areaFilms?.door_frame ||
        selectedFilm,
    ]);
  }

  function getFilmForGroup(
    group
  ) {
    if (!selectedFilm) {
      return null;
    }

    if (!useSplitTone) {
      return selectedFilm;
    }

    const areaKey =
      getAreaKeyForGroup(group);

    if (
      areaKey &&
      areaFilms?.[areaKey]
    ) {
      return areaFilms[areaKey];
    }

    const text =
      normalizeGroupText(group);

    /*
     * AI가 상부/하부를 나누지 않고
     * 싱크대·주방가구 한 그룹으로 분석한 경우
     */
    if (
      text.includes("싱크대") ||
      text.includes("주방가구") ||
      text.includes("주방장")
    ) {
      return getKitchenAverageFilm();
    }

    /*
     * AI가 문짝/문틀을 한 그룹으로 분석한 경우
     */
    if (
      text.includes("문") ||
      text.includes("도어")
    ) {
      const hasDoorOverride =
        areaFilms?.door_leaf ||
        areaFilms?.door_frame;

      if (hasDoorOverride) {
        return getDoorAverageFilm();
      }
    }

    return selectedFilm;
  }

  /*
   * =========================================================
   * 선택 필름 적용 부위별 수정견적
   * =========================================================
   */

  const displayGroups =
    groups.map((group) => {
      if (!group.estimate) {
        return group;
      }

      const filmForGroup =
        getFilmForGroup(group);

      if (!filmForGroup) {
        return group;
      }

      return {
        ...group,

        estimate: {
          ...group.estimate,

          min:
            adjustEstimateByFilm(
              group.estimate.min,
              filmForGroup,
              fireType
            ),

          max:
            adjustEstimateByFilm(
              group.estimate.max,
              filmForGroup,
              fireType
            ),

          average:
            adjustEstimateByFilm(
              group.estimate
                .average,
              filmForGroup,
              fireType
            ),
        },

        /*
         * 화면/상담 저장에서 필요할 때
         * 어떤 필름으로 계산됐는지 확인 가능
         */
        appliedFilm:
          filmForGroup,
      };
    });

  /*
   * =========================================================
   * 부위별 수정견적 → 총 수정견적
   * =========================================================
   *
   * 중요:
   * 예전에는 totalEstimate 전체에 selectedFilm 하나만 적용했다.
   * 이제는 각 부위에 적용된 수정금액을 먼저 계산하고 합산한다.
   */

  const estimatedGroups =
    displayGroups.filter(
      (group) =>
        group?.estimate &&
        Number.isFinite(
          Number(
            group.estimate.average
          )
        )
    );

  const hasAdjustedGroups =
    estimatedGroups.length > 0;

  const sumEstimateField = (
    field
  ) =>
    estimatedGroups.reduce(
      (sum, group) =>
        sum +
        Number(
          group.estimate?.[
            field
          ] || 0
        ),
      0
    );

  const displayTotalEstimate =
    totalEstimate
      ? selectedFilm &&
        hasAdjustedGroups
        ? {
            ...totalEstimate,

            min:
              sumEstimateField(
                "min"
              ),

            max:
              sumEstimateField(
                "max"
              ),

            average:
              sumEstimateField(
                "average"
              ),
          }
        : {
            ...totalEstimate,
          }
      : null;

  /*
   * =========================================================
   * 상담 사진 저장
   * =========================================================
   */

  async function uploadLeadPhotos() {
    if (
      Array.isArray(
        estimatePhotoPathsRef.current
      ) &&
      estimatePhotoPathsRef.current
        .length > 0
    ) {
      return (
        estimatePhotoPathsRef.current
      );
    }

    const paths = [];

    const uploadErrors =
      [];

    for (
      let index = 0;
      index <
      images.length;
      index += 1
    ) {
      try {
        const formData =
          new FormData();

        formData.append(
          "image",
          images[index].file
        );

        const response =
          await fetch(
            "/api/estimate-photo",
            {
              method:
                "POST",

              body:
                formData,
            }
          );

        const result =
          await readJsonSafely(
            response
          );

        if (
          !response.ok ||
          !result?.success ||
          !result?.path
        ) {
          throw new Error(
            result?.error ||
              "상담 사진 저장 실패"
          );
        }

        paths.push(
          result.path
        );
      } catch (error) {
        console.error(
          `상담 사진 ${
            index + 1
          } 저장 실패:`,
          error
        );

        uploadErrors.push(
          error?.message ||
            `상담 사진 ${
              index + 1
            } 저장 실패`
        );
      }
    }

    if (
      images.length > 0 &&
      paths.length === 0
    ) {
      throw new Error(
        uploadErrors[0] ||
          "상담 사진을 저장하지 못했습니다."
      );
    }

    estimatePhotoPathsRef.current =
      paths;

    return paths;
  }

  /*
   * =========================================================
   * 상담 신청
   * =========================================================
   */

  async function handleLeadSubmit(
    event
  ) {
    event?.preventDefault?.();

    if (
      !displayGroups.length
    ) {
      setLeadMessage(
        "먼저 사진 AI 분석을 진행해주세요."
      );

      return;
    }

    if (
      !customerName.trim()
    ) {
      setLeadMessage(
        "이름을 입력해주세요."
      );

      return;
    }

    const phoneNumbers =
      phone.replace(
        /[^0-9]/g,
        ""
      );

    if (
      phoneNumbers.length <
      9
    ) {
      setLeadMessage(
        "연락처를 정확히 입력해주세요."
      );

      return;
    }

    if (
      !region.trim()
    ) {
      setLeadMessage(
        "시공 지역을 입력해주세요."
      );

      return;
    }

    if (!privacyAgree) {
      setLeadMessage(
        "개인정보 수집 및 상담 연락에 동의해주세요."
      );

      return;
    }

    setLeadLoading(true);

    setLeadMessage(
      "사진과 상담 신청을 접수하고 있습니다..."
    );

    try {
      /*
       * 자동견적 때 저장한
       * 고객사진 경로 재사용
       */

      const customerPhotoPaths =
        await uploadLeadPhotos();

      /*
       * 부위별 최종 견적
       */

      const estimateDetails =
        displayGroups.map(
          (group) => ({
            group_key:
              group.key,

            category:
              group.category,

            sub_category:
              group.subCategory,

            photo_count:
              group.photos.length,

            estimate_min:
              group.estimate
                ?.min ??
              null,

            estimate_max:
              group.estimate
                ?.max ??
              null,

            estimate_average:
              group.estimate
                ?.average ??
              null,

            confidence:
              group.estimate
                ?.confidence ||
              "데이터 부족",

            similar_count:
              group.estimate
                ?.count || 0,
          })
        );

      /*
       * AI 사진 설명
       */

      const description =
        groups
          .map(
            (
              group,
              index
            ) => {
              const descriptions =
                group.photos
                  .map(
                    (photo) =>
                      photo
                        .analysis
                        ?.description ||
                      ""
                  )
                  .filter(
                    Boolean
                  )
                  .join(
                    " / "
                  );

              return `${
                index + 1
              }. ${
                group.category
              }${
                group.subCategory
                  ? ` · ${group.subCategory}`
                  : ""
              } (${
                group.photos
                  .length
              }장): ${descriptions}`;
            }
          )
          .join("\n");

      /*
       * 카테고리
       */

      const categoryText =
        groups
          .map(
            (group) =>
              group.category
          )
          .filter(Boolean)
          .join(", ");

      /*
       * 관리자 메모
       */

      const memoLines =
        displayGroups.map(
          (group) => {
            if (
              !group.estimate
            ) {
              return `${group.category}: 데이터 부족`;
            }

            return `${
              group.category
            }: ${Number(
              group.estimate.min
            ).toLocaleString(
              "ko-KR"
            )}~${Number(
              group.estimate.max
            ).toLocaleString(
              "ko-KR"
            )}원`;
          }
        );

      /*
       * 선택 필름정보도
       * 상담 관리자 메모에 저장
       */

      if (selectedFilm) {
        memoLines.push("");

        memoLines.push(
          `선택 필름: ${
            selectedFilm.product_code ||
            ""
          }${
            selectedFilm.product_name
              ? ` · ${selectedFilm.product_name}`
              : ""
          }`
        );

        memoLines.push(
          `필름 조건: ${
            fireType ===
            "fire"
              ? "방염"
              : "비방염"
          }`
        );
      }

      /*
       * 상담 저장
       */

      const response =
        await fetch(
          "/api/lead",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                customer_name:
                  customerName.trim(),

                phone:
                  phone.trim(),

                region:
                  region.trim(),

                category:
                  categoryText ||
                  null,

                sub_category:
                  groups.length ===
                  1
                    ? groups[0]
                        .subCategory
                    : "다중부위",

                ai_description:
                  description,

                /*
                 * 필름 선택 후 수정된
                 * 최종 예상견적 저장
                 */

                estimate_min:
                  displayTotalEstimate
                    ?.min ??
                  null,

                estimate_max:
                  displayTotalEstimate
                    ?.max ??
                  null,

                estimate_average:
                  displayTotalEstimate
                    ?.average ??
                  null,

                customer_photo_path:
                  customerPhotoPaths[
                    0
                  ] || null,

                customer_photo_paths:
                  customerPhotoPaths,

                estimate_details:
                  estimateDetails,

                memo:
                  `다중사진 AI 견적\n${memoLines.join(
                    "\n"
                  )}`,

                usage_id:
                  usageIdRef.current,
              }),
          }
        );

      const result =
        await readJsonSafely(
          response
        );

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.error ||
            "상담 신청 저장 오류"
        );
      }

      setLeadComplete(
        true
      );

      setLeadMessage(
        "✅ 상담 신청이 완료되었습니다. 확인 후 연락드리겠습니다."
      );
    } catch (error) {
      console.error(
        error
      );

      setLeadMessage(
        `❌ 상담 신청 오류: ${
          error?.message ||
          "다시 시도해주세요."
        }`
      );
    } finally {
      setLeadLoading(
        false
      );
    }
  }

  /*
   * =========================================================
   * 사진 추가
   * =========================================================
   */

  async function handleAddImages(
    files
  ) {
    setResultMode("");

    setSelectedFilm(
      null
    );

    setFireType(
      "non_fire"
    );

    setUseSplitTone(false);
    setAreaFilms({});

    setLeadComplete(
      false
    );

    setLeadMessage("");

    await addImages(files);
  }

  /*
   * =========================================================
   * 사진 삭제
   * =========================================================
   */

  function handleRemoveImage(
    id
  ) {
    setResultMode("");

    setSelectedFilm(
      null
    );

    setFireType(
      "non_fire"
    );

    setUseSplitTone(false);
    setAreaFilms({});

    setLeadComplete(
      false
    );

    setLeadMessage("");

    removeImage(id);
  }

  /*
   * =========================================================
   * AI 분석 시작
   * =========================================================
   */

  async function startAnalyze() {
    setResultMode("");

    setSelectedFilm(
      null
    );

    setFireType(
      "non_fire"
    );

    setUseSplitTone(false);
    setAreaFilms({});

    setLeadComplete(
      false
    );

    setLeadMessage("");

    await handleAnalyze();
  }

  /*
   * =========================================================
   * 화면
   * =========================================================
   */

  return (
    <main
      style={{
        maxWidth: "720px",

        margin: "0 auto",

        padding:
          "28px 18px 70px",

        fontFamily:
          "Arial, sans-serif",

        background:
          "#f8fafc",

        minHeight:
          "100vh",

        boxSizing:
          "border-box",

        color:
          "#111827",
      }}
    >
      {/* 상단 */}

      <div
        style={{
          display:
            "inline-block",

          background:
            "#111827",

          color:
            "#ffffff",

          padding:
            "8px 14px",

          borderRadius:
            "20px",

          fontWeight:
            "bold",
        }}
      >
        기분좋은공간
      </div>

      <h1
        style={{
          marginTop:
            "18px",

          marginBottom:
            "8px",

          fontSize:
            "32px",

          lineHeight: 1.3,
        }}
      >
        AI 인테리어필름 견적
      </h1>

      <p
        style={{
          marginTop: 0,

          color:
            "#6b7280",

          fontSize:
            "17px",

          lineHeight: 1.7,
        }}
      >
        여러 시공 부위의 사진을 한 번에
        올려주세요. AI가 같은 부위끼리
        묶어서 예상견적을 계산합니다.
      </p>

      {/* 1. 사진 등록 */}

      <EstimatePhotoUploader
        images={images}
        loading={loading}
        imageLoading={
          imageLoading
        }
        message={message}
        onAddImages={
          handleAddImages
        }
        onRemoveImage={
          handleRemoveImage
        }
        onAnalyze={
          startAnalyze
        }
      />

      {/* 2. AI 분석 결과 */}

      <EstimateResult
        groups={
          displayGroups
        }
        imageCount={
          images.length
        }
      />

      {/* 3. 총 예상견적 */}

      <EstimateTotal
        totalEstimate={
          displayTotalEstimate
        }
      />

      {/* 4. 서비스 선택 */}

      <ServiceSelector
        groups={groups}
        resultMode={
          resultMode
        }
        onChange={
          setResultMode
        }
      />

      {/* 5. 가상 시공 */}

      {groups.length >
        0 &&
        resultMode ===
          "virtual" && (
          <>
            {/* 기본 필름 선택 */}

            <FilmColorPicker
              onSelect={
                handleFilmSelect
              }
            />

            {/* 부분 톤 차이 */}

            <VirtualToneSelector
              groups={groups}
              product={
                selectedFilm
              }
              useSplitTone={
                useSplitTone
              }
              onUseSplitToneChange={
                setUseSplitTone
              }
              areaFilms={
                areaFilms
              }
              onAreaFilmsChange={
                setAreaFilms
              }
            />

            {/* 방염 / 비방염 */}

            <FilmPriceSelector
              selectedFilm={
                selectedFilm
              }
              fireType={
                fireType
              }
              onFireTypeChange={
                setFireType
              }
            />

            {/*
             * 선택 필름 적용 수정견적
             */}

            <FilmAdjustedEstimate
              selectedFilm={
                selectedFilm
              }
              fireType={
                fireType
              }
              baseEstimate={
                totalEstimate
              }
              adjustedEstimate={
                displayTotalEstimate
              }
            />

            {/* 가상 시공 */}

            <VirtualInstallPanel
              images={images}
              product={
                selectedFilm
              }
              groups={groups}
              useSplitTone={
                useSplitTone
              }
              areaFilms={
                areaFilms
              }
              onRequestDetail={() =>
                setResultMode(
                  "detail"
                )
              }
            />
          </>
        )}

      {/* 6. 상세견적 상담 */}

      {groups.length >
        0 &&
        resultMode ===
          "detail" && (
          <LeadForm
            customerName={
              customerName
            }
            phone={phone}
            region={region}
            privacyAgree={
              privacyAgree
            }
            leadLoading={
              leadLoading
            }
            leadComplete={
              leadComplete
            }
            leadMessage={
              leadMessage
            }
            onCustomerNameChange={
              setCustomerName
            }
            onPhoneChange={
              handlePhoneChange
            }
            onRegionChange={
              setRegion
            }
            onPrivacyAgreeChange={
              setPrivacyAgree
            }
            onSubmit={
              handleLeadSubmit
            }
          />
        )}

      {/* 하단 */}

      <div
        style={{
          textAlign:
            "center",

          marginTop:
            "35px",

          color:
            "#9ca3af",

          fontSize:
            "13px",

          lineHeight: 1.6,
        }}
      >
        기분좋은공간
        <br />
        AI 인테리어필름 견적
      </div>
    </main>
  );
}
