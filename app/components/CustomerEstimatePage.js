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
   * 업체 로딩 / 오류
   *
   * 중요:
   * 모든 React Hook 호출 이후에 위치해야 함.
   * =========================================================
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
        <div
          style={{
            fontWeight: "800",
          }}
        >
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
            border:
              "1px solid #fecaca",
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
   * 화면
   * =========================================================
   */

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #eef3f8 0%, #f8fafc 34%, #ffffff 100%)",
        color: "#0f172a",
        fontFamily:
          'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "760px",
          margin: "0 auto",
          padding: "14px 16px 80px",
          boxSizing: "border-box",
        }}
      >
        {/* =====================================================
            상단 헤더
        ===================================================== */}

        <header
          style={{
            position: "sticky",
            top: "8px",
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            marginBottom: "14px",
            padding: "10px 12px",
            border: "1px solid rgba(226,232,240,0.88)",
            borderRadius: "18px",
            background: "rgba(255,255,255,0.92)",
            boxShadow: "0 8px 30px rgba(15,23,42,0.08)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div
            style={{
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: "800",
                letterSpacing: "0.12em",
                color: "#2563eb",
                marginBottom: "2px",
              }}
            >
              AI INTERIOR FILM
            </div>

            <div
              style={{
                fontSize: "15px",
                fontWeight: "900",
                color: "#0f172a",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {companyName}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              flexShrink: 0,
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
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "38px",
                padding: "0 11px",
                border: "1px solid #dbe3ee",
                borderRadius: "12px",
                background: "#ffffff",
                color: "#334155",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: "800",
              }}
            >
              필름 샘플
            </Link>

            <Link
              href="/admin"
              aria-label="관리자 페이지"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "38px",
                height: "38px",
                border: "1px solid #dbe3ee",
                borderRadius: "12px",
                background: "#ffffff",
                color: "#64748b",
                textDecoration: "none",
                fontSize: "15px",
                fontWeight: "800",
              }}
            >
              ⚙️
            </Link>
          </div>
        </header>

        {/* =====================================================
            히어로
        ===================================================== */}

        <section
          style={{
            position: "relative",
            overflow: "hidden",
            marginBottom: "16px",
            padding: "28px 22px 24px",
            borderRadius: "26px",
            background:
              "linear-gradient(135deg, #0b1220 0%, #172554 56%, #1d4ed8 125%)",
            color: "#ffffff",
            boxShadow: "0 18px 50px rgba(15,23,42,0.18)",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "190px",
              height: "190px",
              right: "-70px",
              top: "-80px",
              borderRadius: "999px",
              background: "rgba(96,165,250,0.20)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "absolute",
              width: "120px",
              height: "120px",
              left: "-55px",
              bottom: "-55px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.08)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              zIndex: 1,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "14px",
                padding: "7px 10px",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.10)",
                fontSize: "12px",
                fontWeight: "800",
                color: "#dbeafe",
              }}
            >
              ✨ 사진 한 장으로 시작하는 AI 견적
            </div>

            <h1
              style={{
                margin: 0,
                maxWidth: "600px",
                fontSize: "clamp(30px, 8vw, 44px)",
                lineHeight: 1.14,
                letterSpacing: "-0.045em",
                fontWeight: "900",
              }}
            >
              견적부터
              <br />
              <span style={{ color: "#93c5fd" }}>
                가상 시공
              </span>
              까지
              <br />
              한 번에 확인하세요
            </h1>

            <p
              style={{
                margin: "16px 0 0",
                maxWidth: "610px",
                color: "#cbd5e1",
                fontSize: "15px",
                lineHeight: 1.7,
                wordBreak: "keep-all",
              }}
            >
              {estimateDescription}
            </p>

            <a
              href="#ai-estimate-start"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                marginTop: "20px",
                minHeight: "48px",
                padding: "0 18px",
                borderRadius: "14px",
                background: "#ffffff",
                color: "#0f172a",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "900",
                boxShadow:
                  "0 10px 25px rgba(0,0,0,0.16)",
              }}
            >
              사진으로 AI 견적 시작
              <span aria-hidden="true">
                →
              </span>
            </a>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "18px",
              }}
            >
              {[
                "AI 자동견적",
                "실제 필름 선택",
                "가상 시공 미리보기",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    padding: "7px 10px",
                    borderRadius: "999px",
                    background:
                      "rgba(255,255,255,0.09)",
                    border:
                      "1px solid rgba(255,255,255,0.12)",
                    color: "#e2e8f0",
                    fontSize: "11px",
                    fontWeight: "800",
                  }}
                >
                  ✓ {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =====================================================
            이용 흐름
        ===================================================== */}

        <section
          style={{
            marginBottom: "16px",
            padding: "16px",
            border:
              "1px solid #e5eaf1",
            borderRadius: "20px",
            background:
              "rgba(255,255,255,0.94)",
            boxShadow:
              "0 8px 26px rgba(15,23,42,0.05)",
          }}
        >
          <div
            style={{
              marginBottom: "12px",
              fontSize: "13px",
              fontWeight: "900",
              color: "#0f172a",
            }}
          >
            이렇게 진행됩니다
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(4, minmax(0, 1fr))",
              gap: "7px",
            }}
          >
            {[
              ["01", "사진 업로드"],
              ["02", "AI 견적"],
              ["03", "필름 선택"],
              ["04", "가상 시공"],
            ].map(
              ([number, label]) => (
                <div
                  key={number}
                  style={{
                    minWidth: 0,
                    padding:
                      "11px 7px",
                    borderRadius:
                      "14px",
                    background:
                      "#f8fafc",
                    border:
                      "1px solid #edf1f5",
                    textAlign:
                      "center",
                  }}
                >
                  <div
                    style={{
                      marginBottom:
                        "4px",
                      fontSize:
                        "10px",
                      fontWeight:
                        "900",
                      color:
                        "#2563eb",
                      letterSpacing:
                        "0.08em",
                    }}
                  >
                    STEP {number}
                  </div>

                  <div
                    style={{
                      fontSize:
                        "11px",
                      lineHeight:
                        1.35,
                      fontWeight:
                        "800",
                      color:
                        "#334155",
                      wordBreak:
                        "keep-all",
                    }}
                  >
                    {label}
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        {/* =====================================================
            1. 사진 등록
        ===================================================== */}

        <section
          id="ai-estimate-start"
          style={{
            marginBottom: "14px",
            padding: "18px",
            border:
              "1px solid #e5eaf1",
            borderRadius: "22px",
            background: "#ffffff",
            boxShadow:
              "0 10px 30px rgba(15,23,42,0.055)",
            scrollMarginTop:
              "82px",
          }}
        >
          <div
            style={{
              marginBottom: "14px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                marginBottom: "7px",
                padding: "5px 8px",
                borderRadius:
                  "999px",
                background:
                  "#eff6ff",
                color: "#2563eb",
                fontSize: "10px",
                fontWeight: "900",
                letterSpacing:
                  "0.08em",
              }}
            >
              STEP 01
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                lineHeight: 1.3,
                letterSpacing:
                  "-0.03em",
                fontWeight: "900",
                color: "#0f172a",
              }}
            >
              시공할 곳의 사진을 올려주세요
            </h2>

            <p
              style={{
                margin:
                  "7px 0 0",
                color: "#64748b",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              여러 장을 올리면 AI가 같은 시공 부위끼리 분석해 견적을 계산합니다.
            </p>
          </div>

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
        </section>

        {/* =====================================================
            2. AI 분석 결과
        ===================================================== */}

        <section
          style={{
            marginBottom: "14px",
            padding: "18px",
            border:
              "1px solid #e5eaf1",
            borderRadius: "22px",
            background: "#ffffff",
            boxShadow:
              "0 10px 30px rgba(15,23,42,0.055)",
          }}
        >
          <div
            style={{
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                marginBottom: "7px",
                padding: "5px 8px",
                borderRadius:
                  "999px",
                background:
                  "#eef2ff",
                color: "#4f46e5",
                fontSize: "10px",
                fontWeight: "900",
                letterSpacing:
                  "0.08em",
              }}
            >
              STEP 02
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                lineHeight: 1.3,
                letterSpacing:
                  "-0.03em",
                fontWeight: "900",
              }}
            >
              AI 분석 · 예상 견적
            </h2>
          </div>

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
              height: "1px",
              margin: "16px 0",
              background:
                "#eef2f6",
            }}
          />

          <EstimateTotal
            totalEstimate={
              displayTotalEstimate
            }
          />
        </section>

        {/* =====================================================
            3. 서비스 선택
        ===================================================== */}

        <section
          style={{
            marginBottom: "14px",
            padding: "18px",
            border:
              "1px solid #dce7f5",
            borderRadius: "22px",
            background:
              "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
            boxShadow:
              "0 10px 30px rgba(15,23,42,0.055)",
          }}
        >
          <div
            style={{
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                marginBottom: "7px",
                padding: "5px 8px",
                borderRadius:
                  "999px",
                background:
                  "#ecfeff",
                color: "#0f766e",
                fontSize: "10px",
                fontWeight: "900",
                letterSpacing:
                  "0.08em",
              }}
            >
              NEXT
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                lineHeight: 1.3,
                letterSpacing:
                  "-0.03em",
                fontWeight: "900",
              }}
            >
              다음으로 무엇을 확인할까요?
            </h2>

            <p
              style={{
                margin:
                  "7px 0 0",
                color: "#64748b",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              원하는 필름을 적용해 가상 시공을 보거나 상세 상담을 신청할 수 있습니다.
            </p>
          </div>

          <ServiceSelector
            groups={groups}
            resultMode={
              resultMode
            }
            onChange={
              setResultMode
            }
          />
        </section>

        {/* =====================================================
            4. 가상 시공
        ===================================================== */}

        {groups.length >
          0 &&
          resultMode ===
            "virtual" && (
            <section
              style={{
                marginBottom:
                  "14px",
                padding: "18px",
                border:
                  "1px solid #dbeafe",
                borderRadius:
                  "24px",
                background:
                  "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
                boxShadow:
                  "0 14px 36px rgba(37,99,235,0.08)",
              }}
            >
              <div
                style={{
                  marginBottom:
                    "16px",
                  padding: "15px",
                  borderRadius:
                    "18px",
                  background:
                    "linear-gradient(135deg, #172554 0%, #1d4ed8 100%)",
                  color:
                    "#ffffff",
                }}
              >
                <div
                  style={{
                    marginBottom:
                      "6px",
                    fontSize:
                      "10px",
                    fontWeight:
                      "900",
                    letterSpacing:
                      "0.12em",
                    color:
                      "#bfdbfe",
                  }}
                >
                  AI VIRTUAL REMODELING
                </div>

                <h2
                  style={{
                    margin: 0,
                    fontSize:
                      "22px",
                    lineHeight:
                      1.3,
                    letterSpacing:
                      "-0.035em",
                    fontWeight:
                      "900",
                  }}
                >
                  시공 전에 색상과 분위기를 먼저 확인하세요
                </h2>

                <p
                  style={{
                    margin:
                      "8px 0 0",
                    color:
                      "#dbeafe",
                    fontSize:
                      "12px",
                    lineHeight:
                      1.6,
                  }}
                >
                  필름을 고르면 예상 견적 변화와 가상 시공 이미지를 함께 확인할 수 있습니다.
                </p>
              </div>

              <div
                style={{
                  marginBottom:
                    "12px",
                  padding: "14px",
                  border:
                    "1px solid #e5eaf1",
                  borderRadius:
                    "18px",
                  background:
                    "#ffffff",
                }}
              >
                <div
                  style={{
                    marginBottom:
                      "10px",
                    fontSize:
                      "13px",
                    fontWeight:
                      "900",
                    color:
                      "#0f172a",
                  }}
                >
                  1. 필름 선택
                </div>

                <FilmColorPicker
                  onSelect={
                    handleFilmSelect
                  }
                />
              </div>

              <div
                style={{
                  marginBottom:
                    "12px",
                  padding: "14px",
                  border:
                    "1px solid #e5eaf1",
                  borderRadius:
                    "18px",
                  background:
                    "#ffffff",
                }}
              >
                <div
                  style={{
                    marginBottom:
                      "10px",
                    fontSize:
                      "13px",
                    fontWeight:
                      "900",
                    color:
                      "#0f172a",
                  }}
                >
                  2. 컬러 적용 방식
                </div>

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
              </div>

              <div
                style={{
                  marginBottom:
                    "12px",
                  padding: "14px",
                  border:
                    "1px solid #e5eaf1",
                  borderRadius:
                    "18px",
                  background:
                    "#ffffff",
                }}
              >
                <div
                  style={{
                    marginBottom:
                      "10px",
                    fontSize:
                      "13px",
                    fontWeight:
                      "900",
                    color:
                      "#0f172a",
                  }}
                >
                  3. 방염 여부 · 예상 견적
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

              <div
                style={{
                  padding: "14px",
                  border:
                    "1px solid #dbeafe",
                  borderRadius:
                    "18px",
                  background:
                    "#ffffff",
                }}
              >
                <div
                  style={{
                    marginBottom:
                      "10px",
                    fontSize:
                      "13px",
                    fontWeight:
                      "900",
                    color:
                      "#0f172a",
                  }}
                >
                  4. AI 가상 시공
                </div>

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
            5. 상세견적 상담
        ===================================================== */}

        {groups.length >
          0 &&
          resultMode ===
            "detail" && (
            <section
              style={{
                marginBottom:
                  "14px",
                padding: "18px",
                border:
                  "1px solid #dbeafe",
                borderRadius:
                  "24px",
                background:
                  "#ffffff",
                boxShadow:
                  "0 14px 36px rgba(15,23,42,0.07)",
              }}
            >
              <div
                style={{
                  marginBottom:
                    "12px",
                }}
              >
                <div
                  style={{
                    display:
                      "inline-flex",
                    alignItems:
                      "center",
                    marginBottom:
                      "7px",
                    padding:
                      "5px 8px",
                    borderRadius:
                      "999px",
                    background:
                      "#eff6ff",
                    color:
                      "#2563eb",
                    fontSize:
                      "10px",
                    fontWeight:
                      "900",
                    letterSpacing:
                      "0.08em",
                  }}
                >
                  CONSULTATION
                </div>

                <h2
                  style={{
                    margin: 0,
                    fontSize:
                      "21px",
                    lineHeight:
                      1.3,
                    letterSpacing:
                      "-0.03em",
                    fontWeight:
                      "900",
                  }}
                >
                  상세 견적 상담 신청
                </h2>

                <p
                  style={{
                    margin:
                      "7px 0 0",
                    color:
                      "#64748b",
                    fontSize:
                      "13px",
                    lineHeight:
                      1.6,
                  }}
                >
                  AI 견적 결과와 선택한 필름 정보를 함께 전달합니다.
                </p>
              </div>

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
            </section>
          )}

        {/* =====================================================
            하단
        ===================================================== */}

        <section
          style={{
            marginTop: "18px",
            padding: "18px",
            borderRadius: "20px",
            background: "#0f172a",
            color: "#ffffff",
            textAlign: "center",
          }}
        >
          <div
            style={{
              marginBottom: "5px",
              fontSize: "15px",
              fontWeight: "900",
            }}
          >
            {companyName}
          </div>

          <div
            style={{
              color: "#94a3b8",
              fontSize: "12px",
              lineHeight: 1.6,
            }}
          >
            {estimateTitle}
            <br />
            AI 예상 견적은 실제 현장 상태와 시공 조건에 따라 달라질 수 있습니다.
          </div>
        </section>
      </div>
    </main>
  );
}
