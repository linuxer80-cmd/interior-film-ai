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
import FilmPriceSelector from "./FilmPriceSelector";
import FilmAdjustedEstimate from "./FilmAdjustedEstimate";
import LeadForm from "./LeadForm";

import useEstimate from "../hooks/useEstimate";

import {
  adjustEstimateByFilm,
} from "../utils/estimatePrice";

import styles from "./CustomerEstimatePage.module.css";

/* =========================================================
   화면 단계
========================================================= */

const SCREEN = {
  HOME: "home",
  UPLOAD: "upload",
  ANALYZING: "analyzing",
  RESULT: "result",
  VIRTUAL: "virtual",
  CONSULTATION: "consultation",
};

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
     현재 화면
  ======================================================= */

  const [
    screen,
    setScreen,
  ] = useState(
    SCREEN.HOME,
  );

  const [
    transitionKey,
    setTransitionKey,
  ] = useState(0);

  const analysisLoadingSeenRef =
    useRef(false);

  function changeScreen(
    nextScreen,
  ) {
    setScreen(
      nextScreen,
    );

    setTransitionKey(
      (prev) =>
        prev + 1,
    );

    if (
      typeof window !==
      "undefined"
    ) {
      window.scrollTo({
        top: 0,
        behavior: "instant",
      });
    }
  }

  /* =======================================================
     업체정보 로드
  ======================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadCompany() {
      if (
        !companySlug
      ) {
        setCompany(null);
        setCompanySettings(
          null,
        );

        setTenantLoading(
          false,
        );

        setTenantError(
          "",
        );

        return;
      }

      setTenantLoading(
        true,
      );

      setTenantError(
        "",
      );

      try {
        const response =
          await fetch(
            `/api/public-company?slug=${encodeURIComponent(
              companySlug,
            )}`,
            {
              cache:
                "no-store",
            },
          );

        const text =
          await response.text();

        let result =
          null;

        try {
          result =
            JSON.parse(
              text,
            );
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

        if (
          !cancelled
        ) {
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

        if (
          !cancelled
        ) {
          setTenantError(
            error?.message ||
              "업체 정보를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (
          !cancelled
        ) {
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
     필름 / 가상시공
  ======================================================= */

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
     AI 분석 화면 종료 감지
  ======================================================= */

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
      groups.length >
        0
    ) {
      analysisLoadingSeenRef.current =
        false;

      changeScreen(
        SCREEN.RESULT,
      );
    }
  }, [
    loading,
    groups.length,
    screen,
  ]);

  /* =======================================================
     전화번호
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
     필름 가격 반영
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
                  totalEstimate.min,
                  selectedFilm,
                  fireType,
                )
              : totalEstimate.min,

          max:
            selectedFilm
              ? adjustEstimateByFilm(
                  totalEstimate.max,
                  selectedFilm,
                  fireType,
                )
              : totalEstimate.max,

          average:
            selectedFilm
              ? adjustEstimateByFilm(
                  totalEstimate.average,
                  selectedFilm,
                  fireType,
                )
              : totalEstimate.average,
        }
      : null;

  /* =======================================================
     사진 추가
  ======================================================= */

  async function handleAddImages(
    files,
  ) {
    setSelectedFilm(
      null,
    );

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

    setLeadMessage(
      "",
    );

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
    setSelectedFilm(
      null,
    );

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

    setLeadMessage(
      "",
    );

    removeImage(
      id,
    );
  }

  /* =======================================================
     AI 분석
  ======================================================= */

  async function startAnalyze() {
    if (
      images.length ===
      0
    ) {
      return;
    }

    setSelectedFilm(
      null,
    );

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

    setLeadMessage(
      "",
    );

    analysisLoadingSeenRef.current =
      false;

    changeScreen(
      SCREEN.ANALYZING,
    );

    await handleAnalyze();
  }

  /* =======================================================
     상담 사진 저장
  ======================================================= */

  async function uploadLeadPhotos() {
    if (
      Array.isArray(
        estimatePhotoPathsRef.current,
      ) &&
      estimatePhotoPathsRef.current.length >
        0
    ) {
      return estimatePhotoPathsRef.current;
    }

    const paths =
      [];

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
          images[index].file,
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
                group.subCategory
                  ? ` · ${group.subCategory}`
                  : ""
              } (${
                group.photos.length
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
              group.category,
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
              group.estimate.min,
            ).toLocaleString(
              "ko-KR",
            )}~${Number(
              group.estimate.max,
            ).toLocaleString(
              "ko-KR",
            )}원`;
          },
        );

      if (
        selectedFilm
      ) {
        memoLines.push(
          "",
        );

        memoLines.push(
          `선택 필름: ${
            selectedFilm.product_code ||
            ""
          }${
            selectedFilm.product_name
              ? ` · ${selectedFilm.product_name}`
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
                  usageIdRef.current,

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
     뒤로가기
  ======================================================= */

  function goBack() {
    if (
      screen ===
      SCREEN.UPLOAD
    ) {
      changeScreen(
        SCREEN.HOME,
      );

      return;
    }

    if (
      screen ===
      SCREEN.ANALYZING
    ) {
      changeScreen(
        SCREEN.UPLOAD,
      );

      return;
    }

    if (
      screen ===
      SCREEN.RESULT
    ) {
      changeScreen(
        SCREEN.UPLOAD,
      );

      return;
    }

    if (
      screen ===
      SCREEN.VIRTUAL
    ) {
      changeScreen(
        SCREEN.RESULT,
      );

      return;
    }

    if (
      screen ===
      SCREEN.CONSULTATION
    ) {
      changeScreen(
        SCREEN.RESULT,
      );
    }
  }

  /* =======================================================
     로딩 / 오류
  ======================================================= */

  if (
    tenantLoading
  ) {
    return (
      <main className={styles.statePage}>
        <div className={styles.spinner} />

        <strong>
          업체 정보를 불러오고 있습니다
        </strong>
      </main>
    );
  }

  if (
    tenantError
  ) {
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

  /* =======================================================
     화면
  ======================================================= */

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {screen !==
          SCREEN.HOME ? (
            <button
              type="button"
              onClick={
                goBack
              }
              className={styles.backButton}
              aria-label="뒤로가기"
            >
              ‹
            </button>
          ) : (
            <div className={styles.headerSpacer} />
          )}

          <button
            type="button"
            className={styles.companyButton}
            onClick={() =>
              changeScreen(
                SCREEN.HOME,
              )
            }
          >
            {companyName}
          </button>

          <div className={styles.headerRight}>
            <Link
              href={
                companySlug
                  ? `/samples?company=${encodeURIComponent(
                      companySlug,
                    )}`
                  : "/samples"
              }
              className={styles.sampleButton}
            >
              샘플
            </Link>

            <Link
              href="/admin"
              className={styles.menuButton}
              aria-label="관리자"
            >
              ⋮
            </Link>
          </div>
        </div>
      </header>

      <div
        key={
          transitionKey
        }
        className={styles.screenTransition}
      >
        {/* =================================================
            HOME
        ================================================= */}

        {screen ===
          SCREEN.HOME && (
          <section className={styles.homeScreen}>
            <div className={styles.homeVisual}>
              <div className={styles.homeVisualOverlay} />

              <div className={styles.homeVisualContent}>
                <div className={styles.homeBadge}>
                  AI INTERIOR FILM
                </div>

                <h1>
                  인테리어필름,
                  <br />

                  사진 한 장으로
                  <br />

                  <span>
                    먼저 확인하세요
                  </span>
                </h1>

                <p>
                  AI가 예상 견적을 계산하고
                  <br />
                  원하는 필름으로 시공 후 모습까지
                  <br />
                  미리 보여드려요.
                </p>
              </div>
            </div>

            <div className={styles.homeBottom}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  changeScreen(
                    SCREEN.UPLOAD,
                  )
                }
              >
                무료 AI 견적 시작
                <span>›</span>
              </button>

              <div className={styles.quickInfo}>
                <div>
                  <strong>
                    ◉
                  </strong>

                  <span>
                    사진만 있으면
                    <br />
                    바로 시작
                  </span>
                </div>

                <div>
                  <strong>
                    ◷
                  </strong>

                  <span>
                    빠른
                    <br />
                    AI 분석
                  </span>
                </div>

                <div>
                  <strong>
                    ◇
                  </strong>

                  <span>
                    견적 +
                    <br />
                    가상시공
                  </span>
                </div>
              </div>

              <div className={styles.homeLinks}>
                <Link
                  href={
                    companySlug
                      ? `/samples?company=${encodeURIComponent(
                          companySlug,
                        )}`
                      : "/samples"
                  }
                >
                  필름 샘플 보기
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* =================================================
            UPLOAD
        ================================================= */}

        {screen ===
          SCREEN.UPLOAD && (
          <section className={styles.contentScreen}>
            <div className={styles.stepText}>
              STEP 1
            </div>

            <h1 className={styles.screenTitle}>
              사진을
              <br />
              올려주세요
            </h1>

            <p className={styles.screenDescription}>
              시공하려는 공간의 사진을 등록해주세요.
              AI가 시공 부위와 예상 비용을 분석합니다.
            </p>

            <div className={styles.contentCard}>
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

            {images.length >
              0 && (
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
                AI 분석 시작
                <span>
                  ›
                </span>
              </button>
            )}

            <div className={styles.tipCard}>
              <strong>
                사진 촬영 팁
              </strong>

              <p>
                시공할 면이 잘 보이도록 조금 떨어져서 정면으로 촬영하면 분석에 도움이 됩니다.
              </p>
            </div>
          </section>
        )}

        {/* =================================================
            ANALYZING
        ================================================= */}

        {screen ===
          SCREEN.ANALYZING && (
          <section className={`${styles.contentScreen} ${styles.analysisScreen}`}>
            <div className={styles.stepText}>
              STEP 2
            </div>

            <h1 className={styles.screenTitle}>
              AI가
              <br />
              분석 중입니다
            </h1>

            <p className={styles.screenDescription}>
              사진에서 시공 부위와 구조를 확인하고
              기존 시공 데이터와 비교하고 있어요.
            </p>

            <div className={styles.analysisVisual}>
              <div className={styles.analysisRing}>
                <div className={styles.analysisRingInner}>
                  ◇
                </div>
              </div>
            </div>

            <div className={styles.analysisList}>
              <div className={styles.analysisDone}>
                <span>✓</span>
                이미지 확인
              </div>

              <div className={loading ? styles.analysisActive : ""}>
                <span>
                  {loading
                    ? "●"
                    : "✓"}
                </span>

                시공 부위 분석
              </div>

              <div>
                <span>
                  ○
                </span>

                유사 시공 데이터 비교
              </div>

              <div>
                <span>
                  ○
                </span>

                예상 견적 계산
              </div>
            </div>

            <div className={styles.analysisNotice}>
              보통 잠시 후 결과를 확인할 수 있습니다.
            </div>
          </section>
        )}

        {/* =================================================
            RESULT
        ================================================= */}

        {screen ===
          SCREEN.RESULT && (
          <section className={styles.contentScreen}>
            <div className={styles.stepText}>
              STEP 3
            </div>

            <h1 className={styles.screenTitle}>
              예상 견적이
              <br />
              완료됐어요
            </h1>

            <p className={styles.screenDescription}>
              AI 분석 결과와 기존 시공 데이터를 기준으로 계산한 예상 견적입니다.
            </p>

            <div className={styles.estimateMainCard}>
              <div className={styles.estimateLabel}>
                예상 시공 금액
              </div>

              <EstimateTotal
                totalEstimate={
                  displayTotalEstimate
                }
              />
            </div>

            <div className={styles.contentCard}>
              <div className={styles.cardHeading}>
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

            <div className={styles.resultActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  changeScreen(
                    SCREEN.VIRTUAL,
                  )
                }
              >
                가상시공 해보기
                <span>
                  ›
                </span>
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  changeScreen(
                    SCREEN.CONSULTATION,
                  )
                }
              >
                상담 신청하기
              </button>
            </div>

            <p className={styles.disclaimer}>
              실제 견적은 현장 상태, 작업 범위 및 선택한 필름에 따라 달라질 수 있습니다.
            </p>
          </section>
        )}

        {/* =================================================
            VIRTUAL
        ================================================= */}

        {screen ===
          SCREEN.VIRTUAL && (
          <section className={styles.contentScreen}>
            <div className={styles.stepText}>
              STEP 4
            </div>

            <h1 className={styles.screenTitle}>
              원하는 필름을
              <br />
              선택해주세요
            </h1>

            <p className={styles.screenDescription}>
              실제 등록된 필름 중 원하는 제품을 골라 시공 후 모습을 미리 확인할 수 있어요.
            </p>

            <div className={styles.virtualBlock}>
              <div className={styles.blockTitle}>
                1. 필름 선택
              </div>

              <div className={styles.contentCard}>
                <FilmColorPicker
                  onSelect={
                    handleFilmSelect
                  }
                />
              </div>
            </div>

            {selectedFilm && (
              <>
                <div className={styles.virtualBlock}>
                  <div className={styles.blockTitle}>
                    2. 컬러 적용 방식
                  </div>

                  <div className={styles.contentCard}>
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
                </div>

                <div className={styles.virtualBlock}>
                  <div className={styles.blockTitle}>
                    3. 필름 조건 · 예상 견적
                  </div>

                  <div className={styles.contentCard}>
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

                    <div className={styles.divider} />

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

                <div className={styles.virtualBlock}>
                  <div className={styles.blockTitle}>
                    4. 가상 시공
                  </div>

                  <div className={styles.virtualResultCard}>
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
                          SCREEN.CONSULTATION,
                        )
                      }
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() =>
                    changeScreen(
                      SCREEN.CONSULTATION,
                    )
                  }
                >
                  이 필름으로 상담 신청
                  <span>
                    ›
                  </span>
                </button>
              </>
            )}
          </section>
        )}

        {/* =================================================
            CONSULTATION
        ================================================= */}

        {screen ===
          SCREEN.CONSULTATION && (
          <section className={styles.contentScreen}>
            <div className={styles.stepText}>
              CONSULTATION
            </div>

            <h1 className={styles.screenTitle}>
              상담
              <br />
              신청하기
            </h1>

            <p className={styles.screenDescription}>
              AI 견적 결과와 선택한 필름 정보를 함께 업체에 전달합니다.
            </p>

            <div className={styles.contentCard}>
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

            {leadComplete && (
              <div className={styles.completeCard}>
                <div className={styles.completeIcon}>
                  ✓
                </div>

                <strong>
                  상담 신청이 완료됐습니다
                </strong>

                <p>
                  확인 후 연락드리겠습니다.
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      <footer className={styles.footer}>
        <strong>
          {companyName}
        </strong>

        <span>
          {estimateTitle}
        </span>

        <p>
          AI 예상 견적은 실제 현장 상태와 시공 조건에 따라 달라질 수 있습니다.
        </p>
      </footer>
    </main>
  );
}
