"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

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

import styles from "./CustomerEstimatePage.module.css";

/* =========================================================
   화면 공통
========================================================= */

function StepLabel({
  children,
}) {
  return (
    <div className={styles.stepLabel}>
      {children}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
}) {
  return (
    <div className={styles.sectionTitleWrap}>
      {eyebrow && (
        <StepLabel>
          {eyebrow}
        </StepLabel>
      )}

      <h2 className={styles.sectionTitle}>
        {title}
      </h2>

      {description && (
        <p className={styles.sectionDescription}>
          {description}
        </p>
      )}
    </div>
  );
}

function MiniFlowItem({
  number,
  title,
  description,
}) {
  return (
    <div className={styles.miniFlowItem}>
      <div className={styles.miniFlowNumber}>
        {number}
      </div>

      <div className={styles.miniFlowContent}>
        <div className={styles.miniFlowTitle}>
          {title}
        </div>

        <div className={styles.miniFlowDescription}>
          {description}
        </div>
      </div>
    </div>
  );
}

function ScrollHint() {
  return (
    <div className={styles.scrollHint}>
      <span>
        아래로 내려 더 알아보기
      </span>

      <div className={styles.scrollArrow}>
        ↓
      </div>
    </div>
  );
}

/* =========================================================
   메인
========================================================= */

