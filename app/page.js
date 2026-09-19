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
import LeadForm from "./components/LeadForm";

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
   * 기본은 비방염
   */
  const [fireType, setFireType] =
    useState("non_fire");

  /*
   * =========================================================
   * 상담 신청
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
   *
   * FilmColorPicker가 가격 컬럼을 아직 전달하지 않는
   * 경우에도 film_products에서 다시 조회합니다.
   *
   * 고객 화면에는 단가를 표시하지 않습니다.
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
     * 현재 FilmColorPicker에서
     * 가격 컬럼을 안 가져오는 경우
     * DB에서 선택 제품 가격만 추가 조회
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

    /*
     * 선택 제품에 비방염 가격이 없고
     * 방염 가격만 있으면 자동으로 방염 선택
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
   * 필름 가격을 반영한 부위별 견적
   * =========================================================
   *
   * 기존 AI 견적:
   * 솔리드 필름 기준
   *
   * 전체 견적 중:
   * 70% = 인건비/기타
   * 30% = 자재비
   *
   * 따라서 자재비 30%만
   * 선택 필름 가격 비율을 적용합니다.
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
   * 필름 가격을 반영한 총 견적
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
   *
   * 자동견적 실행 때 저장한 사진이 있으면
   * 다시 업로드하지 않습니다.
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
       * 자동견적 사진경로 재사용
       */

      const customerPhotoPaths =
        await uploadLeadPhotos();

      /*
       * 선택 필름이 있으면
       * 조정된 견적을 상담 데이터에 저장
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
       * 선택 자재 정보
       *
       * 실제 m당 가격은 고객에게 표시하지 않고
       * 관리자 메모에 제품/방염 여부만 저장합니다.
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
                 * 선택 필름이 있으면
                 * 자재비 조정 후 최종 견적 저장
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
   *
   * 새로운 사진을 추가하면
   * 이전 서비스/필름 선택 상태를 초기화합니다.
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

      {/* 4. 다음 서비스 */}

      <ServiceSelector
        groups={groups}
        resultMode={
          resultMode
        }
        onChange={
          setResultMode
        }
      />

      {/* 5. 가상시공 */}

      {groups.length >
        0 &&
        resultMode ===
          "virtual" && (
          <>
            <FilmColorPicker
              onSelect={
                handleFilmSelect
              }
            />

            {/* 필름 선택 후 방염/비방염 */}

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

            <VirtualInstallPanel
              images={
                images
              }
              product={
                selectedFilm
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
