"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

import FilmColorPicker from "../FilmColorPicker";
import VirtualInstallPanel from "../VirtualInstallPanel";
import VirtualToneSelector from "./VirtualToneSelector";

import EstimatePhotoUploader from "./EstimatePhotoUploader";
import EstimateResult from "./EstimateResult";
import EstimateTotal from "./EstimateTotal";
import FilmPriceSelector from "./FilmPriceSelector";
import FilmAdjustedEstimate from "./FilmAdjustedEstimate";
import LeadForm from "./LeadForm";

import useEstimate from "../hooks/useEstimate";
import { adjustEstimateByFilm } from "../utils/estimatePrice";

import styles from "./CustomerEstimatePage.module.css";

const SCREEN = {
  HOME: "home",
  UPLOAD: "upload",
  ANALYZING: "analyzing",
  RESULT: "result",
  VIRTUAL: "virtual",
  CONSULTATION: "consultation",
  COMPLETE: "complete",
};

function getProgress(screen) {
  if (screen === SCREEN.UPLOAD) {
    return {
      current: 1,
      total: 4,
      percent: 25,
    };
  }

  if (screen === SCREEN.ANALYZING) {
    return {
      current: 2,
      total: 4,
      percent: 50,
    };
  }

  if (
    screen === SCREEN.RESULT ||
    screen === SCREEN.VIRTUAL
  ) {
    return {
      current: 3,
      total: 4,
      percent: 75,
    };
  }

  if (screen === SCREEN.CONSULTATION) {
    return {
      current: 4,
      total: 4,
      percent: 100,
    };
  }

  return null;
}

function normalizeDoorText(value) {
  return String(value || "")
    .replace(/[^가-힣a-zA-Z0-9]/g, "")
    .toLowerCase();
}

const DOOR_KEYWORDS = [
  "문문틀",
  "방문",
  "방화문",
  "중문",
  "현관문",
  "문짝",
  "문틀",
  "도어",
  "도어프레임",
  "door",
  "doorframe",
  "firedoor",
  "slidingdoor",
  "entrancedoor",
];

function hasDoorKeyword(value) {
  const normalized =
    normalizeDoorText(value);

  if (!normalized) {
    return false;
  }

  return DOOR_KEYWORDS.some((keyword) =>
    normalized.includes(
      normalizeDoorText(keyword)
    )
  );
}

function getDoorGroupText(group) {
  const parts = [
    group?.category,
    group?.subCategory,
    group?.sub_category,
    group?.key,
    group?.name,
    group?.label,
    group?.title,
    group?.description,
  ];

  const photos =
    Array.isArray(group?.photos)
      ? group.photos
      : [];

  photos.forEach((photo) => {
    parts.push(
      photo?.category,
      photo?.subCategory,
      photo?.sub_category,
      photo?.name,
      photo?.label,
      photo?.description,

      photo?.analysis?.category,
      photo?.analysis?.subCategory,
      photo?.analysis?.sub_category,
      photo?.analysis?.name,
      photo?.analysis?.description
    );

    if (Array.isArray(photo?.tags)) {
      parts.push(...photo.tags);
    }

    if (
      Array.isArray(
        photo?.analysis?.tags
      )
    ) {
      parts.push(
        ...photo.analysis.tags
      );
    }
  });

  return parts
    .filter(Boolean)
    .join(" ");
}

/*
 * 수량 선택창 표시용
 * AI 설명과 태그까지 넓게 확인
 */
function isDoorSetGroup(group) {
  const text =
    getDoorGroupText(group);

  return hasDoorKeyword(
    text
  );
}

/*
 * 실제 가격 계산용
 *
 * 중요:
 * 다른 시공 부위의 설명 속에
 * "문"이라는 단어가 있어도 가격에는 영향을 주지 않습니다.
 */
