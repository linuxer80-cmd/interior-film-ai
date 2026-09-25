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
  COMPLETE: "complete",
};

/* =========================================================
   단계 진행률
========================================================= */

function getProgress(screen) {
  if (screen === SCREEN.UPLOAD) {
    return {
      step: 1,
      total: 4,
      percent: 25,
    };
  }

  if (screen === SCREEN.ANALYZING) {
    return {
      step: 2,
      total: 4,
      percent: 50,
    };
  }

  if (
    screen === SCREEN.RESULT ||
    screen === SCREEN.VIRTUAL
  ) {
    return {
      step: 3,
      total: 4,
      percent: 75,
    };
  }

  if (
    screen === SCREEN.CONSULTATION ||
    screen === SCREEN.COMPLETE
  ) {
    return {
      step: 4,
      total: 4,
      percent: 100,
    };
  }

  return null;
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
     화면 상태
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

  const [
    startPickerOpen,
    setStartPickerOpen,
  ] = useState(false);

  const cameraInputRef =
    useRef(null);

  const albumInputRef =
    useRef(null);

  const analysisLoadingSeenRef =
    useRef(false);

  /* =======================================================
     화면 변경
  ======================================================= */

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
      window.scrollTo(
        0,
        0,
      );
    }
  }

  /* =======================================================
     업체 정보 로드
  ======================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadCompany() {
      if (
        !companySlug
      ) {
        setCompany(
          null,
        );

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
    "AI가 사진을 분석해 예상 견적을 계산하고 원하는 필름으로 시공 후 모습까지 미리 보여드립니다.";

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
     필름
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
     진행률
  ======================================================= */

  const progress =
    getProgress(
      screen,
    );

  /* =======================================================
     AI 분석 완료 감지
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
     필름가격 반영 견적
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
     사진 초기화
  ======================================================= */

  function resetEstimateOptions() {
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
  }

  /* =======================================================
     사진 추가
  ======================================================= */

  async function handleAddImages(
    files,
  ) {
    resetEstimateOptions();

    await addImages(
      files,
    );
  }

  /* =======================================================
     시작화면에서 사진 직접 선택
  ======================================================= */

  async function handleDirectFileSelect(
    event,
  ) {
    const files =
      event.target.files;

    if (
      !files ||
      files.length ===
        0
    ) {
      return;
    }

    setStartPickerOpen(
      false,
    );

    changeScreen(
      SCREEN.UPLOAD,
    );

    await handleAddImages(
      files,
    );

    event.target.value =
      "";
  }

  /* =======================================================
     사진 삭제
  ======================================================= */

  function handleRemoveImage(
    id,
  ) {
    resetEstimateOptions();

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

    resetEstimateOptions();

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
        "✅ 상담 신청이 완료되었습니다.",
      );

      changeScreen(
        SCREEN.COMPLETE,
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
        selectedFilm
          ? SCREEN.VIRTUAL
          : SCREEN.RESULT,
      );

      return;
    }

    if (
      screen ===
      SCREEN.COMPLETE
    ) {
      changeScreen(
        SCREEN.HOME,
      );
    }
  }

  /* =======================================================
     처음으로
  ======================================================= */

  function restart() {
    setCustomerName(
      "",
    );

    setPhone(
      "",
    );

    setRegion(
      "",
    );

    setPrivacyAgree(
      false,
    );

    setLeadComplete(
      false,
    );

    setLeadMessage(
      "",
    );

    changeScreen(
      SCREEN.HOME,
    );
  }

  /* =======================================================
     로딩
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

  /* =======================================================
     오류
  ======================================================= */

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
      {/* ===================================================
          시작용 숨김 사진 input
      =================================================== */}

      <input
        ref={
          cameraInputRef
        }
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.hiddenInput}
        onChange={
          handleDirectFileSelect
        }
      />

      <input
        ref={
          albumInputRef
        }
        type="file"
        accept="image/*"
        multiple
        className={styles.hiddenInput}
        onChange={
          handleDirectFileSelect
        }
      />

      {/* ===================================================
          헤더
      =================================================== */}

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerSide}>
            {screen !==
            SCREEN.HOME ? (
              <button
                type="button"
                className={styles.backButton}
                onClick={
                  goBack
                }
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
                SCREEN.HOME,
              )
            }
          >
            {companyName}
          </button>

          <div className={`${styles.headerSide} ${styles.headerSideRight}`}>
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

        {progress && (
          <div className={styles.progressWrap}>
            <div className={styles.progressInfo}>
              <span>
                {progress.step} / {progress.total}
              </span>
            </div>

            <div className={styles.progressTrack}>
              <div
                className={styles.progressBar}
                style={{
                  width:
                    `${progress.percent}%`,
                }}
              />
            </div>
          </div>
        )}
      </header>

      {/* ===================================================
          화면 전환
      =================================================== */}

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
            <div className={styles.homeHero}>
              <div className={styles.heroGlowOne} />
              <div className={styles.heroGlowTwo} />

              <div className={styles.heroKitchen}>
                <div className={styles.fakeCeiling} />
                <div className={styles.fakeCabinetOne} />
                <div className={styles.fakeCabinetTwo} />
                <div className={styles.fakeCounter} />
                <div className={styles.fakePlant} />
              </div>

              <div className={styles.homeHeroContent}>
                <div className={styles.homeEyebrow}>
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
                  AI가 예상 견적을 계산하고
                  <br />
                  원하는 필름으로 시공 후 모습까지
                  <br />
                  미리 확인해보세요.
                </p>
              </div>
            </div>

            <div className={styles.homeBottom}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  setStartPickerOpen(
                    true,
                  )
                }
              >
                무료 AI 견적 시작

                <span>
                  →
                </span>
              </button>

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
                    ◇
                  </div>

                  <strong>
                    견적 +
                  </strong>

                  <span>
                    가상시공
                  </span>
                </div>
              </div>

              <Link
                href={
                  companySlug
                    ? `/samples?company=${encodeURIComponent(
                        companySlug,
                      )}`
                    : "/samples"
                }
                className={styles.textLink}
              >
                실제 필름 샘플 보기
                <span>›</span>
              </Link>
            </div>
          </section>
        )}

        {/* =================================================
            UPLOAD
        ================================================= */}

        {screen ===
          SCREEN.UPLOAD && (
          <section className={styles.contentScreen}>
            <div className={styles.screenHeader}>
              <div className={styles.stepBadge}>
                STEP 1
              </div>

              <h1>
                시공할 공간의
                <br />
                사진을 올려주세요
              </h1>

              <p>
                AI가 사진 속 시공 부위와 구조를 분석하고
                예상 견적을 계산합니다.
              </p>
            </div>

            <div className={styles.uploadShell}>
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
                AI 분석하기

                <span>
                  →
                </span>
              </button>
            )}

            <div className={styles.infoNotice}>
              <div className={styles.infoIcon}>
                i
              </div>

              <div>
                <strong>
                  사진 촬영 팁
                </strong>

                <p>
                  시공할 면 전체가 보이도록 조금 떨어져서 정면으로 촬영하면 더 정확한 분석에 도움이 됩니다.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* =================================================
            ANALYZING
        ================================================= */}

        {screen ===
          SCREEN.ANALYZING && (
          <section className={`${styles.contentScreen} ${styles.analysisScreen}`}>
            <div className={styles.screenHeader}>
              <div className={styles.stepBadge}>
                STEP 2
              </div>

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

            <div className={styles.analysisGraphic}>
              <div className={styles.analysisOuter}>
                <div className={styles.analysisMiddle}>
                  <div className={styles.analysisCenter}>
                    ⌂
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.analysisSteps}>
              <div className={styles.analysisComplete}>
                <span>
                  ✓
                </span>

                이미지 확인 완료
              </div>

              <div className={styles.analysisCurrent}>
                <span>
                  ✓
                </span>

                시공 부위 분석 중
              </div>

              <div>
                <span>
                  ○
                </span>

                유사 시공 데이터 검색
              </div>

              <div>
                <span>
                  ○
                </span>

                예상 견적 계산
              </div>
            </div>

            <div className={styles.softNotice}>
              AI 분석을 진행하고 있습니다.
              잠시만 기다려주세요.
            </div>
          </section>
        )}

        {/* =================================================
            RESULT
        ================================================= */}

        {screen ===
          SCREEN.RESULT && (
          <section className={styles.contentScreen}>
            <div className={styles.screenHeader}>
              <div className={styles.stepBadge}>
                STEP 3
              </div>

              <h1>
                AI 분석이
                <br />
                완료되었어요
              </h1>

              <p>
                사진과 기존 시공 데이터를 기반으로 계산된
                예상 시공 견적입니다.
              </p>
            </div>

            <div className={styles.priceCard}>
              <div className={styles.priceCardTitle}>
                <span className={styles.priceIcon}>
                  ▣
                </span>

                예상 시공 금액
              </div>

              <EstimateTotal
                totalEstimate={
                  displayTotalEstimate
                }
              />
            </div>

            <div className={styles.statGrid}>
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
                  유사사례 분석
                </span>
              </div>
            </div>

            <div className={styles.resultDetail}>
              <div className={styles.sectionMiniHeader}>
                <strong>
                  분석된 시공 부위
                </strong>
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

            <div className={styles.doubleButtons}>
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
                  →
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

            <div className={styles.smallDisclaimer}>
              정확한 견적은 실제 현장 상태와 선택 자재에 따라 달라질 수 있습니다.
            </div>
          </section>
        )}

        {/* =================================================
            VIRTUAL
        ================================================= */}

        {screen ===
          SCREEN.VIRTUAL && (
          <section className={styles.contentScreen}>
            <div className={styles.screenHeader}>
              <div className={styles.stepBadge}>
                STEP 3
              </div>

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

            <div className={styles.filmSection}>
              <FilmColorPicker
                onSelect={
                  handleFilmSelect
                }
              />
            </div>

            {selectedFilm && (
              <>
                <div className={styles.optionSection}>
                  <div className={styles.sectionMiniHeader}>
                    <strong>
                      시공 방식 선택
                    </strong>
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

                <div className={styles.optionSection}>
                  <div className={styles.sectionMiniHeader}>
                    <strong>
                      필름 조건
                    </strong>
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
                  <div className={styles.priceCardTitle}>
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
                      totalEstimate
                    }
                    adjustedEstimate={
                      displayTotalEstimate
                    }
                  />
                </div>

                <div className={styles.virtualSection}>
                  <div className={styles.sectionMiniHeader}>
                    <strong>
                      가상시공 결과
                    </strong>

                    <span>
                      선택한 필름으로 시공 후 모습을 확인해보세요
                    </span>
                  </div>

                  <div className={styles.virtualResultShell}>
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
                  이 필름으로 상담 신청하기

                  <span>
                    →
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
            <div className={styles.screenHeader}>
              <div className={styles.stepBadge}>
                STEP 4
              </div>

              <h1>
                상담
                <br />
                신청하기
              </h1>

              <p>
                AI 견적 결과와 선택한 필름 정보를
                함께 업체에 전달합니다.
              </p>
            </div>

            <div className={styles.consultSummary}>
              <div>
                <span>
                  예상견적
                </span>

                <strong>
                  {displayTotalEstimate
                    ? `${Number(
                        displayTotalEstimate.min,
                      ).toLocaleString(
                        "ko-KR",
                      )} ~ ${Number(
                        displayTotalEstimate.max,
                      ).toLocaleString(
                        "ko-KR",
                      )}원`
                    : "AI 견적"}
                </strong>
              </div>

              {selectedFilm && (
                <div>
                  <span>
                    선택필름
                  </span>

                  <strong>
                    {selectedFilm.product_code ||
                      selectedFilm.product_name ||
                      "선택 완료"}
                  </strong>
                </div>
              )}
            </div>

            <div className={styles.formShell}>
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

        {/* =================================================
            COMPLETE
        ================================================= */}

        {screen ===
          SCREEN.COMPLETE && (
          <section className={styles.completeScreen}>
            <div className={styles.completeCheck}>
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
                        displayTotalEstimate.min,
                      ).toLocaleString(
                        "ko-KR",
                      )} ~ ${Number(
                        displayTotalEstimate.max,
                      ).toLocaleString(
                        "ko-KR",
                      )}원`
                    : "확인 중"}
                </strong>
              </div>

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

              <div>
                <span>
                  사진 수
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

      {/* ===================================================
          시작 사진 선택 모달
      =================================================== */}

      {startPickerOpen && (
        <div
          className={styles.pickerOverlay}
          onClick={() =>
            setStartPickerOpen(
              false,
            )
          }
        >
          <div
            className={styles.pickerSheet}
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <div className={styles.pickerHandle} />

            <div className={styles.pickerHeader}>
              <div>
                <h2>
                  사진을 선택해주세요
                </h2>

                <p>
                  시공할 공간의 사진을 등록하면 바로 AI 견적을 시작할 수 있어요.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setStartPickerOpen(
                    false,
                  )
                }
              >
                ×
              </button>
            </div>

            <div className={styles.pickerButtons}>
              <button
                type="button"
                onClick={() =>
                  cameraInputRef.current?.click()
                }
              >
                <span className={styles.pickerIcon}>
                  ◉
                </span>

                <div>
                  <strong>
                    사진 촬영하기
                  </strong>

                  <p>
                    지금 시공할 공간을 촬영합니다
                  </p>
                </div>

                <span>
                  ›
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  albumInputRef.current?.click()
                }
              >
                <span className={styles.pickerIcon}>
                  ▣
                </span>

                <div>
                  <strong>
                    앨범에서 선택
                  </strong>

                  <p>
                    저장된 사진을 여러 장 선택합니다
                  </p>
                </div>

                <span>
                  ›
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

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
