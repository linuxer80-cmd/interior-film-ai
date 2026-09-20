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
  const [tenantLoading, setTenantLoading] = useState(
    Boolean(companySlug)
  );

  const [tenantError, setTenantError] = useState("");
  const [company, setCompany] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);

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
        const response = await fetch(
          `/api/public-company?slug=${encodeURIComponent(
            companySlug
          )}`,
          {
            cache: "no-store",
          }
        );

        const text = await response.text();

        let result = null;

        try {
          result = JSON.parse(text);
        } catch {
          throw new Error(
            text
              ? `서버 응답 오류: ${text.slice(0, 200)}`
              : "업체 정보를 불러오지 못했습니다."
          );
        }

        if (!response.ok || !result?.success || !result?.company) {
          throw new Error(
            result?.error || "업체 정보를 불러오지 못했습니다."
          );
        }

        if (!cancelled) {
          setCompany(result.company);
          setCompanySettings(result.settings || null);
        }
      } catch (error) {
        console.error("업체 정보 조회 오류:", error);

        if (!cancelled) {
          setTenantError(
            error?.message || "업체 정보를 불러오지 못했습니다."
          );
        }
      } finally {
        if (!cancelled) {
          setTenantLoading(false);
        }
      }
    }

    loadCompany();

    return () => {
      cancelled = true;
    };
  }, [companySlug]);

  const companyName =
    company?.company_name || fallbackCompanyName;

  const estimateTitle =
    companySettings?.estimate_title ||
    "AI 인테리어필름 견적";

  const estimateDescription =
    companySettings?.estimate_description ||
    "여러 시공 부위의 사진을 한 번에 올려주세요. AI가 같은 부위끼리 묶어서 예상견적을 계산합니다.";

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
  } = useEstimate({ companySlug });

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
   * 부분 톤 차이
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
   * 중요:
   * 모든 React Hook 호출이 끝난 뒤에만
   * 로딩/오류 화면을 return 합니다.
   */

  if (tenantLoading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f8fafc",
          color: "#111827",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontWeight: "800" }}>
          업체 정보를 불러오고 있습니다...
        </div>
      </main>
    );
  }

  if (tenantError) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f8fafc",
          color: "#111827",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "520px",
            padding: "22px",
            border: "1px solid #fecaca",
            borderRadius: "16px",
            background: "#ffffff",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              marginBottom: "8px",
              fontSize: "18px",
              fontWeight: "900",
            }}
          >
            업체 페이지를 열 수 없습니다.
          </div>

          <div
            style={{
              color: "#b91c1c",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            {tenantError}
          </div>
        </div>
      </main>
    );
  }

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
   * 선택 필름 적용 부위별 수정견적
   * =========================================================
   */

  const displayGroups =
    groups.map((group) => {
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
    });

  /*
   * =========================================================
   * 선택 필름 적용 총 수정견적
   * =========================================================
   */

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

                company_slug:
                  companySlug || null,
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
      <nav
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          marginBottom: "18px",
        }}
      >
        <div
          style={{
            padding: "11px",
            textAlign: "center",
            borderRadius: "11px",
            background: "#111827",
            color: "#ffffff",
            fontWeight: "800",
            fontSize: "14px",
          }}
        >
          AI 견적
        </div>

        <Link
          href={
  companySlug
    ? `/samples?company=${encodeURIComponent(companySlug)}`
    : "/samples"
}
          style={{
            padding: "11px",
            textAlign: "center",
            textDecoration: "none",
            border: "1px solid #d1d5db",
            borderRadius: "11px",
            background: "#ffffff",
            color: "#374151",
            fontWeight: "800",
            fontSize: "14px",
          }}
        >
          필름 샘플보기
        </Link>
      </nav>

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
        {companyName}
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
        {estimateTitle}
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
        {estimateDescription}
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
            {/* 필름 선택 */}

            <FilmColorPicker
              onSelect={
                handleFilmSelect
              }
            />

            {/* 부분 톤 차이 */}

            <VirtualToneSelector
              groups={groups}
              product={selectedFilm}
              useSplitTone={useSplitTone}
              onUseSplitToneChange={
                setUseSplitTone
              }
              areaFilms={areaFilms}
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

            {/*
             * 가상 시공
             *
             * 중요:
             * AI 분석 결과 groups를 전달해서
             * 싱크대 / 문·문틀일 때만
             * 부분 톤 선택 기능을 표시
             */}

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
        {companyName}
        <br />
        {estimateTitle}
      </div>
    </main>
  );
            }