export default function CustomerEstimatePage({
  companySlug = null,
  fallbackCompanyName = "기분좋은공간",
}) {
  /* =======================================================
     업체
  ======================================================= */

  const [
    tenantLoading,
    setTenantLoading,
  ] = useState(
    Boolean(companySlug),
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

  /* =======================================================
     스크롤 위치
  ======================================================= */

  const heroRef =
    useRef(null);

  const introRef =
    useRef(null);

  const uploadRef =
    useRef(null);

  const resultRef =
    useRef(null);

  const choiceRef =
    useRef(null);

  const virtualRef =
    useRef(null);

  const leadRef =
    useRef(null);

  const faqRef =
    useRef(null);

  /* =======================================================
     회사 로드
  ======================================================= */

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
              companySlug,
            )}`,
            {
              cache: "no-store",
            },
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
                  200,
                )}`
              : "업체 정보를 불러오지 못했습니다.",
          );
        }

        if (
          !response.ok ||
          !result?.success ||
          !result?.company
        ) {
          throw new Error(
            result?.error ||
              "업체 정보를 불러오지 못했습니다.",
          );
        }

        if (!cancelled) {
          setCompany(
            result.company,
          );

          setCompanySettings(
            result.settings ||
              null,
          );
        }
      } catch (error) {
        console.error(
          "업체 정보 조회 오류:",
          error,
        );

        if (!cancelled) {
          setTenantError(
            error?.message ||
              "업체 정보를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setTenantLoading(
            false,
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

  /* =======================================================
     업체 표시값
  ======================================================= */

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

  /* =======================================================
     AI 견적
  ======================================================= */

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

  /* =======================================================
     화면 상태
  ======================================================= */

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
  ] = useState(
    "non_fire",
  );

  const [
    useSplitTone,
    setUseSplitTone,
  ] = useState(false);

  const [
    areaFilms,
    setAreaFilms,
  ] = useState({});

  /* =======================================================
     상담
  ======================================================= */

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

  /* =======================================================
     부드러운 이동
  ======================================================= */

  function moveTo(ref) {
    if (
      !ref?.current
    ) {
      return;
    }

    ref.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  /* =======================================================
     AI 결과 생성 후 결과 화면으로 이동
  ======================================================= */

  useEffect(() => {
    if (
      groups.length ===
      0
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          moveTo(
            resultRef,
          );
        },
        180,
      );

    return () => {
      window.clearTimeout(
        timer,
      );
    };
  }, [
    groups.length,
  ]);

  /* =======================================================
     가상시공 / 상담 선택 시 이동
  ======================================================= */

  useEffect(() => {
    if (
      resultMode ===
      "virtual"
    ) {
      const timer =
        window.setTimeout(
          () => {
            moveTo(
              virtualRef,
            );
          },
          120,
        );

      return () => {
        window.clearTimeout(
          timer,
        );
      };
    }

    if (
      resultMode ===
      "detail"
    ) {
      const timer =
        window.setTimeout(
          () => {
            moveTo(
              leadRef,
            );
          },
          120,
        );

      return () => {
        window.clearTimeout(
          timer,
        );
      };
    }
  }, [
    resultMode,
  ]);

  /* =======================================================
     전화번호 형식
  ======================================================= */

  function handlePhoneChange(
    value,
  ) {
    const numbers =
      String(
        value ||
          "",
      )
        .replace(
          /[^0-9]/g,
          "",
        )
        .slice(
          0,
          11,
        );

    if (
      numbers.length <=
      3
    ) {
      setPhone(
        numbers,
      );

      return;
    }

    if (
      numbers.length <=
      7
    ) {
      setPhone(
        `${numbers.slice(
          0,
          3,
        )}-${numbers.slice(
          3,
        )}`,
      );

      return;
    }

    setPhone(
      `${numbers.slice(
        0,
        3,
      )}-${numbers.slice(
        3,
        7,
      )}-${numbers.slice(
        7,
      )}`,
    );
  }

  /* =======================================================
     필름 선택
  ======================================================= */

  async function handleFilmSelect(
    film,
  ) {
    if (!film) {
      setSelectedFilm(
        null,
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
          0,
      ) > 0 ||
      Number(
        film
          .non_fire_price_per_meter ||
          0,
      ) > 0;

    if (
      !alreadyHasPrice
    ) {
      try {
        let query =
          supabase
            .from(
              "film_products",
            )
            .select(
              `
                id,
                fire_price_per_meter,
                non_fire_price_per_meter
              `,
            );

        if (film.id) {
          query =
            query.eq(
              "id",
              film.id,
            );
        } else {
          query =
            query
              .eq(
                "brand",
                film.brand,
              )
              .eq(
                "product_code",
                film.product_code,
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
            error,
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
          error,
        );
      }
    }

    setSelectedFilm(
      completedFilm,
    );

    const hasNonFire =
      Number(
        completedFilm
          .non_fire_price_per_meter ||
          0,
      ) > 0;

    const hasFire =
      Number(
        completedFilm
          .fire_price_per_meter ||
          0,
      ) > 0;

    if (
      !hasNonFire &&
      hasFire
    ) {
      setFireType(
        "fire",
      );
    } else if (
      hasNonFire &&
      !hasFire
    ) {
      setFireType(
        "non_fire",
      );
    }
  }

  /* =======================================================
     필름 가격 반영 견적
  ======================================================= */

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
                group
                  .estimate
                  .min,
                selectedFilm,
                fireType,
              ),

            max:
              adjustEstimateByFilm(
                group
                  .estimate
                  .max,
                selectedFilm,
                fireType,
              ),

            average:
              adjustEstimateByFilm(
                group
                  .estimate
                  .average,
                selectedFilm,
                fireType,
              ),
          },
        };
      },
    );

  const displayTotalEstimate =
    totalEstimate
      ? {
          ...totalEstimate,

          min:
            selectedFilm
              ? adjustEstimateByFilm(
                  totalEstimate
                    .min,
                  selectedFilm,
                  fireType,
                )
              : totalEstimate
                  .min,

          max:
            selectedFilm
              ? adjustEstimateByFilm(
                  totalEstimate
                    .max,
                  selectedFilm,
                  fireType,
                )
              : totalEstimate
                  .max,

          average:
            selectedFilm
              ? adjustEstimateByFilm(
                  totalEstimate
                    .average,
                  selectedFilm,
                  fireType,
                )
              : totalEstimate
                  .average,
        }
      : null;

  /* =======================================================
     상담사진 저장
  ======================================================= */

  async function uploadLeadPhotos() {
    if (
      Array.isArray(
        estimatePhotoPathsRef
          .current,
      ) &&
      estimatePhotoPathsRef
        .current
        .length > 0
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
      index <
      images.length;
      index += 1
    ) {
      try {
        const formData =
          new FormData();

        formData.append(
          "image",
          images[index]
            .file,
        );

        if (
          companySlug
        ) {
          formData.append(
            "company_slug",
            companySlug,
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
            },
          );

        const result =
          await readJsonSafely(
            response,
          );

        if (
          !response.ok ||
          !result?.success ||
          !result?.path
        ) {
          throw new Error(
            result?.error ||
              "상담 사진 저장 실패",
          );
        }

        paths.push(
          result.path,
        );
      } catch (error) {
        console.error(
          `상담 사진 ${
            index + 1
          } 저장 실패:`,
          error,
        );

        uploadErrors.push(
          error?.message ||
            `상담 사진 ${
              index + 1
            } 저장 실패`,
        );
      }
    }

    if (
      images.length >
        0 &&
      paths.length ===
        0
    ) {
      throw new Error(
        uploadErrors[0] ||
          "상담 사진을 저장하지 못했습니다.",
      );
    }

    estimatePhotoPathsRef.current =
      paths;

    return paths;
  }

  /* =======================================================
     상담 신청
  ======================================================= */

  async function handleLeadSubmit(
    event,
  ) {
    event
      ?.preventDefault?.();

    if (
      !displayGroups.length
    ) {
      setLeadMessage(
        "먼저 사진 AI 분석을 진행해주세요.",
      );

      return;
    }

    if (
      !customerName.trim()
    ) {
      setLeadMessage(
        "이름을 입력해주세요.",
      );

      return;
    }

    const phoneNumbers =
      phone.replace(
        /[^0-9]/g,
        "",
      );

    if (
      phoneNumbers.length <
      9
    ) {
      setLeadMessage(
        "연락처를 정확히 입력해주세요.",
      );

      return;
    }

    if (
      !region.trim()
    ) {
      setLeadMessage(
        "시공 지역을 입력해주세요.",
      );

      return;
    }

    if (
      !privacyAgree
    ) {
      setLeadMessage(
        "개인정보 수집 및 상담 연락에 동의해주세요.",
      );

      return;
    }

    setLeadLoading(
      true,
    );

    setLeadMessage(
      "사진과 상담 신청을 접수하고 있습니다...",
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
              group
                .subCategory,

            photo_count:
              group.photos
                .length,

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
          }),
        );

      const description =
        groups
          .map(
            (
              group,
              index,
            ) => {
              const descriptions =
                group.photos
                  .map(
                    (
                      photo,
                    ) =>
                      photo
                        .analysis
                        ?.description ||
                      "",
                  )
                  .filter(
                    Boolean,
                  )
                  .join(
                    " / ",
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
            },
          )
          .join(
            "\n",
          );

      const categoryText =
        groups
          .map(
            (group) =>
              group
                .category,
          )
          .filter(
            Boolean,
          )
          .join(
            ", ",
          );

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
              group
                .estimate
                .min,
            ).toLocaleString(
              "ko-KR",
            )}~${Number(
              group
                .estimate
                .max,
            ).toLocaleString(
              "ko-KR",
            )}원`;
          },
        );

      if (
        selectedFilm
      ) {
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
          }`,
        );

        memoLines.push(
          `필름 조건: ${
            fireType ===
            "fire"
              ? "방염"
              : "비방염"
          }`,
        );
      }

      const response =
        await fetch(
          "/api/lead",
          {
            method:
              "POST",

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
                  region
                    .trim(),

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
                  ] ||
                  null,

                customer_photo_paths:
                  customerPhotoPaths,

                estimate_details:
                  estimateDetails,

                memo:
                  `다중사진 AI 견적\n${memoLines.join(
                    "\n",
                  )}`,

                usage_id:
                  usageIdRef
                    .current,

                company_slug:
                  companySlug ||
                  null,
              }),
          },
        );

      const result =
        await readJsonSafely(
          response,
        );

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.error ||
            "상담 신청 저장 오류",
        );
      }

      setLeadComplete(
        true,
      );

      setLeadMessage(
        "✅ 상담 신청이 완료되었습니다. 확인 후 연락드리겠습니다.",
      );
    } catch (error) {
      console.error(
        error,
      );

      setLeadMessage(
        `❌ 상담 신청 오류: ${
          error?.message ||
          "다시 시도해주세요."
        }`,
      );
    } finally {
      setLeadLoading(
        false,
      );
    }
  }

  /* =======================================================
     사진 추가
  ======================================================= */

  async function handleAddImages(
    files,
  ) {
    setResultMode("");
    setSelectedFilm(null);

    setFireType(
      "non_fire",
    );

    setUseSplitTone(
      false,
    );

    setAreaFilms({});

    setLeadComplete(
      false,
    );

    setLeadMessage("");

    await addImages(
      files,
    );
  }

  /* =======================================================
     사진 삭제
  ======================================================= */

  function handleRemoveImage(
    id,
  ) {
    setResultMode("");
    setSelectedFilm(null);

    setFireType(
      "non_fire",
    );

    setUseSplitTone(
      false,
    );

    setAreaFilms({});

    setLeadComplete(
      false,
    );

    setLeadMessage("");

    removeImage(
      id,
    );
  }

  /* =======================================================
     AI 분석
  ======================================================= */

  async function startAnalyze() {
    setResultMode("");
    setSelectedFilm(null);

    setFireType(
      "non_fire",
    );

    setUseSplitTone(
      false,
    );

    setAreaFilms({});

    setLeadComplete(
      false,
    );

    setLeadMessage("");

    await handleAnalyze();
  }

  /* =======================================================
     로딩
  ======================================================= */

  if (
    tenantLoading
  ) {
    return (
      <main className={styles.statePage}>
        <div className={styles.stateSpinner} />

        <div className={styles.stateTitle}>
          업체 정보를 불러오고 있습니다
        </div>
      </main>
    );
  }

  /* =======================================================
     오류
  ======================================================= */

  if (
    tenantError
  ) {
    return (
      <main className={styles.statePage}>
        <div className={styles.errorCard}>
          <div className={styles.errorTitle}>
            페이지를 열 수 없습니다
          </div>

          <div className={styles.errorText}>
            {tenantError}
          </div>
        </div>
      </main>
    );
  }

  /* =======================================================
     화면
  ======================================================= */

  return (
    <main className={styles.page}>
      {/* ===================================================
          상단 고정
      =================================================== */}

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button
            type="button"
            className={styles.brandButton}
            onClick={() =>
              moveTo(
                heroRef,
              )
            }
          >
            {companyName}
          </button>

          <div className={styles.headerActions}>
            <Link
              href={
                companySlug
                  ? `/samples?company=${encodeURIComponent(
                      companySlug,
                    )}`
                  : "/samples"
              }
              className={styles.sampleLink}
            >
              필름 샘플
            </Link>

            <Link
              href="/admin"
              className={styles.adminLink}
              aria-label="관리자"
            >
              <span className={styles.adminDot}>
                •
              </span>

              관리자
            </Link>
          </div>
        </div>
      </header>

      {/* ===================================================
          1. 메인 랜딩
      =================================================== */}

      <section
        ref={heroRef}
        className={`${styles.screenSection} ${styles.heroSection}`}
      >
        <div className={styles.content}>
          <div className={styles.heroEyebrow}>
            AI INTERIOR FILM
          </div>

          <h1 className={styles.heroTitle}>
            인테리어필름,
            <br />

            <span>
              사진 한 장으로
            </span>

            <br />

            먼저 확인하세요
          </h1>

          <p className={styles.heroDescription}>
            AI가 예상 견적을 계산하고
            <br className={styles.mobileBreak} />
            원하는 필름으로 시공 후 모습까지
            보여드립니다.
          </p>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() =>
              moveTo(
                uploadRef,
              )
            }
          >
            무료 AI 견적 시작

            <span className={styles.buttonArrow}>
              →
            </span>
          </button>

          <div className={styles.heroBenefits}>
            <div className={styles.heroBenefit}>
              <div className={styles.heroBenefitIcon}>
                ◫
              </div>

              <div>
                <strong>
                  사진만 있으면
                </strong>

                <span>
                  간편하게 시작
                </span>
              </div>
            </div>

            <div className={styles.heroBenefit}>
              <div className={styles.heroBenefitIcon}>
                ◷
              </div>

              <div>
                <strong>
                  AI 자동 분석
                </strong>

                <span>
                  빠른 예상 견적
                </span>
              </div>
            </div>

            <div className={styles.heroBenefit}>
              <div className={styles.heroBenefitIcon}>
                ◇
              </div>

              <div>
                <strong>
                  가상 시공
                </strong>

                <span>
                  미리 보는 변화
                </span>
              </div>
            </div>
          </div>

          <ScrollHint />
        </div>
      </section>

      {/* ===================================================
          2. 서비스 소개
      =================================================== */}

      <section
        ref={introRef}
        className={`${styles.screenSection} ${styles.introSection}`}
      >
        <div className={styles.content}>
          <SectionTitle
            eyebrow="SERVICE"
            title={
              <>
                복잡한 과정 없이
                <br />
                4단계로 확인하세요
              </>
            }
            description="사진을 올리는 것부터 예상 견적과 가상 시공까지 한 흐름으로 이어집니다."
          />

          <div className={styles.flowList}>
            <MiniFlowItem
              number="1"
              title="사진 업로드"
              description="시공할 공간의 사진을 올려주세요."
            />

            <MiniFlowItem
              number="2"
              title="AI 자동 분석"
              description="AI가 시공 부위와 사진 내용을 분석합니다."
            />

            <MiniFlowItem
              number="3"
              title="예상 견적 확인"
              description="과거 시공 데이터 기반 예상 범위를 확인합니다."
            />

            <MiniFlowItem
              number="4"
              title="가상 시공"
              description="원하는 필름으로 시공 후 모습을 미리 봅니다."
            />
          </div>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() =>
              moveTo(
                uploadRef,
              )
            }
          >
            사진으로 시작하기
          </button>
        </div>
      </section>

      {/* ===================================================
          3. 사진 업로드
      =================================================== */}

      <section
        ref={uploadRef}
        className={`${styles.screenSection} ${styles.workSection}`}
      >
        <div className={styles.content}>
          <SectionTitle
            eyebrow="STEP 1 / 4"
            title={
              <>
                시공할 곳의
                <br />
                사진을 올려주세요
              </>
            }
            description="사진을 여러 장 올려도 됩니다. AI가 같은 시공 부위끼리 자동으로 분석합니다."
          />

          <div className={styles.featurePanel}>
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
          </div>

          <div className={styles.tipBox}>
            <div className={styles.tipIcon}>
              i
            </div>

            <div>
              <strong>
                사진 촬영 팁
              </strong>

              <span>
                시공할 면이 화면에 넓게 보이도록 정면에서 촬영하면 분석에 도움이 됩니다.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================
          AI 결과
      =================================================== */}

      {groups.length >
        0 && (
        <>
          {/* =================================================
              4. 예상 견적
          ================================================= */}

          <section
            ref={resultRef}
            className={`${styles.screenSection} ${styles.resultSection}`}
          >
            <div className={styles.content}>
              <SectionTitle
                eyebrow="STEP 2 / 4"
                title={
                  <>
                    예상 견적이
                    <br />
                    완료됐어요
                  </>
                }
                description="AI 분석과 기존 시공 데이터를 바탕으로 계산한 예상 범위입니다."
              />

              <div className={styles.resultHeroCard}>
                <div className={styles.resultCardLabel}>
                  AI 예상 시공 금액
                </div>

                <EstimateTotal
                  totalEstimate={
                    displayTotalEstimate
                  }
                />
              </div>

              <div className={styles.detailCard}>
                <div className={styles.detailCardTitle}>
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

              <div className={styles.disclaimer}>
                예상 견적은 사진과 기존 시공 데이터를 기준으로 산출되며 실제 현장 상태에 따라 달라질 수 있습니다.
              </div>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  moveTo(
                    choiceRef,
                  )
                }
              >
                다음 단계

                <span className={styles.buttonArrow}>
                  →
                </span>
              </button>
            </div>
          </section>

          {/* =================================================
              5. 가상시공 / 상담 선택
          ================================================= */}

          <section
            ref={choiceRef}
            className={`${styles.screenSection} ${styles.choiceSection}`}
          >
            <div className={styles.content}>
              <SectionTitle
                eyebrow="STEP 3 / 4"
                title={
                  <>
                    다음으로 무엇을
                    <br />
                    확인할까요?
                  </>
                }
                description="필름을 직접 선택해 시공 후 모습을 보거나 상세 상담을 신청할 수 있습니다."
              />

              <div className={styles.featurePanel}>
                <ServiceSelector
                  groups={groups}
                  resultMode={
                    resultMode
                  }
                  onChange={
                    setResultMode
                  }
                />
              </div>

              <div className={styles.choiceGuide}>
                <div className={styles.choiceGuideItem}>
                  <span>
                    01
                  </span>

                  <div>
                    <strong>
                      가상 시공
                    </strong>

                    <p>
                      실제 필름을 골라 시공 후 색상과 분위기를 확인합니다.
                    </p>
                  </div>
                </div>

                <div className={styles.choiceGuideItem}>
                  <span>
                    02
                  </span>

                  <div>
                    <strong>
                      상세 상담
                    </strong>

                    <p>
                      현재 AI 견적 결과를 업체에 전달해 상담을 신청합니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ===================================================
          6. 가상 시공
      =================================================== */}

      {groups.length >
        0 &&
        resultMode ===
          "virtual" && (
          <section
            ref={virtualRef}
            className={`${styles.longSection} ${styles.virtualSection}`}
          >
            <div className={styles.content}>
              <SectionTitle
                eyebrow="STEP 4 / 4"
                title={
                  <>
                    원하는 필름을 골라
                    <br />
                    미리 시공해보세요
                  </>
                }
                description="선택한 필름에 따른 예상 견적 변화와 시공 후 모습을 함께 확인할 수 있습니다."
              />

              <div className={styles.virtualStep}>
                <div className={styles.virtualStepHeader}>
                  <span>
                    1
                  </span>

                  <div>
                    <strong>
                      원하는 필름 선택
                    </strong>

                    <p>
                      제조사와 색상, 패턴을 선택하세요.
                    </p>
                  </div>
                </div>

                <div className={styles.featurePanel}>
                  <FilmColorPicker
                    onSelect={
                      handleFilmSelect
                    }
                  />
                </div>
              </div>

              <div className={styles.virtualStep}>
                <div className={styles.virtualStepHeader}>
                  <span>
                    2
                  </span>

                  <div>
                    <strong>
                      적용 방식 선택
                    </strong>

                    <p>
                      한 가지 컬러 또는 부위별 컬러를 선택하세요.
                    </p>
                  </div>
                </div>

                <div className={styles.featurePanel}>
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
              </div>

              <div className={styles.virtualStep}>
                <div className={styles.virtualStepHeader}>
                  <span>
                    3
                  </span>

                  <div>
                    <strong>
                      필름 조건과 가격
                    </strong>

                    <p>
                      방염 여부에 따른 예상 금액을 확인하세요.
                    </p>
                  </div>
                </div>

                <div className={styles.featurePanel}>
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

                  <div className={styles.componentDivider} />

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
              </div>

              <div className={styles.virtualStep}>
                <div className={styles.virtualStepHeader}>
                  <span>
                    4
                  </span>

                  <div>
                    <strong>
                      AI 가상 시공 결과
                    </strong>

                    <p>
                      실제 사진에 선택한 필름을 적용합니다.
                    </p>
                  </div>
                </div>

                <div className={`${styles.featurePanel} ${styles.virtualResultPanel}`}>
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
                        "detail",
                      )
                    }
                  />
                </div>
              </div>

              <button
                type="button"
                className={styles.outlineButton}
                onClick={() =>
                  setResultMode(
                    "detail",
                  )
                }
              >
                상세 상담 신청하기
              </button>
            </div>
          </section>
        )}

      {/* ===================================================
          7. 상담
      =================================================== */}

      {groups.length >
        0 &&
        resultMode ===
          "detail" && (
          <section
            ref={leadRef}
            className={`${styles.screenSection} ${styles.leadSection}`}
          >
            <div className={styles.content}>
              <SectionTitle
                eyebrow="CONSULTATION"
                title={
                  <>
                    더 정확한 견적이
                    <br />
                    필요하신가요?
                  </>
                }
                description="AI 견적 결과와 선택한 필름 정보를 함께 전달해 상담을 도와드립니다."
              />

              <div className={styles.featurePanel}>
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
            </div>
          </section>
        )}

      {/* ===================================================
          FAQ
      =================================================== */}

      <section
        ref={faqRef}
        className={`${styles.screenSection} ${styles.faqSection}`}
      >
        <div className={styles.content}>
          <SectionTitle
            eyebrow="FAQ"
            title="자주 묻는 질문"
            description="AI 견적을 이용하기 전에 궁금한 내용을 확인해보세요."
          />

          <div className={styles.faqList}>
            <details className={styles.faqItem}>
              <summary>
                AI 견적은 실제 견적과 똑같나요?
              </summary>

              <p>
                AI 예상 견적은 등록된 시공 데이터와 사진 분석 결과를 기준으로 산출합니다. 실제 금액은 현장 상태, 시공 범위, 자재 조건 등에 따라 달라질 수 있습니다.
              </p>
            </details>

            <details className={styles.faqItem}>
              <summary>
                어떤 공간의 사진을 올릴 수 있나요?
              </summary>

              <p>
                문·문틀, 싱크대, 붙박이장, 신발장, 중문 등 인테리어필름 시공이 가능한 공간의 사진을 올릴 수 있습니다.
              </p>
            </details>

            <details className={styles.faqItem}>
              <summary>
                여러 사진을 한 번에 올려도 되나요?
              </summary>

              <p>
                네. 여러 장의 사진을 등록하면 AI가 같은 시공 부위끼리 분석해 예상 견적을 계산합니다.
              </p>
            </details>

            <details className={styles.faqItem}>
              <summary>
                가상 시공은 실제 필름을 선택할 수 있나요?
              </summary>

              <p>
                등록된 필름 제품 중 원하는 제조사와 제품을 선택하여 가상 시공을 확인할 수 있습니다.
              </p>
            </details>
          </div>

          <div className={styles.finalCta}>
            <div className={styles.finalCtaLabel}>
              {companyName}
            </div>

            <h2>
              우리 집의 새로운 모습을
              <br />
              사진 한 장으로 먼저 확인하세요
            </h2>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() =>
                moveTo(
                  uploadRef,
                )
              }
            >
              무료 AI 견적 시작

              <span className={styles.buttonArrow}>
                →
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================
          하단
      =================================================== */}

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <strong>
            {companyName}
          </strong>

          <span>
            {estimateTitle}
          </span>

          <p>
            AI 예상 견적은 실제 현장 상태와 시공 조건에 따라 달라질 수 있습니다.
          </p>
        </div>
      </footer>
    </main>
  );
}
