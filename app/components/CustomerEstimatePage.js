"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

import FilmColorPicker from "../FilmColorPicker";
import VirtualInstallPanel from "../VirtualInstallPanel";
import VirtualToneSelector from "./VirtualToneSelector";

import EstimatePhotoUploader from "./EstimatePhotoUploader";
import EstimateResult from "./EstimateResult";
import EstimateTotal from "./EstimateTotal";
import ServiceSelector from "./ServiceSelector";
import FilmPriceSelector from "./FilmPriceSelector";
import FilmAdjustedEstimate from "./FilmAdjustedEstimate";
import LeadForm from "./LeadForm";

import useEstimate from "../hooks/useEstimate";

import {
  adjustEstimateByFilm,
} from "../utils/estimatePrice";

export default function CustomerEstimatePage({
  companySlug = null,
  fallbackCompanyName = "기분좋은공간",
}) {
  const [tenantLoading, setTenantLoading] =
    useState(Boolean(companySlug));

  const [tenantError, setTenantError] =
    useState("");

  const [company, setCompany] =
    useState(null);

  const [
    companySettings,
    setCompanySettings,
  ] = useState(null);

  /* =========================================================
     업체 정보
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadCompany() {
      if (!companySlug) {
        setCompany(null);
        setCompanySettings(null);
        setTenantLoading(false);
        setTenantError("");
        return;
      }

      setTenantLoading(true);
      setTenantError("");

      try {
        const response =
          await fetch(
            `/api/public-company?slug=${encodeURIComponent(
              companySlug
            )}`,
            {
              cache: "no-store",
            }
          );

        const text =
          await response.text();

        let result = null;

        try {
          result =
            JSON.parse(text);
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
  }, [companySlug]);

  const companyName =
    company?.company_name ||
    fallbackCompanyName;

  const estimateTitle =
    companySettings
      ?.estimate_title ||
    "AI 인테리어필름 견적";

  const estimateDescription =
    companySettings
      ?.estimate_description ||
    "사진을 올리면 AI가 시공 부위를 분석하고 예상 견적을 알려드립니다.";

  /* =========================================================
     AI 자동견적
  ========================================================= */

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

  /* =========================================================
     화면 상태
  ========================================================= */

  const [
    resultMode,
    setResultMode,
  ] = useState("");

  const [
    selectedFilm,
    setSelectedFilm,
  ] = useState(null);

  const [
    fireType,
    setFireType,
  ] = useState("non_fire");

  const [
    useSplitTone,
    setUseSplitTone,
  ] = useState(false);

  const [
    areaFilms,
    setAreaFilms,
  ] = useState({});

  /* =========================================================
     상담 신청
  ========================================================= */

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

  /* =========================================================
     전화번호 형식
  ========================================================= */

  function handlePhoneChange(
    value
  ) {
    const numbers =
      String(value || "")
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

  /* =========================================================
     필름 선택
  ========================================================= */

  async function handleFilmSelect(
    film
  ) {
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
        film
          .fire_price_per_meter ||
          0
      ) > 0 ||
      Number(
        film
          .non_fire_price_per_meter ||
          0
      ) > 0;

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

    setSelectedFilm(
      completedFilm
    );

    const hasNonFire =
      Number(
        completedFilm
          .non_fire_price_per_meter ||
          0
      ) > 0;

    const hasFire =
      Number(
        completedFilm
          .fire_price_per_meter ||
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

  /* =========================================================
     필름 적용 견적
  ========================================================= */

  const displayGroups =
    groups.map(
      (group) => {
        if (
          !group.estimate ||
          !selectedFilm
        ) {
          return group;
        }

        return {
          ...group,

          estimate: {
            ...group.estimate,

            min:
              adjustEstimateByFilm(
                group.estimate
                  .min,
                selectedFilm,
                fireType
              ),

            max:
              adjustEstimateByFilm(
                group.estimate
                  .max,
                selectedFilm,
                fireType
              ),

            average:
              adjustEstimateByFilm(
                group.estimate
                  .average,
                selectedFilm,
                fireType
              ),
          },
        };
      }
    );

  const displayTotalEstimate =
    totalEstimate
      ? {
          ...totalEstimate,

          min:
            selectedFilm
              ? adjustEstimateByFilm(
                  totalEstimate.min,
                  selectedFilm,
                  fireType
                )
              : totalEstimate.min,

          max:
            selectedFilm
              ? adjustEstimateByFilm(
                  totalEstimate.max,
                  selectedFilm,
                  fireType
                )
              : totalEstimate.max,

          average:
            selectedFilm
              ? adjustEstimateByFilm(
                  totalEstimate.average,
                  selectedFilm,
                  fireType
                )
              : totalEstimate.average,
        }
      : null;

  /* =========================================================
     상담 사진 저장
  ========================================================= */

  async function uploadLeadPhotos() {
    if (
      Array.isArray(
        estimatePhotoPathsRef
          .current
      ) &&
      estimatePhotoPathsRef
        .current.length > 0
    ) {
      return (
        estimatePhotoPathsRef
          .current
      );
    }

    const paths = [];
    const uploadErrors =
      [];

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

  /* =========================================================
     상담 신청
  ========================================================= */

  async function handleLeadSubmit(
    event
  ) {
    event
      ?.preventDefault?.();

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
      phoneNumbers.length < 9
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
                group
                  .subCategory
                  ? ` · ${
                      group
                        .subCategory
                    }`
                  : ""
              } (${
                group.photos
                  .length
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
          .filter(
            Boolean
          )
          .join(", ");

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
              group.estimate
                .min
            ).toLocaleString(
              "ko-KR"
            )}~${Number(
              group.estimate
                .max
            ).toLocaleString(
              "ko-KR"
            )}원`;
          }
        );

      if (selectedFilm) {
        memoLines.push("");

        memoLines.push(
          `선택 필름: ${
            selectedFilm
              .product_code ||
            ""
          }${
            selectedFilm
              .product_name
              ? ` · ${
                  selectedFilm
                    .product_name
                }`
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
                  customerName
                    .trim(),

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

  /* =========================================================
     사진 추가
  ========================================================= */

  async function handleAddImages(
    files
  ) {
    setResultMode("");
    setSelectedFilm(null);
    setFireType(
      "non_fire"
    );
    setUseSplitTone(
      false
    );
    setAreaFilms({});
    setLeadComplete(
      false
    );
    setLeadMessage("");

    await addImages(
      files
    );
  }

  /* =========================================================
     사진 삭제
  ========================================================= */

  function handleRemoveImage(
    id
  ) {
    setResultMode("");
    setSelectedFilm(null);
    setFireType(
      "non_fire"
    );
    setUseSplitTone(
      false
    );
    setAreaFilms({});
    setLeadComplete(
      false
    );
    setLeadMessage("");

    removeImage(id);
  }

  /* =========================================================
     AI 분석
  ========================================================= */

  async function startAnalyze() {
    setResultMode("");
    setSelectedFilm(null);
    setFireType(
      "non_fire"
    );
    setUseSplitTone(
      false
    );
    setAreaFilms({});
    setLeadComplete(
      false
    );
    setLeadMessage("");

    await handleAnalyze();
  }

  /* =========================================================
     로딩
  ========================================================= */

  if (tenantLoading) {
    return (
      <main
        style={{
          minHeight:
            "100vh",
          display:
            "grid",
          placeItems:
            "center",
          background:
            "#ffffff",
          color:
            "#111827",
          padding:
            "24px",
        }}
      >
        <div
          style={{
            fontSize:
              "14px",
            fontWeight:
              "700",
          }}
        >
          업체 정보를 불러오고 있습니다...
        </div>
      </main>
    );
  }

  /* =========================================================
     오류
  ========================================================= */

  if (tenantError) {
    return (
      <main
        style={{
          minHeight:
            "100vh",
          display:
            "grid",
          placeItems:
            "center",
          background:
            "#f9fafb",
          padding:
            "24px",
        }}
      >
        <div
          style={{
            width:
              "100%",
            maxWidth:
              "440px",
            background:
              "#ffffff",
            padding:
              "24px",
            borderRadius:
              "18px",
            border:
              "1px solid #fee2e2",
          }}
        >
          <div
            style={{
              fontSize:
                "18px",
              fontWeight:
                "900",
              marginBottom:
                "8px",
            }}
          >
            페이지를 열 수 없습니다
          </div>

          <div
            style={{
              fontSize:
                "14px",
              lineHeight:
                1.6,
              color:
                "#b91c1c",
            }}
          >
            {tenantError}
          </div>
        </div>
      </main>
    );
            }
  /* =========================================================
     화면
  ========================================================= */

  return (
    <main
      style={{
        minHeight:
          "100vh",
        background:
          "#ffffff",
        color:
          "#111827",
        fontFamily:
          'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          width:
            "100%",
          maxWidth:
            "680px",
          margin:
            "0 auto",
          padding:
            "0 18px 70px",
          boxSizing:
            "border-box",
        }}
      >
        {/* =====================================================
            헤더
        ===================================================== */}

        <header
          style={{
            height:
              "68px",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap:
              "12px",
            borderBottom:
              "1px solid #f1f3f5",
          }}
        >
          <div
            style={{
              minWidth:
                0,
              fontSize:
                "17px",
              fontWeight:
                "900",
              letterSpacing:
                "-0.02em",
              whiteSpace:
                "nowrap",
              overflow:
                "hidden",
              textOverflow:
                "ellipsis",
            }}
          >
            {companyName}
          </div>

          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              gap:
                "8px",
              flexShrink:
                0,
            }}
          >
            <Link
              href={
                companySlug
                  ? `/samples?company=${encodeURIComponent(
                      companySlug
                    )}`
                  : "/samples"
              }
              style={{
                color:
                  "#4b5563",
                textDecoration:
                  "none",
                fontSize:
                  "13px",
                fontWeight:
                  "700",
              }}
            >
              필름 샘플
            </Link>

            <Link
              href="/admin"
              aria-label="관리자"
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                width:
                  "34px",
                height:
                  "34px",
                borderRadius:
                  "50%",
                background:
                  "#f5f6f7",
                color:
                  "#6b7280",
                textDecoration:
                  "none",
                fontSize:
                  "14px",
              }}
            >
              ⚙
            </Link>
          </div>
        </header>

        {/* =====================================================
            메인 소개
        ===================================================== */}

        <section
          style={{
            padding:
              "38px 0 30px",
          }}
        >
          <div
            style={{
              display:
                "inline-flex",
              alignItems:
                "center",
              gap:
                "5px",
              marginBottom:
                "14px",
              color:
                "#246bfd",
              fontSize:
                "13px",
              fontWeight:
                "800",
            }}
          >
            ✦ AI 인테리어필름 견적
          </div>

          <h1
            style={{
              margin:
                0,
              maxWidth:
                "600px",
              fontSize:
                "clamp(30px, 8vw, 42px)",
              lineHeight:
                1.2,
              letterSpacing:
                "-0.045em",
              fontWeight:
                "900",
              wordBreak:
                "keep-all",
            }}
          >
            인테리어필름,
            <br />
            <span
              style={{
                color:
                  "#246bfd",
              }}
            >
              사진으로 먼저
            </span>
            <br />
            견적 받아보세요
          </h1>

          <p
            style={{
              margin:
                "18px 0 0",
              maxWidth:
                "560px",
              color:
                "#6b7280",
              fontSize:
                "16px",
              lineHeight:
                1.7,
              letterSpacing:
                "-0.01em",
              wordBreak:
                "keep-all",
            }}
          >
            {estimateDescription}
          </p>

          <a
            href="#estimate-start"
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              width:
                "100%",
              minHeight:
                "56px",
              marginTop:
                "26px",
              borderRadius:
                "14px",
              background:
                "#246bfd",
              color:
                "#ffffff",
              textDecoration:
                "none",
              fontSize:
                "16px",
              fontWeight:
                "900",
              boxShadow:
                "0 8px 20px rgba(36,107,253,0.20)",
            }}
          >
            사진 올리고 견적 받기
          </a>

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "center",
              gap:
                "16px",
              marginTop:
                "15px",
              color:
                "#9ca3af",
              fontSize:
                "11px",
              fontWeight:
                "600",
            }}
          >
            <span>
              ✓ 간편 사진 등록
            </span>

            <span>
              ✓ AI 예상 견적
            </span>

            <span>
              ✓ 가상 시공
            </span>
          </div>
        </section>

        {/* =====================================================
            간단 설명
        ===================================================== */}

        <section
          style={{
            marginBottom:
              "34px",
            padding:
              "22px 0",
            borderTop:
              "1px solid #f0f1f3",
            borderBottom:
              "1px solid #f0f1f3",
          }}
        >
          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(3, 1fr)",
              gap:
                "10px",
            }}
          >
            {[
              [
                "1",
                "사진 등록",
                "시공할 곳을 찍어주세요",
              ],
              [
                "2",
                "AI 견적",
                "예상 비용을 확인하세요",
              ],
              [
                "3",
                "가상 시공",
                "필름 적용 모습을 미리 보세요",
              ],
            ].map(
              ([
                number,
                title,
                description,
              ]) => (
                <div
                  key={
                    number
                  }
                  style={{
                    minWidth:
                      0,
                    textAlign:
                      "center",
                  }}
                >
                  <div
                    style={{
                      width:
                        "28px",
                      height:
                        "28px",
                      margin:
                        "0 auto 9px",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      borderRadius:
                        "50%",
                      background:
                        "#eef4ff",
                      color:
                        "#246bfd",
                      fontSize:
                        "12px",
                      fontWeight:
                        "900",
                    }}
                  >
                    {number}
                  </div>

                  <div
                    style={{
                      marginBottom:
                        "4px",
                      color:
                        "#111827",
                      fontSize:
                        "13px",
                      fontWeight:
                        "900",
                      wordBreak:
                        "keep-all",
                    }}
                  >
                    {title}
                  </div>

                  <div
                    style={{
                      color:
                        "#9ca3af",
                      fontSize:
                        "10px",
                      lineHeight:
                        1.45,
                      wordBreak:
                        "keep-all",
                    }}
                  >
                    {description}
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        {/* =====================================================
            사진 업로드
        ===================================================== */}

        <section
          id="estimate-start"
          style={{
            scrollMarginTop:
              "20px",
            paddingBottom:
              "30px",
          }}
        >
          <div
            style={{
              marginBottom:
                "16px",
            }}
          >
            <div
              style={{
                marginBottom:
                  "6px",
                color:
                  "#246bfd",
                fontSize:
                  "12px",
                fontWeight:
                  "900",
              }}
            >
              STEP 1
            </div>

            <h2
              style={{
                margin:
                  0,
                fontSize:
                  "23px",
                lineHeight:
                  1.35,
                letterSpacing:
                  "-0.03em",
                fontWeight:
                  "900",
              }}
            >
              시공할 곳의 사진을
              <br />
              올려주세요
            </h2>

            <p
              style={{
                margin:
                  "8px 0 0",
                color:
                  "#8b95a1",
                fontSize:
                  "14px",
                lineHeight:
                  1.55,
                wordBreak:
                  "keep-all",
              }}
            >
              여러 장을 한 번에 올려도 됩니다.
              <br />
              AI가 같은 부위끼리 자동으로 분석합니다.
            </p>
          </div>

          <div
            style={{
              border:
                "1px solid #e9ecef",
              borderRadius:
                "18px",
              padding:
                "16px",
              background:
                "#ffffff",
            }}
          >
            <EstimatePhotoUploader
              images={
                images
              }
              loading={
                loading
              }
              imageLoading={
                imageLoading
              }
              message={
                message
              }
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
          </div>
        </section>

        {/* =====================================================
            결과는 분석 전에는 숨김
        ===================================================== */}

        {groups.length >
          0 && (
          <>
            {/* =================================================
                AI 견적 결과
            ================================================= */}

            <section
              style={{
                padding:
                  "30px 0",
                borderTop:
                  "8px solid #f7f8fa",
              }}
            >
              <div
                style={{
                  marginBottom:
                    "16px",
                }}
              >
                <div
                  style={{
                    marginBottom:
                      "6px",
                    color:
                      "#246bfd",
                    fontSize:
                      "12px",
                    fontWeight:
                      "900",
                  }}
                >
                  STEP 2
                </div>

                <h2
                  style={{
                    margin:
                      0,
                    fontSize:
                      "23px",
                    letterSpacing:
                      "-0.03em",
                    fontWeight:
                      "900",
                  }}
                >
                  AI 예상 견적
                </h2>

                <p
                  style={{
                    margin:
                      "7px 0 0",
                    color:
                      "#8b95a1",
                    fontSize:
                      "13px",
                    lineHeight:
                      1.55,
                  }}
                >
                  사진 분석 결과를 기준으로 계산한 예상 금액입니다.
                </p>
              </div>

              <div
                style={{
                  border:
                    "1px solid #e9ecef",
                  borderRadius:
                    "18px",
                  overflow:
                    "hidden",
                  background:
                    "#ffffff",
                }}
              >
                <EstimateResult
                  groups={
                    displayGroups
                  }
                  imageCount={
                    images.length
                  }
                />

                <div
                  style={{
                    height:
                      "1px",
                    margin:
                      "0 16px",
                    background:
                      "#f1f3f5",
                  }}
                />

                <EstimateTotal
                  totalEstimate={
                    displayTotalEstimate
                  }
                />
              </div>

              <div
                style={{
                  marginTop:
                    "10px",
                  color:
                    "#a1a8b3",
                  fontSize:
                    "11px",
                  lineHeight:
                    1.5,
                }}
              >
                실제 견적은 현장 상태, 시공 범위 및 자재 조건에 따라 달라질 수 있습니다.
              </div>
            </section>

            {/* =================================================
                다음 선택
            ================================================= */}

            <section
              style={{
                padding:
                  "30px 0",
                borderTop:
                  "8px solid #f7f8fa",
              }}
            >
              <div
                style={{
                  marginBottom:
                    "16px",
                }}
              >
                <div
                  style={{
                    marginBottom:
                      "6px",
                    color:
                      "#246bfd",
                    fontSize:
                      "12px",
                    fontWeight:
                      "900",
                  }}
                >
                  STEP 3
                </div>

                <h2
                  style={{
                    margin:
                      0,
                    fontSize:
                      "23px",
                    lineHeight:
                      1.35,
                    letterSpacing:
                      "-0.03em",
                    fontWeight:
                      "900",
                  }}
                >
                  이제 원하는 방법을
                  <br />
                  선택해주세요
                </h2>

                <p
                  style={{
                    margin:
                      "8px 0 0",
                    color:
                      "#8b95a1",
                    fontSize:
                      "14px",
                    lineHeight:
                      1.55,
                    wordBreak:
                      "keep-all",
                  }}
                >
                  필름을 골라 시공 후 모습을 미리 보거나,
                  상세 상담을 신청할 수 있습니다.
                </p>
              </div>

              <ServiceSelector
                groups={
                  groups
                }
                resultMode={
                  resultMode
                }
                onChange={
                  setResultMode
                }
              />
            </section>
          </>
        )}

        {/* =====================================================
            가상 시공
        ===================================================== */}

        {groups.length >
          0 &&
          resultMode ===
            "virtual" && (
            <section
              style={{
                padding:
                  "30px 0",
                borderTop:
                  "8px solid #f7f8fa",
              }}
            >
              <div
                style={{
                  marginBottom:
                    "22px",
                }}
              >
                <div
                  style={{
                    display:
                      "inline-flex",
                    alignItems:
                      "center",
                    gap:
                      "5px",
                    marginBottom:
                      "7px",
                    color:
                      "#246bfd",
                    fontSize:
                      "12px",
                    fontWeight:
                      "900",
                  }}
                >
                  ✦ AI 가상 시공
                </div>

                <h2
                  style={{
                    margin:
                      0,
                    fontSize:
                      "25px",
                    lineHeight:
                      1.3,
                    letterSpacing:
                      "-0.035em",
                    fontWeight:
                      "900",
                  }}
                >
                  시공 전에
                  <br />
                  먼저 확인해보세요
                </h2>

                <p
                  style={{
                    margin:
                      "9px 0 0",
                    color:
                      "#8b95a1",
                    fontSize:
                      "14px",
                    lineHeight:
                      1.6,
                  }}
                >
                  원하는 필름을 선택하면 가격 변화와 시공 후 모습을 미리 확인할 수 있습니다.
                </p>
              </div>

              {/* 필름 선택 */}

              <div
                style={{
                  marginBottom:
                    "26px",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap:
                      "9px",
                    marginBottom:
                      "12px",
                  }}
                >
                  <div
                    style={{
                      width:
                        "25px",
                      height:
                        "25px",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      borderRadius:
                        "50%",
                      background:
                        "#246bfd",
                      color:
                        "#ffffff",
                      fontSize:
                        "11px",
                      fontWeight:
                        "900",
                    }}
                  >
                    1
                  </div>

                  <div
                    style={{
                      fontSize:
                        "17px",
                      fontWeight:
                        "900",
                    }}
                  >
                    원하는 필름 선택
                  </div>
                </div>

                <FilmColorPicker
                  onSelect={
                    handleFilmSelect
                  }
                />
              </div>

              {/* 컬러 적용 */}

              <div
                style={{
                  marginBottom:
                    "26px",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap:
                      "9px",
                    marginBottom:
                      "12px",
                  }}
                >
                  <div
                    style={{
                      width:
                        "25px",
                      height:
                        "25px",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      borderRadius:
                        "50%",
                      background:
                        "#246bfd",
                      color:
                        "#ffffff",
                      fontSize:
                        "11px",
                      fontWeight:
                        "900",
                    }}
                  >
                    2
                  </div>

                  <div
                    style={{
                      fontSize:
                        "17px",
                      fontWeight:
                        "900",
                    }}
                  >
                    컬러 적용 방식
                  </div>
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

              {/* 가격 */}

              <div
                style={{
                  marginBottom:
                    "26px",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap:
                      "9px",
                    marginBottom:
                      "12px",
                  }}
                >
                  <div
                    style={{
                      width:
                        "25px",
                      height:
                        "25px",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      borderRadius:
                        "50%",
                      background:
                        "#246bfd",
                      color:
                        "#ffffff",
                      fontSize:
                        "11px",
                      fontWeight:
                        "900",
                    }}
                  >
                    3
                  </div>

                  <div
                    style={{
                      fontSize:
                        "17px",
                      fontWeight:
                        "900",
                    }}
                  >
                    자재 조건과 견적
                  </div>
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
              </div>

              {/* 가상 시공 결과 */}

              <div>
                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap:
                      "9px",
                    marginBottom:
                      "12px",
                  }}
                >
                  <div
                    style={{
                      width:
                        "25px",
                      height:
                        "25px",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      borderRadius:
                        "50%",
                      background:
                        "#246bfd",
                      color:
                        "#ffffff",
                      fontSize:
                        "11px",
                      fontWeight:
                        "900",
                    }}
                  >
                    4
                  </div>

                  <div
                    style={{
                      fontSize:
                        "17px",
                      fontWeight:
                        "900",
                    }}
                  >
                    AI 가상 시공 보기
                  </div>
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
                    setResultMode(
                      "detail"
                    )
                  }
                />
              </div>
            </section>
          )}

        {/* =====================================================
            상세 상담
        ===================================================== */}

        {groups.length >
          0 &&
          resultMode ===
            "detail" && (
            <section
              style={{
                padding:
                  "30px 0",
                borderTop:
                  "8px solid #f7f8fa",
              }}
            >
              <div
                style={{
                  marginBottom:
                    "18px",
                }}
              >
                <div
                  style={{
                    marginBottom:
                      "6px",
                    color:
                      "#246bfd",
                    fontSize:
                      "12px",
                    fontWeight:
                      "900",
                  }}
                >
                  상세 상담
                </div>

                <h2
                  style={{
                    margin:
                      0,
                    fontSize:
                      "24px",
                    lineHeight:
                      1.35,
                    letterSpacing:
                      "-0.03em",
                    fontWeight:
                      "900",
                  }}
                >
                  정확한 견적이 필요하신가요?
                </h2>

                <p
                  style={{
                    margin:
                      "8px 0 0",
                    color:
                      "#8b95a1",
                    fontSize:
                      "14px",
                    lineHeight:
                      1.55,
                  }}
                >
                  AI 견적 결과와 선택한 필름 정보를 함께 전달해 상담을 도와드립니다.
                </p>
              </div>

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
            </section>
          )}

        {/* =====================================================
            하단
        ===================================================== */}

        <footer
          style={{
            marginTop:
              "28px",
            padding:
              "28px 0",
            borderTop:
              "1px solid #f1f3f5",
          }}
        >
          <div
            style={{
              fontSize:
                "14px",
              fontWeight:
                "900",
              marginBottom:
                "7px",
            }}
          >
            {companyName}
          </div>

          <div
            style={{
              color:
                "#9ca3af",
              fontSize:
                "11px",
              lineHeight:
                1.6,
            }}
          >
            {estimateTitle}
            <br />
            AI 예상 견적은 실제 현장 상태와 시공 조건에 따라 달라질 수 있습니다.
          </div>
        </footer>
      </div>
    </main>
  );
          }