function isDoorPricingGroup(group) {
  const category =
    normalizeDoorText(
      group?.category
    );

  const subCategory =
    normalizeDoorText(
      group?.subCategory ||
        group?.sub_category
    );

  const key =
    normalizeDoorText(
      group?.key
    );

  const label =
    normalizeDoorText(
      group?.label ||
        group?.name ||
        group?.title
    );

  const exactDoorCategories =
    new Set([
      "문문틀",
      "문",
      "방문",
      "방화문",
      "중문",
      "현관문",
      "문짝",
      "문틀",
      "도어",
      "도어프레임",
      "door",
      "doorframe",
      "firedoor",
      "slidingdoor",
      "entrancedoor",
    ]);

  if (
    category.includes(
      "문문틀"
    )
  ) {
    return true;
  }

  if (
    exactDoorCategories.has(
      category
    )
  ) {
    return true;
  }

  /*
   * 싱크대/신발장/붙박이장처럼
   * category가 다른 부위로 명확하면 제외
   */
  if (category) {
    return false;
  }

  const fallbackValues = [
    subCategory,
    key,
    label,
  ];

  return fallbackValues.some(
    (value) =>
      value.includes(
        "문문틀"
      ) ||
      exactDoorCategories.has(
        value
      )
  );
}

function clampDoorQuantity(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 1;
  }

  return Math.min(
    50,
    Math.max(
      1,
      Math.floor(
        number
      )
    )
  );
}

