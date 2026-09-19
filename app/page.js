"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

import FilmColorPicker from "./FilmColorPicker";
import VirtualInstallPanel from "./VirtualInstallPanel";
import EstimatePhotoUploader from "./components/EstimatePhotoUploader";
import EstimateResult from "./components/EstimateResult";
import ServiceSelector from "./components/ServiceSelector";
import FilmPriceSelector from "./components/FilmPriceSelector";
import FilmAdjustedEstimate from "./components/FilmAdjustedEstimate";
import LeadForm from "./components/LeadForm";
import VirtualToneSelector from "./components/VirtualToneSelector";

import useEstimate from "./hooks/useEstimate";
import { adjustEstimateByFilm } from "./utils/estimatePrice";

export default function Home() {
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

  const [resultMode, setResultMode] = useState("");
  const [showEstimateDetails, setShowEstimateDetails] =
    useState(false);
  const [showFilmPicker, setShowFilmPicker] =
    useState(true);
  const [selectedFilm, setSelectedFilm] =
    useState(null);
  const [fireType, setFireType] =
    useState("non_fire");
  const [useSplitTone, setUseSplitTone] =
    useState(false);
  const [areaFilms, setAreaFilms] =
    useState({});

  const [customerName, setCustomerName] =
    useState("");
  const [phone, setPhone] =
    useState("");
  const [region, setRegion] =
    useState("");
  const [privacyAgree, setPrivacyAgree] =
    useState(false);
  const [leadLoading, setLeadLoading] =
    useState(false);
  const [leadComplete, setLeadComplete] =
    useState(false);
  const [leadMessage, setLeadMessage] =
    useState("");

  function handlePhoneChange(value) {
    const numbers = String(value || "")
      .replace(/[^0-9]/g, "")
      .slice(0, 11);

    if (numbers.length <= 3) {
      setPhone(numbers);
      return;
    }

    if (numbers.length <= 7) {
      setPhone(
        `${numbers.slice(0, 3)}-${numbers.slice(3)}`
      );
      return;
    }

    setPhone(
      `${numbers.slice(0, 3)}-${numbers.slice(
        3,
        7
      )}-${numbers.slice(7)}`
    );
  }

  async function handleFilmSelect(film) {
    if (!film) {
      setSelectedFilm(null);
      return;
    }

    let completedFilm = {
      ...film,
    };

    const alreadyHasPrice =
      Number(film.fire_price_per_meter || 0) > 0 ||
      Number(film.non_fire_price_per_meter || 0) > 0;

    if (!alreadyHasPrice) {
      try {
        let query = supabase
          .from("film_products")
          .select(`
            id,
            fire_price_per_meter,
            non_fire_price_per_meter
          `);

        if (film.id) {
          query = query.eq("id", film.id);
        } else {
          query = query
            .eq("brand", film.brand)
            .eq("product_code", film.product_code);
        }

        const { data, error } = await query
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

    setSelectedFilm(completedFilm);
    setShowFilmPicker(false);

    const hasNonFire =
      Number(
        completedFilm.non_fire_price_per_meter || 0
      ) > 0;

    const hasFire =
      Number(
        completedFilm.fire_price_per_meter || 0
      ) > 0;

    if (!hasNonFire && hasFire) {
      setFireType("fire");
    } else if (hasNonFire && !hasFire) {
      setFireType("non_fire");
    }
  }

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
    const text = normalizeGroupText(group);

    if (
      text.includes("냉장고장") ||
      text.includes("냉장고")
    ) {
      return "fridge_cabinet";
    }

    if (
      text.includes("키큰장") ||
      text.includes("키높이장") ||
      text.includes("톨장")
    ) {
      return "tall_cabinet";
    }

    if (
      text.includes("팬트리") ||
      text.includes("펜트리")
    ) {
      return "pantry_cabinet";
    }

    if (text.includes("아일랜드")) {
      return "island_cabinet";
    }

    if (
      text.includes("상부장") ||
      text.includes("상부")
    ) {
      return "kitchen_upper";
    }

    if (
      text.includes("하부장") ||
      text.includes("하부")
    ) {
      return "kitchen_lower";
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

  function getFilmPriceValue(film, type) {
    if (!film) {
      return 0;
    }

    if (type === "fire") {
      return Number(
        film.fire_price_per_meter || 0
      );
    }

    return Number(
      film.non_fire_price_per_meter || 0
    );
  }

  function makeAverageFilm(films) {
    const validFilms = films.filter(Boolean);

    if (!validFilms.length) {
      return selectedFilm;
    }

    function averagePrice(type) {
      const prices = validFilms
        .map((film) =>
          getFilmPriceValue(film, type)
        )
        .filter((price) => price > 0);

      if (!prices.length) {
        return 0;
      }

      return (
        prices.reduce(
          (sum, price) => sum + price,
          0
        ) / prices.length
      );
    }

    return {
      ...selectedFilm,
      fire_price_per_meter:
        averagePrice("fire"),
      non_fire_price_per_meter:
        averagePrice("non_fire"),
    };
  }

  function getKitchenAverageFilm() {
    const keys = [
      "kitchen_upper",
      "kitchen_lower",
      "fridge_cabinet",
      "tall_cabinet",
      "pantry_cabinet",
      "island_cabinet",
    ];

    const films = keys
      .filter(
        (key) =>
          key === "kitchen_upper" ||
          key === "kitchen_lower" ||
          areaFilms?.[key]
      )
      .map(
        (key) =>
          areaFilms?.[key] || selectedFilm
      );

    return makeAverageFilm(films);
  }

  function getDoorAverageFilm() {
    return makeAverageFilm([
      areaFilms?.door_leaf || selectedFilm,
      areaFilms?.door_frame || selectedFilm,
    ]);
  }

  function getFilmForGroup(group) {
    if (!selectedFilm) {
      return null;
    }

    if (!useSplitTone) {
      return selectedFilm;
    }

    const areaKey =
      getAreaKeyForGroup(group);

    if (areaKey && areaFilms?.[areaKey]) {
      return areaFilms[areaKey];
    }

    const text =
      normalizeGroupText(group);

    if (
      text.includes("싱크대") ||
      text.includes("주방가구") ||
      text.includes("주방장")
    ) {
      return getKitchenAverageFilm();
    }

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

  const displayGroups = groups.map((group) => {
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
        min: adjustEstimateByFilm(
          group.estimate.min,
          filmForGroup,
          fireType
        ),
        max: adjustEstimateByFilm(
          group.estimate.max,
          filmForGroup,
          fireType
        ),
        average: adjustEstimateByFilm(
          group.estimate.average,
          filmForGroup,
          fireType
        ),
      },
      appliedFilm: filmForGroup,
    };
  });

  const estimatedGroups =
    displayGroups.filter(
      (group) =>
        group?.estimate &&
        Number.isFinite(
          Number(group.estimate.average)
        )
    );

  const hasAdjustedGroups =
    estimatedGroups.length > 0;

  function sumEstimateField(field) {
    return estimatedGroups.reduce(
      (sum, group) =>
        sum +
        Number(
          group.estimate?.[field] || 0
        ),
      0
    );
  }

  const displayTotalEstimate =
    totalEstimate
      ? selectedFilm && hasAdjustedGroups
        ? {
            ...totalEstimate,
            min: sumEstimateField("min"),
            max: sumEstimateField("max"),
            average:
              sumEstimateField("average"),
          }
        : {
            ...totalEstimate,
          }
      : null;

  async function uploadLeadPhotos() {
    if (
      Array.isArray(
        estimatePhotoPathsRef.current
      ) &&
      estimatePhotoPathsRef.current.length > 0
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
        const formData = new FormData();

        formData.append(
          "image",
          images[index].file
        );

        const response = await fetch(
          "/api/estimate-photo",
          {
            method: "POST",
            body: formData,
          }
        );

        const result =
          await readJsonSafely(response);

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

        paths.push(result.path);
      } catch (error) {
        console.error(
          `상담 사진 ${index + 1} 저장 실패:`,
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

    estimatePhotoPathsRef.current = paths;
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

    if (!customerName.trim()) {
      setLeadMessage(
        "이름을 입력해주세요."
      );
      return;
    }

    const phoneNumbers =
      phone.replace(/[^0-9]/g, "");

    if (phoneNumbers.length < 9) {
      setLeadMessage(
        "연락처를 정확히 입력해주세요."
      );
      return;
    }

    if (!region.trim()) {
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
        displayGroups.map((group) => ({
          group_key: group.key,
          category: group.category,
          sub_category:
            group.subCategory,
          photo_count:
            group.photos?.length || 0,
          estimate_min:
            group.estimate?.min ?? null,
          estimate_max:
            group.estimate?.max ?? null,
          estimate_average:
            group.estimate?.average ?? null,
          confidence:
            group.estimate?.confidence ||
            "데이터 부족",
          similar_count:
            group.estimate?.count || 0,
        }));

      const description = groups
        .map((group, index) => {
          const descriptions = (
            group.photos || []
          )
            .map(
              (photo) =>
                photo.analysis?.description ||
                ""
            )
            .filter(Boolean)
            .join(" / ");

          return `${index + 1}. ${
            group.category
          }${
            group.subCategory
              ? ` · ${group.subCategory}`
              : ""
          } (${group.photos?.length || 0}장): ${
            descriptions
          }`;
        })
        .join("\n");

      const categoryText = groups
        .map((group) => group.category)
        .filter(Boolean)
        .join(", ");

      const memoLines =
        displayGroups.map((group) => {
          if (!group.estimate) {
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
        });

      if (selectedFilm) {
        memoLines.push("");

        memoLines.push(
          `선택 필름: ${
            selectedFilm.product_code || ""
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

        memoLines.push(
          `컬러 방식: ${
            useSplitTone
              ? "부위별 여러 톤"
              : "모두 같은 컬러"
          }`
        );
      }

      const response = await fetch(
        "/api/lead",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            customer_name:
              customerName.trim(),
            phone: phone.trim(),
            region: region.trim(),
            category:
              categoryText || null,
            sub_category:
              groups.length === 1
                ? groups[0].subCategory
                : "다중부위",
            ai_description:
              description,
            estimate_min:
              displayTotalEstimate?.min ??
              null,
            estimate_max:
              displayTotalEstimate?.max ??
              null,
            estimate_average:
              displayTotalEstimate?.average ??
              null,
            customer_photo_path:
              customerPhotoPaths[0] ||
              null,
            customer_photo_paths:
              customerPhotoPaths,
            estimate_details:
              estimateDetails,
            memo: `다중사진 AI 견적\n${memoLines.join(
              "\n"
            )}`,
            usage_id:
              usageIdRef.current,
          }),
        }
      );

      const result =
        await readJsonSafely(response);

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.error ||
            "상담 신청 저장 오류"
        );
      }

      setLeadComplete(true);
      setLeadMessage(
        "✅ 상담 신청이 완료되었습니다. 확인 후 연락드리겠습니다."
      );
    } catch (error) {
      console.error(error);

      setLeadMessage(
        `❌ 상담 신청 오류: ${
          error?.message ||
          "다시 시도해주세요."
        }`
      );
    } finally {
      setLeadLoading(false);
    }
  }

  async function handleAddImages(files) {
    setResultMode("");
    setShowEstimateDetails(false);
    setShowFilmPicker(true);
    setSelectedFilm(null);
    setFireType("non_fire");
    setUseSplitTone(false);
    setAreaFilms({});
    setLeadComplete(false);
    setLeadMessage("");

    await addImages(files);
  }

  function handleRemoveImage(id) {
    setResultMode("");
    setShowEstimateDetails(false);
    setShowFilmPicker(true);
    setSelectedFilm(null);
    setFireType("non_fire");
    setUseSplitTone(false);
    setAreaFilms({});
    setLeadComplete(false);
    setLeadMessage("");

    removeImage(id);
  }

  async function startAnalyze() {
    setResultMode("");
    setShowEstimateDetails(false);
    setShowFilmPicker(true);
    setSelectedFilm(null);
    setFireType("non_fire");
    setUseSplitTone(false);
    setAreaFilms({});
    setLeadComplete(false);
    setLeadMessage("");

    await handleAnalyze();
  }

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "18px 14px 60px",
        fontFamily: "Arial, sans-serif",
        background: "#f8fafc",
        minHeight: "100vh",
        boxSizing: "border-box",
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "inline-block",
          background: "#111827",
          color: "#ffffff",
          padding: "8px 14px",
          borderRadius: "20px",
          fontWeight: "bold",
        }}
      >
        기분좋은공간
      </div>

      <h1
        style={{
          marginTop: "12px",
          marginBottom: "8px",
          fontSize: "27px",
          lineHeight: 1.3,
        }}
      >
        AI 인테리어필름 견적
      </h1>

      <p
        style={{
          marginTop: 0,
          color: "#6b7280",
          fontSize: "15px",
          lineHeight: 1.7,
        }}
      >
        여러 시공 부위의 사진을 한 번에
        올려주세요. AI가 같은 부위끼리
        묶어서 예상견적을 계산합니다.
      </p>

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

      {displayTotalEstimate && (
        <section
          style={{
            marginTop: "14px",
            padding: "17px",
            border:
              "1px solid #e5e7eb",
            borderRadius: "18px",
            background: "#ffffff",
            boxShadow:
              "0 8px 24px rgba(15,23,42,0.06)",
          }}
        >
          <div
            style={{
              color: "#6b7280",
              fontSize: "13px",
              fontWeight: "bold",
            }}
          >
            AI 예상견적
          </div>

          <div
            style={{
              marginTop: "4px",
              fontSize:
                "clamp(23px, 6vw, 31px)",
              lineHeight: 1.25,
              fontWeight: "900",
              letterSpacing: "-1px",
            }}
          >
            {Number(
              displayTotalEstimate.min || 0
            ).toLocaleString("ko-KR")}{" "}
            ~{" "}
            {Number(
              displayTotalEstimate.max || 0
            ).toLocaleString("ko-KR")}
            원
          </div>

          <div
            style={{
              marginTop: "5px",
              color: "#6b7280",
              fontSize: "13px",
            }}
          >
            평균{" "}
            {Number(
              displayTotalEstimate.average ||
                0
            ).toLocaleString("ko-KR")}
            원
            {` · ${displayGroups.length}개 부위 계산 완료`}
          </div>

          <button
            type="button"
            onClick={() =>
              setShowEstimateDetails(
                (value) => !value
              )
            }
            aria-expanded={
              showEstimateDetails
            }
            style={{
              width: "100%",
              marginTop: "12px",
              padding: "11px",
              border: "none",
              borderRadius: "11px",
              background: "#f3f4f6",
              color: "#374151",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {showEstimateDetails
              ? "부위별 견적 닫기 ▲"
              : `부위별 견적 ${displayGroups.length}개 보기 ▼`}
          </button>

          {showEstimateDetails && (
            <div
              style={{
                marginTop: "8px",
              }}
            >
              <EstimateResult
                groups={displayGroups}
                imageCount={
                  images.length
                }
              />
            </div>
          )}
        </section>
      )}

      <ServiceSelector
        groups={groups}
        resultMode={resultMode}
        onChange={setResultMode}
      />

      {groups.length > 0 &&
        resultMode === "virtual" && (
          <>
            {selectedFilm &&
            !showFilmPicker ? (
              <section
                style={{
                  marginTop: "14px",
                  padding: "14px",
                  border:
                    "1px solid #e5e7eb",
                  borderRadius: "16px",
                  background: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                }}
              >
                {selectedFilm.sample_image_path ? (
                  <img
                    src={
                      selectedFilm.sample_image_path
                    }
                    alt="선택 필름"
                    style={{
                      width: "48px",
                      height: "48px",
                      objectFit: "cover",
                      borderRadius: "10px",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "10px",
                      background:
                        selectedFilm.color_hex ||
                        "#f3f4f6",
                      border:
                        "1px solid #e5e7eb",
                    }}
                  />
                )}

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "12px",
                    }}
                  >
                    적용할 필름
                  </div>

                  <div
                    style={{
                      fontWeight: "bold",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow:
                        "ellipsis",
                    }}
                  >
                    {[
                      selectedFilm.brand,
                      selectedFilm.product_code,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </div>

                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "12px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow:
                        "ellipsis",
                    }}
                  >
                    {selectedFilm.color_description ||
                      selectedFilm.product_name ||
                      selectedFilm.color_family ||
                      ""}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowFilmPicker(true)
                  }
                  style={{
                    border: "none",
                    background:
                      "transparent",
                    color: "#5b21b6",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  변경 ›
                </button>
              </section>
            ) : (
              <div
                style={{
                  marginTop: "14px",
                }}
              >
                {selectedFilm && (
                  <button
                    type="button"
                    onClick={() =>
                      setShowFilmPicker(
                        false
                      )
                    }
                    style={{
                      width: "100%",
                      marginBottom: "8px",
                      padding: "10px",
                      border:
                        "1px solid #e5e7eb",
                      borderRadius: "10px",
                      background: "#ffffff",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    필름 선택 닫기 ▲
                  </button>
                )}

                <FilmColorPicker
                  value={selectedFilm}
                  onSelect={
                    handleFilmSelect
                  }
                />
              </div>
            )}

            <FilmPriceSelector
              selectedFilm={
                selectedFilm
              }
              fireType={fireType}
              onFireTypeChange={
                setFireType
              }
            />

            <FilmAdjustedEstimate
              selectedFilm={
                selectedFilm
              }
              fireType={fireType}
              baseEstimate={
                totalEstimate
              }
              adjustedEstimate={
                displayTotalEstimate
              }
            />

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
              onUseSplitToneChange={
                setUseSplitTone
              }
              onAreaFilmsChange={
                setAreaFilms
              }
              onRequestDetail={() =>
                setResultMode(
                  "detail"
                )
              }
            />
          </>
        )}

      {groups.length > 0 &&
        resultMode === "detail" && (
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

      <div
        style={{
          textAlign: "center",
          marginTop: "35px",
          color: "#9ca3af",
          fontSize: "13px",
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