function DoorQuantitySelector({
  quantity,
  onChange,
}) {
  function changeQuantity(value) {
    onChange?.(
      clampDoorQuantity(
        value
      )
    );
  }

  return (
    <div
      style={{
        marginBottom: "18px",
        padding: "16px",
        border:
          "1px solid #e3e7ec",
        borderRadius: "14px",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "flex-start",
          justifyContent:
            "space-between",
          gap: "12px",
        }}
      >
        <div>
          <strong
            style={{
              display: "block",
              color: "#20262e",
              fontSize: "15px",
              fontWeight: "900",
            }}
          >
            동일한 문·문틀 수량
          </strong>

          <div
            style={{
              marginTop: "5px",
              color: "#8b95a1",
              fontSize: "11px",
              lineHeight: 1.5,
            }}
          >
            사진과 같은 문·문틀이 여러 세트라면
            수량을 조정해주세요.
          </div>
        </div>

        <span
          style={{
            flexShrink: 0,
            padding: "5px 9px",
            borderRadius: "999px",
            background: "#eef4ff",
            color: "#246bfd",
            fontSize: "10px",
            fontWeight: "900",
          }}
        >
          세트 기준
        </span>
      </div>

      <div
        style={{
          marginTop: "14px",
          display: "grid",
          gridTemplateColumns:
            "52px 1fr 52px",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <button
          type="button"
          disabled={
            quantity <= 1
          }
          onClick={() =>
            changeQuantity(
              quantity - 1
            )
          }
          style={{
            height: "46px",
            border:
              "1px solid #dfe3e8",
            borderRadius: "11px",
            background:
              quantity <= 1
                ? "#f5f6f8"
                : "#ffffff",
            color:
              quantity <= 1
                ? "#b5bcc5"
                : "#303842",
            fontSize: "24px",
            cursor:
              quantity <= 1
                ? "default"
                : "pointer",
          }}
        >
          −
        </button>

        <div
          style={{
            height: "46px",
            display: "flex",
            alignItems: "center",
            justifyContent:
              "center",
            gap: "5px",
            borderRadius: "11px",
            background: "#f6f8fb",
          }}
        >
          <input
            type="number"
            min="1"
            max="50"
            inputMode="numeric"
            value={quantity}
            onChange={(event) =>
              changeQuantity(
                event.target.value
              )
            }
            style={{
              width: "54px",
              padding: 0,
              border: 0,
              outline: "none",
              background:
                "transparent",
              color: "#171b21",
              fontSize: "20px",
              fontWeight: "900",
              textAlign: "right",
            }}
          />

          <span
            style={{
              color: "#59636f",
              fontSize: "13px",
              fontWeight: "800",
            }}
          >
            세트
          </span>
        </div>

        <button
          type="button"
          disabled={
            quantity >= 50
          }
          onClick={() =>
            changeQuantity(
              quantity + 1
            )
          }
          style={{
            height: "46px",
            border:
              "1px solid #dfe3e8",
            borderRadius: "11px",
            background:
              quantity >= 50
                ? "#f5f6f8"
                : "#ffffff",
            color:
              quantity >= 50
                ? "#b5bcc5"
                : "#303842",
            fontSize: "24px",
            cursor:
              quantity >= 50
                ? "default"
                : "pointer",
          }}
        >
          +
        </button>
      </div>

      <div
        style={{
          marginTop: "10px",
          color: "#8b95a1",
          fontSize: "11px",
          lineHeight: 1.5,
        }}
      >
        문짝과 문틀을 따로 계산하지 않고
        문·문틀 1세트 견적에 수량을 반영합니다.
      </div>
    </div>
  );
}

export default function CustomerEstimatePage({
  companySlug = null,
  fallbackCompanyName = "기분좋은공간",
}) {
  const [
    tenantLoading,
    setTenantLoading,
  ] = useState(
    Boolean(companySlug)
  );

  const [
    tenantError,
    setTenantError,
  ] = useState("");

  const [
    company,
    setCompany,
  ] = useState(null);

  const [
    companySettings,
    setCompanySettings,
  ] = useState(null);

  const [
    screen,
    setScreen,
  ] = useState(
    SCREEN.HOME
  );

  const [
    transitionKey,
    setTransitionKey,
  ] = useState(0);

  const analysisLoadingSeenRef =
    useRef(false);

  function changeScreen(nextScreen) {
    setScreen(nextScreen);

    setTransitionKey(
      (prev) =>
        prev + 1
    );

    if (
      typeof window !==
      "undefined"
    ) {
      window.scrollTo(
        0,
        0
      );
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCompany() {
      if (!companySlug) {
        setCompany(null);
        setCompanySettings(
          null
        );
        setTenantLoading(
          false
        );
        setTenantError("");
        return;
      }

      setTenantLoading(
        true
      );
      setTenantError("");

      try {
        const response =
          await fetch(
            `/api/public-company?slug=${encodeURIComponent(
              companySlug
            )}`,
            {
              cache:
                "no-store",
            }
          );

        const text =
          await response.text();

        let result = null;

        try {
          result =
            JSON.parse(
              text
            );
        } catch {
          throw new Error(
            text
              ? `서버 응답 오류: ${text.slice(
                  0,
                  200
                )}`
              : "업체 정보를 불러오지 못했습니다."
          );
        }

        if (
          !response.ok ||
          !result?.success ||
          !result?.company
        ) {
          throw new Error(
            result?.error ||
              "업체 정보를 불러오지 못했습니다."
          );
        }

        if (!cancelled) {
          setCompany(
            result.company
          );

          setCompanySettings(
            result.settings ||
              null
          );
        }
      } catch (error) {
        console.error(
          "업체 정보 조회 오류:",
          error
        );

        if (!cancelled) {
          setTenantError(
            error?.message ||
              "업체 정보를 불러오지 못했습니다."
          );
        }
      } finally {
        if (!cancelled) {
          setTenantLoading(
            false
          );
        }
      }
    }

    loadCompany();

    return () => {
      cancelled = true;
    };
  }, [
    companySlug,
  ]);

  const companyName =
    company?.company_name ||
    fallbackCompanyName;

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
  } = useEstimate({
    companySlug,
  });

  const [
    selectedFilm,
    setSelectedFilm,
  ] = useState(null);

  const [
    fireType,
    setFireType,
  ] = useState(
    "non_fire"
  );

  const [
    useSplitTone,
    setUseSplitTone,
  ] = useState(false);

  const [
    areaFilms,
    setAreaFilms,
  ] = useState({});

  const [
    doorQuantity,
    setDoorQuantity,
  ] = useState(1);

  const [
    customerName,
    setCustomerName,
  ] = useState("");

  const [
    phone,
    setPhone,
  ] = useState("");

  const [
    region,
    setRegion,
  ] = useState("");

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

  const progress =
    getProgress(screen);

  useEffect(() => {
    if (
      screen !==
      SCREEN.ANALYZING
    ) {
      return;
    }

    if (loading) {
      analysisLoadingSeenRef.current =
        true;
      return;
    }

    if (
      analysisLoadingSeenRef.current &&
      groups.length > 0
    ) {
      analysisLoadingSeenRef.current =
        false;

      changeScreen(
        SCREEN.RESULT
      );
    }
  }, [
    loading,
    groups.length,
    screen,
  ]);

  function handlePhoneChange(value) {
    const numbers =
      String(value || "")
        .replace(
          /[^0-9]/g,
          ""
        )
        .slice(
          0,
          11
        );

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
      )}-${numbers.slice(
        7
      )}`
    );
  }

  async function handleFilmSelect(film) {
    if (!film) {
      setSelectedFilm(
        null
      );
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

    if (!alreadyHasPrice) {
      try {
        let query =
          supabase
            .from(
              "film_products"
            )
            .select(`
              id,
              fire_price_per_meter,
              non_fire_price_per_meter
            `);

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

    setSelectedFilm(
      completedFilm
    );

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
      setFireType(
        "fire"
      );
    } else if (
      hasNonFire &&
      !hasFire
    ) {
      setFireType(
        "non_fire"
      );
    }
  }

  const hasDoorSetGroup =
    groups.some(
      (group) =>
        isDoorSetGroup(
          group
        )
    );

  useEffect(() => {
    if (
      !hasDoorSetGroup &&
      doorQuantity !== 1
    ) {
      setDoorQuantity(
        1
      );
    }
  }, [
    hasDoorSetGroup,
    doorQuantity,
  ]);

  function getFilmAdjustedGroupEstimate(
    group
  ) {
    if (
      !group?.estimate
    ) {
      return null;
    }

    if (!selectedFilm) {
      return {
        min:
          Number(
            group.estimate.min ||
              0
          ),

        max:
          Number(
            group.estimate.max ||
              0
          ),

        average:
          Number(
            group.estimate.average ||
              0
          ),
      };
    }

    return {
      min:
        adjustEstimateByFilm(
          group.estimate.min,
          selectedFilm,
          fireType
        ),

      max:
        adjustEstimateByFilm(
          group.estimate.max,
          selectedFilm,
          fireType
        ),

      average:
        adjustEstimateByFilm(
          group.estimate.average,
          selectedFilm,
          fireType
        ),
    };
  }

  /*
   * 각 부위별 표시 견적
   * 실제 문·문틀 가격 그룹에만 수량 적용
   */
  const displayGroups =
    groups.map(
      (group) => {
        if (
          !group.estimate
        ) {
          return group;
        }

        const adjusted =
          getFilmAdjustedGroupEstimate(
            group
          );

        const quantity =
          isDoorPricingGroup(
            group
          )
            ? doorQuantity
            : 1;

        return {
          ...group,

          quantity,

          estimate: {
            ...group.estimate,

            min:
              Number(
                adjusted?.min ||
                  0
              ) *
              quantity,

            max:
              Number(
                adjusted?.max ||
                  0
              ) *
              quantity,

            average:
              Number(
                adjusted?.average ||
                  0
              ) *
              quantity,
          },
        };
      }
    );

  /*
   * 기존 totalEstimate에는
   * 문·문틀 1세트 가격이 이미 포함되어 있습니다.
   *
   * 따라서 추가 세트 금액만 더합니다.
   */
  const doorBaseExtra =
    groups.reduce(
      (
        sum,
        group
      ) => {
        if (
          !group?.estimate ||
          !isDoorPricingGroup(
            group
          ) ||
          doorQuantity <= 1
        ) {
          return sum;
        }

        const extraCount =
          doorQuantity - 1;

        return {
          min:
            sum.min +
            Number(
              group.estimate.min ||
                0
            ) *
              extraCount,

          max:
            sum.max +
            Number(
              group.estimate.max ||
                0
            ) *
              extraCount,

          average:
            sum.average +
            Number(
              group.estimate.average ||
                0
            ) *
              extraCount,
        };
      },
      {
        min: 0,
        max: 0,
        average: 0,
      }
    );

  const doorDisplayExtra =
    groups.reduce(
      (
        sum,
        group
      ) => {
        if (
          !group?.estimate ||
          !isDoorPricingGroup(
            group
          ) ||
          doorQuantity <= 1
        ) {
          return sum;
        }

        const adjusted =
          getFilmAdjustedGroupEstimate(
            group
          );

        const extraCount =
          doorQuantity - 1;

        return {
          min:
            sum.min +
            Number(
              adjusted?.min ||
                0
            ) *
              extraCount,

          max:
            sum.max +
            Number(
              adjusted?.max ||
                0
            ) *
              extraCount,

          average:
            sum.average +
            Number(
              adjusted?.average ||
                0
            ) *
              extraCount,
        };
      },
      {
        min: 0,
        max: 0,
        average: 0,
      }
    );

  const quantityAdjustedBaseEstimate =
    totalEstimate
      ? {
          ...totalEstimate,

          min:
            Number(
              totalEstimate.min ||
                0
            ) +
            doorBaseExtra.min,

          max:
            Number(
              totalEstimate.max ||
                0
            ) +
            doorBaseExtra.max,

          average:
            Number(
              totalEstimate.average ||
                0
            ) +
            doorBaseExtra.average,
        }
      : null;

  const displayTotalEstimate =
    totalEstimate
      ? {
          ...totalEstimate,

          min:
            (
              selectedFilm
                ? adjustEstimateByFilm(
                    totalEstimate.min,
                    selectedFilm,
                    fireType
                  )
                : Number(
                    totalEstimate.min ||
                      0
                  )
            ) +
            doorDisplayExtra.min,

          max:
            (
              selectedFilm
                ? adjustEstimateByFilm(
                    totalEstimate.max,
                    selectedFilm,
                    fireType
                  )
                : Number(
                    totalEstimate.max ||
                      0
                  )
            ) +
            doorDisplayExtra.max,

          average:
            (
              selectedFilm
                ? adjustEstimateByFilm(
                    totalEstimate.average,
                    selectedFilm,
                    fireType
                  )
                : Number(
                    totalEstimate.average ||
                      0
                  )
            ) +
            doorDisplayExtra.average,
        }
      : null;

  function resetEstimateOptions() {
    setSelectedFilm(
      null
    );

    setFireType(
      "non_fire"
    );

    setUseSplitTone(
      false
    );

    setAreaFilms(
      {}
    );

    setDoorQuantity(
      1
    );

    setLeadComplete(
      false
    );

    setLeadMessage(
      ""
    );
  }

  async function handleAddImages(files) {
    resetEstimateOptions();

    await addImages(
      files
    );
  }

  function handleRemoveImage(id) {
    resetEstimateOptions();

    removeImage(
      id
    );
  }

  async function startAnalyze() {
    if (
      images.length === 0
    ) {
      return;
    }

    resetEstimateOptions();

    analysisLoadingSeenRef.current =
      false;

    changeScreen(
      SCREEN.ANALYZING
    );

    await handleAnalyze();
  }

  async function uploadLeadPhotos() {
    if (
      Array.isArray(
        estimatePhotoPathsRef.current
      ) &&
      estimatePhotoPathsRef.current
        .length > 0
    ) {
      return estimatePhotoPathsRef.current;
    }

    const paths = [];
    const uploadErrors = [];

    for (
      let index = 0;
      index < images.length;
      index += 1
    ) {
      try {
        const formData =
          new FormData();

        formData.append(
          "image",
          images[index].file
        );

        if (companySlug) {
          formData.append(
            "company_slug",
            companySlug
          );
        }

        const response =
          await fetch(
            "/api/estimate-photo",
            {
              method: "POST",
              body: formData,
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

  async function handleLeadSubmit(event) {
    event?.preventDefault?.();

    if (!displayGroups.length) {
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

    setLeadLoading(
      true
    );

    setLeadMessage(
      "사진과 상담 신청을 접수하고 있습니다..."
    );

    try {
      const customerPhotoPaths =
        await uploadLeadPhotos();

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

            quantity:
              isDoorPricingGroup(
                group
              )
                ? doorQuantity
                : 1,

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
                ?.count ||
              0,
          })
        );

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
                      photo.analysis
                        ?.description ||
                      ""
                  )
                  .filter(Boolean)
                  .join(" / ");

              return `${
                index + 1
              }. ${
                group.category
              }${
                group.subCategory
                  ? ` · ${group.subCategory}`
                  : ""
              } (${
                group.photos.length
              }장): ${descriptions}`;
            }
          )
          .join("\n");

      const categoryText =
        groups
          .map(
            (group) =>
              group.category
          )
          .filter(Boolean)
          .join(", ");

      const memoLines =
        displayGroups.map(
          (group) => {
            if (
              !group.estimate
            ) {
              return `${group.category}: 데이터 부족`;
            }

            return `${group.category}: ${Number(
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

      if (hasDoorSetGroup) {
        memoLines.push(
          `문·문틀 수량: ${doorQuantity}세트`
        );
      }

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
            fireType === "fire"
              ? "방염"
              : "비방염"
          }`
        );
      }

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
                  groups.length === 1
                    ? groups[0]
                        .subCategory
                    : "다중부위",

                ai_description:
                  description,

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
                  customerPhotoPaths[0] ||
                  null,

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

                company_slug:
                  companySlug ||
                  null,
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
        "✅ 상담 신청이 완료되었습니다."
      );

      changeScreen(
        SCREEN.COMPLETE
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
    function goBack() {
    if (
      screen ===
      SCREEN.UPLOAD
    ) {
      changeScreen(
        SCREEN.HOME
      );

      return;
    }

    if (
      screen ===
      SCREEN.ANALYZING
    ) {
      changeScreen(
        SCREEN.UPLOAD
      );

      return;
    }

    if (
      screen ===
      SCREEN.RESULT
    ) {
      changeScreen(
        SCREEN.UPLOAD
      );

      return;
    }

    if (
      screen ===
      SCREEN.VIRTUAL
    ) {
      changeScreen(
        SCREEN.RESULT
      );

      return;
    }

    if (
      screen ===
      SCREEN.CONSULTATION
    ) {
      changeScreen(
        selectedFilm
          ? SCREEN.VIRTUAL
          : SCREEN.RESULT
      );

      return;
    }

    if (
      screen ===
      SCREEN.COMPLETE
    ) {
      changeScreen(
        SCREEN.HOME
      );
    }
  }

  function restart() {
    setCustomerName("");
    setPhone("");
    setRegion("");
    setPrivacyAgree(false);

    setLeadComplete(false);
    setLeadMessage("");

    setDoorQuantity(1);

    changeScreen(
      SCREEN.HOME
    );
  }

  if (tenantLoading) {
    return (
      <main className={styles.statePage}>
        <div className={styles.spinner} />

        <strong>
          업체 정보를 불러오고 있습니다
        </strong>
      </main>
    );
  }

  if (tenantError) {
    return (
      <main className={styles.statePage}>
        <div className={styles.errorBox}>
          <strong>
            페이지를 열 수 없습니다
          </strong>

          <p>
            {tenantError}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            {screen !== SCREEN.HOME ? (
              <button
                type="button"
                onClick={goBack}
                className={styles.backButton}
                aria-label="뒤로가기"
              >
                ‹
              </button>
            ) : (
              <div />
            )}
          </div>

          <button
            type="button"
            className={styles.companyButton}
            onClick={() =>
              changeScreen(
                SCREEN.HOME
              )
            }
          >
            {companyName}
          </button>

          <div className={styles.headerRight}>
            {screen === SCREEN.HOME && (
              <Link
                href={
                  companySlug
                    ? `/samples?company=${encodeURIComponent(
                        companySlug
                      )}`
                    : "/samples"
                }
                className={styles.sampleLink}
              >
                샘플
              </Link>
            )}

            <Link
              href="/admin"
              className={styles.menuButton}
              aria-label="관리자"
            >
              ☰
            </Link>
          </div>
        </div>

        {progress && (
          <div className={styles.progressArea}>
            <div className={styles.progressNumber}>
              {progress.current} / {progress.total}
            </div>

            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${progress.percent}%`,
                }}
              />
            </div>
          </div>
        )}
      </header>

      <div
        key={transitionKey}
        className={styles.screenTransition}
      >
        {screen === SCREEN.HOME && (
          <section className={styles.homeScreen}>
            <div className={styles.heroImage}>
              <div className={styles.heroShade} />

              <div className={styles.heroContent}>
                <div className={styles.heroEyebrow}>
                  AI 인테리어필름 견적 서비스
                </div>

                <h1>
                  사진 한 장으로
                  <br />
                  견적부터
                  <br />

                  <span>
                    가상시공까지
                  </span>
                </h1>

                <p>
                  AI가 분석한 예상 견적과
                  <br />
                  원하는 필름으로 시공 후 모습까지
                  <br />
                  미리 확인해보세요.
                </p>
              </div>

              <div className={styles.heroButtonWrap}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() =>
                    changeScreen(
                      SCREEN.UPLOAD
                    )
                  }
                >
                  무료 AI 견적 시작
                  <span>→</span>
                </button>
              </div>
            </div>

            <div className={styles.homeBenefits}>
              <div>
                <div className={styles.benefitIcon}>
                  ◉
                </div>

                <strong>
                  사진만 있으면
                </strong>

                <span>
                  바로 시작
                </span>
              </div>

              <div>
                <div className={styles.benefitIcon}>
                  ⚡
                </div>

                <strong>
                  빠른
                </strong>

                <span>
                  AI 분석
                </span>
              </div>

              <div>
                <div className={styles.benefitIcon}>
                  ▣
                </div>

                <strong>
                  견적 +
                </strong>

                <span>
                  가상시공
                </span>
              </div>
            </div>
          </section>
        )}

        {screen === SCREEN.UPLOAD && (
          <section className={styles.contentScreen}>
            <div className={styles.screenHeader}>
              <h1>
                시공할 공간의
                <br />
                사진을 올려주세요
              </h1>

              <p>
                AI가 시공 부위와 구조를 분석하고
                예상 견적을 계산합니다.
              </p>
            </div>

            <div className={styles.uploadCard}>
              <EstimatePhotoUploader
                images={images}
                loading={loading}
                imageLoading={imageLoading}
                message={message}
                onAddImages={handleAddImages}
                onRemoveImage={
                  handleRemoveImage
                }
                onAnalyze={startAnalyze}
              />
            </div>

            {images.length > 0 && (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={
                  loading ||
                  imageLoading
                }
                onClick={
                  startAnalyze
                }
              >
                AI 분석하기
                <span>→</span>
              </button>
            )}
          </section>
        )}

        {screen === SCREEN.ANALYZING && (
          <section
            className={`${styles.contentScreen} ${styles.analysisScreen}`}
          >
            <div className={styles.screenHeader}>
              <h1>
                AI가 사진을
                <br />
                분석하고 있어요
              </h1>

              <p>
                사진에서 시공 부위를 확인하고
                기존 시공 데이터와 비교 중입니다.
              </p>
            </div>

            <div className={styles.analysisVisual}>
              <div className={styles.analysisCircle}>
                <div className={styles.analysisInner}>
                  ⌂
                </div>
              </div>
            </div>

            <div className={styles.analysisList}>
              <div className={styles.analysisDone}>
                <span>✓</span>
                이미지 확인 완료
              </div>

              <div className={styles.analysisActive}>
                <span>✓</span>
                시공 부위 분석 중...
              </div>

              <div>
                <span>○</span>
                유사 시공 데이터 검색
              </div>

              <div>
                <span>○</span>
                예상 견적 계산
              </div>
            </div>

            <div className={styles.analysisInfo}>
              보통 잠시 후 결과를 확인할 수 있습니다.
            </div>
          </section>
        )}

        {screen === SCREEN.RESULT && (
          <section className={styles.contentScreen}>
            <div className={styles.screenHeader}>
              <h1>
                AI 분석이 완료되었어요
              </h1>

              <p>
                사진을 기반으로 계산한
                예상 시공 견적입니다.
              </p>
            </div>

            <div className={styles.priceCard}>
              <div className={styles.priceLabel}>
                예상 시공 금액
              </div>

              <EstimateTotal
                totalEstimate={
                  displayTotalEstimate
                }
              />
            </div>

            {hasDoorSetGroup && (
              <DoorQuantitySelector
                quantity={
                  doorQuantity
                }
                onChange={
                  setDoorQuantity
                }
              />
            )}

            <div className={styles.summaryGrid}>
              <div>
                <strong>
                  {images.length}장
                </strong>

                <span>
                  분석 사진
                </span>
              </div>

              <div>
                <strong>
                  {groups.length}개
                </strong>

                <span>
                  시공 부위
                </span>
              </div>

              <div>
                <strong>
                  AI
                </strong>

                <span>
                  유사사례
                </span>
              </div>
            </div>

            <div className={styles.resultSection}>
              <div className={styles.sectionTitle}>
                분석된 시공 부위
              </div>

              <EstimateResult
                groups={
                  displayGroups
                }
                imageCount={
                  images.length
                }
              />
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  changeScreen(
                    SCREEN.VIRTUAL
                  )
                }
              >
                가상시공 해보기
                <span>→</span>
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  changeScreen(
                    SCREEN.CONSULTATION
                  )
                }
              >
                상담 신청하기
              </button>
            </div>
          </section>
        )}

        {screen === SCREEN.VIRTUAL && (
          <section className={styles.contentScreen}>
            <div className={styles.screenHeader}>
              <h1>
                원하는 필름을
                <br />
                선택해주세요
              </h1>

              <p>
                다양한 브랜드와 컬러로
                시공 후 모습을 미리 확인할 수 있어요.
              </p>
            </div>

            <div className={styles.filmPickerArea}>
              <FilmColorPicker
                onSelect={
                  handleFilmSelect
                }
              />
            </div>

            {selectedFilm && (
              <>
                <div className={styles.optionBlock}>
                  <div className={styles.sectionTitle}>
                    시공 방식 선택
                  </div>

                  <VirtualToneSelector
                    groups={
                      groups
                    }
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
                </div>

                <div className={styles.optionBlock}>
                  <div className={styles.sectionTitle}>
                    필름 조건
                  </div>

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
                </div>

                <div className={styles.priceCard}>
                  <div className={styles.priceLabel}>
                    선택한 필름으로 예상 견적
                  </div>

                  <FilmAdjustedEstimate
                    selectedFilm={
                      selectedFilm
                    }
                    fireType={
                      fireType
                    }
                    baseEstimate={
                      quantityAdjustedBaseEstimate
                    }
                    adjustedEstimate={
                      displayTotalEstimate
                    }
                  />
                </div>

                <div className={styles.virtualResultArea}>
                  <div className={styles.sectionTitle}>
                    가상시공 결과
                  </div>

                  <VirtualInstallPanel
                    images={
                      images
                    }
                    product={
                      selectedFilm
                    }
                    groups={
                      groups
                    }
                    useSplitTone={
                      useSplitTone
                    }
                    areaFilms={
                      areaFilms
                    }
                    companySlug={
                      companySlug
                    }
                    onRequestDetail={() =>
                      changeScreen(
                        SCREEN.CONSULTATION
                      )
                    }
                  />
                </div>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() =>
                    changeScreen(
                      SCREEN.CONSULTATION
                    )
                  }
                >
                  이대로 상담 신청하기
                  <span>→</span>
                </button>
              </>
            )}
          </section>
        )}

        {screen === SCREEN.CONSULTATION && (
          <section className={styles.contentScreen}>
            <div className={styles.screenHeader}>
              <h1>
                상담 신청하기
              </h1>

              <p>
                AI 견적 결과와 선택한 필름 정보를
                함께 전달해드립니다.
              </p>
            </div>

            <div className={styles.consultSummary}>
              <div>
                <span>
                  예상 견적
                </span>

                <strong>
                  {displayTotalEstimate
                    ? `${Number(
                        displayTotalEstimate.min
                      ).toLocaleString(
                        "ko-KR"
                      )} ~ ${Number(
                        displayTotalEstimate.max
                      ).toLocaleString(
                        "ko-KR"
                      )}원`
                    : "확인 중"}
                </strong>
              </div>

              {hasDoorSetGroup && (
                <div>
                  <span>
                    문·문틀 수량
                  </span>

                  <strong>
                    {doorQuantity}세트
                  </strong>
                </div>
              )}

              {selectedFilm && (
                <div>
                  <span>
                    선택 필름
                  </span>

                  <strong>
                    {selectedFilm.product_code ||
                      selectedFilm.product_name ||
                      "선택 완료"}
                  </strong>
                </div>
              )}
            </div>

            <div className={styles.formArea}>
              <LeadForm
                customerName={
                  customerName
                }
                phone={
                  phone
                }
                region={
                  region
                }
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
            </div>
          </section>
        )}

        {screen === SCREEN.COMPLETE && (
          <section className={styles.completeScreen}>
            <div className={styles.completeIcon}>
              ✓
            </div>

            <h1>
              상담 신청이
              <br />
              완료되었습니다
            </h1>

            <p>
              AI 견적 결과와 선택한 필름 정보가
              <br />
              업체에 전달되었습니다.
              <br />
              확인 후 빠르게 연락드리겠습니다.
            </p>

            <div className={styles.completeSummary}>
              <div>
                <span>
                  예상 견적
                </span>

                <strong>
                  {displayTotalEstimate
                    ? `${Number(
                        displayTotalEstimate.min
                      ).toLocaleString(
                        "ko-KR"
                      )} ~ ${Number(
                        displayTotalEstimate.max
                      ).toLocaleString(
                        "ko-KR"
                      )}원`
                    : "확인 중"}
                </strong>
              </div>

              {hasDoorSetGroup && (
                <div>
                  <span>
                    문·문틀 수량
                  </span>

                  <strong>
                    {doorQuantity}세트
                  </strong>
                </div>
              )}

              {selectedFilm && (
                <div>
                  <span>
                    선택 필름
                  </span>

                  <strong>
                    {selectedFilm.product_code ||
                      selectedFilm.product_name}
                  </strong>
                </div>
              )}

              <div>
                <span>
                  사진
                </span>

                <strong>
                  {images.length}장
                </strong>
              </div>
            </div>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={
                restart
              }
            >
              처음으로 돌아가기
            </button>
          </section>
        )}
      </div>
    </main>
  );
    }
