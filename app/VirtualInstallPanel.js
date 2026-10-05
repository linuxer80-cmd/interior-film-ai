"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FilmColorPicker from "./FilmColorPicker";

const TARGET_TYPES = [
  { key: "artwall", label: "아트월·벽면" },
  { key: "kitchen", label: "싱크대·주방가구" },
  { key: "door", label: "문·문틀" },
  { key: "built_in", label: "붙박이장" },
  { key: "shoe_cabinet", label: "신발장" },
  { key: "fridge_cabinet", label: "냉장고장" },
  { key: "cabinet", label: "기타 장류" },
];

const AREA_DEFINITIONS = {
  artwall: [
    {
      key: "artwall_surface",
      label: "아트월·벽면",
      words: ["아트월", "벽면", "벽체", "artwall", "featurewall"],
    },
  ],
  kitchen: [
    {
      key: "kitchen_upper",
      label: "상부장",
      words: ["상부장", "상부수납장", "uppercabinet", "wallcabinet"],
    },
    {
      key: "kitchen_lower",
      label: "하부장",
      words: ["하부장", "하부수납장", "lowercabinet", "basecabinet"],
    },
    {
      key: "fridge_cabinet",
      label: "냉장고장",
      words: ["냉장고장", "냉장고수납장", "fridgecabinet", "refrigeratorcabinet"],
    },
    {
      key: "tall_cabinet",
      label: "키큰장",
      words: ["키큰장", "키높이장", "tallcabinet"],
    },
    {
      key: "pantry_cabinet",
      label: "팬트리장",
      words: ["팬트리", "펜트리", "pantry"],
    },
    {
      key: "island_cabinet",
      label: "아일랜드장",
      words: ["아일랜드", "island"],
    },
  ],
  door: [
    {
      key: "door_leaf",
      label: "문짝",
      words: ["문짝", "방문", "방화문", "중문", "현관문", "도어", "door"],
    },
    {
      key: "door_frame",
      label: "문틀",
      words: ["문틀", "도어프레임", "doorframe"],
    },
  ],
  built_in: [
    {
      key: "built_in",
      label: "붙박이장",
      words: ["붙박이", "built-in", "builtin", "wardrobe"],
    },
  ],
  shoe_cabinet: [
    {
      key: "shoe_cabinet",
      label: "신발장",
      words: ["신발장", "신발수납장", "shoecabinet"],
    },
  ],
  fridge_cabinet: [
    {
      key: "fridge_cabinet",
      label: "냉장고장",
      words: ["냉장고장", "냉장고수납장", "fridgecabinet"],
    },
  ],
  cabinet: [
    {
      key: "cabinet",
      label: "수납장",
      words: ["수납장", "장식장", "거실장", "서랍장", "옷장", "책장", "cabinet", "closet"],
    },
  ],
};

function getImageId(image, index) {
  return String(image?.id || image?.key || image?.name || image?.file?.name || index);
}

function getImagePreview(image) {
  return image?.preview || image?.previewUrl || image?.url || image?.src || "";
}

function getFilmTitle(film) {
  return film ? [film.brand, film.product_code].filter(Boolean).join(" ") : "필름 미선택";
}

function getFilmDescription(film) {
  return film?.color_description || film?.color_family || film?.product_name || "";
}

function includesAny(text, words) {
  const normalize = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();
  const value = normalize(text);
  return words.some((word) => value.includes(normalize(word)));
}

function getAnalysisText(photo, group) {
  let analysisJson = "";
  try {
    analysisJson = JSON.stringify(photo?.analysis || {});
  } catch {
    analysisJson = "";
  }

  return [
    group?.category,
    group?.subCategory,
    group?.sub_category,
    group?.description,
    photo?.category,
    photo?.subCategory,
    photo?.sub_category,
    photo?.description,
    photo?.analysis?.category,
    photo?.analysis?.subCategory,
    photo?.analysis?.sub_category,
    photo?.analysis?.description,
    ...(Array.isArray(photo?.analysis?.tags) ? photo.analysis.tags : []),
    ...(Array.isArray(photo?.tags) ? photo.tags : []),
    analysisJson,
  ].filter(Boolean).join(" ");
}

function getMatchedAnalysis(image, groups) {
  const currentId = image?.id || image?.imageId || image?.image_id;

  const matched = (Array.isArray(groups) ? groups : []).flatMap((group) =>
    (Array.isArray(group?.photos) ? group.photos : [])
      .filter((photo) => {
        const photoId = photo?.id || photo?.imageId || photo?.image_id;
        return Boolean(currentId && photoId && String(currentId) === String(photoId));
      })
      .map((photo) => ({ photo, group })),
  );

  const photoText = [
    getAnalysisText(image, null),
    ...matched.map(({ photo }) => getAnalysisText(photo, null)),
  ].filter(Boolean).join(" ");

  const groupText = matched
    .map(({ group }) => getAnalysisText(null, group))
    .filter(Boolean)
    .join(" ");

  return { photoText, groupText, allText: `${photoText} ${groupText}` };
}

function detectType(text) {
  if (includesAny(text, ["아트월", "artwall", "featurewall", "accentwall"])) return "artwall";
  if (includesAny(text, ["붙박이", "builtincloset", "built-incloset", "builtincabinet", "wardrobe"])) return "built_in";
  if (includesAny(text, ["신발장", "신발수납장", "shoecabinet", "shoestorage"])) return "shoe_cabinet";
  if (includesAny(text, ["싱크대", "주방", "상부장", "하부장", "키큰장", "팬트리", "펜트리", "아일랜드", "kitchen", "uppercabinet", "lowercabinet"])) return "kitchen";
  if (includesAny(text, ["냉장고장", "냉장고수납장", "fridgecabinet", "refrigeratorcabinet"])) return "fridge_cabinet";
  if (includesAny(text, ["방문", "방화문", "중문", "현관문", "문틀", "문짝", "도어", "door"])) return "door";
  if (includesAny(text, ["수납장", "장식장", "거실장", "서랍장", "옷장", "책장", "cabinet", "closet"])) return "cabinet";
  return "";
}

function getTargetAreas(targetType, analysis) {
  const definitions = AREA_DEFINITIONS[targetType] || [];
  const detected = definitions.filter((area) => includesAny(analysis.allText, area.words));

  if (detected.length) {
    return detected.map(({ key, label }) => ({ key, label }));
  }

  if (targetType === "kitchen") {
    return [{ key: "kitchen_all", label: "싱크대·주방가구" }];
  }

  if (targetType === "door") {
    return [{ key: "door_all", label: "문·문틀" }];
  }

  return definitions.slice(0, 1).map(({ key, label }) => ({ key, label }));
}

function makeFilmPayload(area, film) {
  return {
    areaKey: area.key,
    areaLabel: area.label,
    brand: film?.brand || "",
    productCode: film?.product_code || "",
    productName: film?.product_name || "",
    texture: film?.texture || "",
    colorFamily: film?.color_family || "",
    colorDescription: film?.color_description || "",
    colorHex: film?.color_hex || "",
    sampleImageUrl: film?.sample_image_path || "",
  };
}

function downloadImage(url) {
  const link = document.createElement("a");
  link.href = url;
  link.download = `virtual-install-${Date.now()}.webp`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function VirtualInstallPanel({
  images = [],
  product,
  groups = [],
  useSplitTone = false,
  areaFilms = {},
  onUseSplitToneChange,
  onAreaFilmsChange,
  onRequestDetail,
  companySlug = "",
}) {
  const [selectedImageId, setSelectedImageId] = useState("");
  const [targetType, setTargetType] = useState("");
  const [colorMode, setColorMode] = useState(useSplitTone ? "multi" : "single");
  const [localAreaFilms, setLocalAreaFilms] = useState(areaFilms);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const generationRef = useRef(0);
  const requestRef = useRef(null);
  const busyRef = useRef(false);

  const safeImages = Array.isArray(images) ? images : [];
  const sourceKey = safeImages
    .map((image, index) => `${getImageId(image, index)}:${getImagePreview(image)}`)
    .join("|");

  const selectedImage = safeImages.find(
    (image, index) => getImageId(image, index) === selectedImageId,
  ) || null;

  const analysis = useMemo(
    () => getMatchedAnalysis(selectedImage, groups),
    [selectedImage, groups],
  );

  const detectedType = detectType(analysis.photoText) || detectType(analysis.groupText);

  const targetAreas = useMemo(
    () => getTargetAreas(targetType, analysis),
    [targetType, analysis],
  );

  const supportsMultiTone =
    ["kitchen", "door"].includes(targetType) && targetAreas.length > 1;

  const selectedType = TARGET_TYPES.find((item) => item.key === targetType);

  function invalidateRequest() {
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    busyRef.current = false;
    setLoading(false);
    setResult(null);
    setMessage("");
  }

  useEffect(() => {
    const exists = safeImages.some(
      (image, index) => getImageId(image, index) === selectedImageId,
    );

    if (!exists) {
      setSelectedImageId(safeImages.length ? getImageId(safeImages[0], 0) : "");
    }
  }, [sourceKey, selectedImageId]);

  useEffect(() => {
    invalidateRequest();
    setTargetType(detectedType || "");
    setColorMode("single");
    setLocalAreaFilms({});

    return () => {
      generationRef.current += 1;
      requestRef.current?.abort();
      busyRef.current = false;
    };
  }, [sourceKey, selectedImageId, detectedType]);

  useEffect(() => {
    invalidateRequest();
  }, [product?.id, product?.brand, product?.product_code]);

  useEffect(() => {
    setLocalAreaFilms(areaFilms || {});
  }, [areaFilms]);

  useEffect(() => {
    setColorMode(useSplitTone ? "multi" : "single");
  }, [useSplitTone]);

  useEffect(() => {
    if (!supportsMultiTone && colorMode === "multi") {
      setColorMode("single");
      setLocalAreaFilms({});
      onUseSplitToneChange?.(false);
      onAreaFilmsChange?.({});
    }
  }, [supportsMultiTone, colorMode, onUseSplitToneChange, onAreaFilmsChange]);

  function selectImage(imageId) {
    invalidateRequest();
    setSelectedImageId(imageId);
    setTargetType("");
    setColorMode("single");
    setLocalAreaFilms({});
    onUseSplitToneChange?.(false);
    onAreaFilmsChange?.({});
  }

  function selectTarget(value) {
    invalidateRequest();
    setTargetType(value);
    setColorMode("single");
    setLocalAreaFilms({});
    onUseSplitToneChange?.(false);
    onAreaFilmsChange?.({});
  }

  function selectColorMode(value) {
    if (value === "multi" && !supportsMultiTone) return;
    invalidateRequest();
    setColorMode(value);
    setLocalAreaFilms({});
    onUseSplitToneChange?.(value === "multi");
    onAreaFilmsChange?.({});
  }

  function selectAreaFilm(key, film) {
    invalidateRequest();
    const next = { ...localAreaFilms, [key]: film || product };
    setLocalAreaFilms(next);
    onAreaFilmsChange?.(next);
  }

  async function generateVirtualImage() {
    if (busyRef.current) return;

    if (!selectedImage?.file) {
      setMessage("❌ 원본 사진을 다시 선택해주세요.");
      return;
    }

    if (!targetType || !targetAreas.length) {
      setMessage("❌ 사진에 실제로 보이는 시공 부위를 선택해주세요.");
      return;
    }

    if (!product?.product_code) {
      setMessage("❌ 먼저 필름을 선택해주세요.");
      return;
    }

    if (!companySlug) {
      setMessage("❌ 업체 페이지에서 다시 시도해주세요.");
      return;
    }

    const sourceImage = selectedImage;
    const generation = ++generationRef.current;
    const controller = new AbortController();

    requestRef.current?.abort();
    requestRef.current = controller;
    busyRef.current = true;
    setLoading(true);
    setResult(null);
    setMessage("선택한 원본 사진을 가상시공하고 있습니다.");

    const multi = supportsMultiTone && colorMode === "multi";
    const form = new FormData();

    form.append("company_slug", companySlug);
    form.append("image", sourceImage.file);
    form.append("targetType", targetType);
    form.append("targetLabel", selectedType?.label || "");
    form.append("useSplitTone", multi ? "true" : "false");

    const primary = makeFilmPayload(
      { key: "all", label: "전체 시공 부위" },
      product,
    );

    Object.entries(primary).forEach(([key, value]) => {
      if (key !== "areaKey" && key !== "areaLabel") form.append(key, value);
    });

    form.append(
      "areaFilms",
      JSON.stringify(
        targetAreas.map((area) =>
          makeFilmPayload(
            area,
            multi ? localAreaFilms[area.key] || product : product,
          ),
        ),
      ),
    );

    try {
      const response = await fetch("/api/virtual-install", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (generation !== generationRef.current || controller.signal.aborted) {
        return;
      }

      if (!response.ok || !data?.imageUrl) {
        throw new Error(data?.error || "가상시공에 실패했습니다.");
      }

      setResult({
        image: sourceImage,
        imageUrl: data.imageUrl,
        targetLabel: selectedType?.label,
      });
      setMessage("✅ 가상시공이 완료되었습니다.");
    } catch (error) {
      if (generation !== generationRef.current || controller.signal.aborted) {
        return;
      }
      setMessage(`❌ ${error.message || "다시 시도해주세요."}`);
    } finally {
      if (generation === generationRef.current) {
        busyRef.current = false;
        setLoading(false);
        requestRef.current = null;
      }
    }
  }

  if (!safeImages.length || !product) return null;

  return (
    <section className="virtual-safe-panel">
      <h3>가상시공</h3>
      <p className="virtual-sub">
        원본 사진과 시공 부위를 확인한 뒤 생성해주세요.
      </p>

      <div className="virtual-film">
        <small>선택 필름</small>
        <strong>{getFilmTitle(product)}</strong>
        <span>{getFilmDescription(product)}</span>
      </div>

      <h4>1. 원본 사진</h4>
      <div className="virtual-images">
        {safeImages.map((image, index) => {
          const id = getImageId(image, index);
          return (
            <button
              key={id}
              type="button"
              className={id === selectedImageId ? "active" : ""}
              onClick={() => selectImage(id)}
            >
              <img src={getImagePreview(image)} alt={`원본 사진 ${index + 1}`} />
              <span>
                사진 {index + 1}
                {id === selectedImageId ? " ✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <label className="virtual-target">
        2. 시공 부위 확인
        <select
          value={targetType}
          onChange={(event) => selectTarget(event.target.value)}
        >
          <option value="">사진에 보이는 시공 부위를 선택하세요</option>
          {TARGET_TYPES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <p className="virtual-sub">
        자동판정이 틀리면 직접 수정하세요. 원본에 없는 부위를 선택하지 마세요.
      </p>

      {targetType && (
        <>
          <div className="virtual-areas">
            {targetAreas.map((area) => (
              <div key={area.key}>
                <strong>✓ {area.label}</strong>
                <span>
                  {getFilmTitle(
                    colorMode === "multi"
                      ? localAreaFilms[area.key] || product
                      : product,
                  )}
                </span>
              </div>
            ))}
          </div>

          {supportsMultiTone && (
            <div className="virtual-modes">
              <button
                type="button"
                className={colorMode === "single" ? "active" : ""}
                onClick={() => selectColorMode("single")}
              >
                컬러 통일
              </button>
              <button
                type="button"
                className={colorMode === "multi" ? "active" : ""}
                onClick={() => selectColorMode("multi")}
              >
                여러 톤 사용
              </button>
            </div>
          )}

          {supportsMultiTone && colorMode === "multi" &&
            targetAreas.map((area) => (
              <div key={area.key} className="virtual-area-picker">
                <strong>{area.label}</strong>
                <FilmColorPicker
                  value={localAreaFilms[area.key] || product}
                  onSelect={(film) => selectAreaFilm(area.key, film)}
                />
              </div>
            ))}

          <button
            type="button"
            className="virtual-generate"
            disabled={loading}
            onClick={generateVirtualImage}
          >
            {loading
              ? "가상시공 중…"
              : `${selectedType?.label || ""} 가상시공하기`}
          </button>
        </>
      )}

      {message && (
        <p
          className={`virtual-message ${message.startsWith("❌") ? "error" : ""}`}
          role="status"
        >
          {message}
        </p>
      )}

      {result && (
        <div className="virtual-result">
          <h4>{result.targetLabel} 가상시공 결과</h4>
          <div className="virtual-comparison">
            <div>
              <strong>원본</strong>
              <img src={getImagePreview(result.image)} alt="원본 사진" />
            </div>
            <div>
              <strong>가상시공</strong>
              <img src={result.imageUrl} alt="가상시공 결과" />
            </div>
          </div>
          <p className="virtual-sub">
            문·문틀 등 원본에 없던 구조가 생겼다면 해당 결과를 사용하지 마세요.
          </p>
          <button
            type="button"
            className="virtual-save"
            onClick={() => downloadImage(result.imageUrl)}
          >
            결과 이미지 저장
          </button>
          {onRequestDetail && (
            <button
              type="button"
              className="virtual-generate"
              onClick={onRequestDetail}
            >
              이 색상으로 상세견적 신청
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .virtual-safe-panel {
          margin-top: 16px;
          padding: 18px;
          border: 1px solid #eee8de;
          border-radius: 22px;
          background: #fff;
          color: #173456;
        }
        .virtual-safe-panel h3 { margin: 0; font-size: 22px; }
        .virtual-safe-panel h4 { margin: 20px 0 12px; font-size: 16px; }
        .virtual-sub {
          color: #748292;
          font-size: 13px;
          line-height: 1.65;
        }
        .virtual-film {
          display: grid;
          gap: 6px;
          background: #edf6ff;
          padding: 15px;
          border-radius: 16px;
        }
        .virtual-film small, .virtual-film span {
          color: #748292;
          font-size: 12px;
        }
        .virtual-images, .virtual-comparison {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .virtual-images button {
          min-width: 0;
          padding: 5px;
          border: 1px solid #dce6ee;
          border-radius: 14px;
          background: #fff;
          cursor: pointer;
        }
        .virtual-images button.active {
          border: 3px solid #398be0;
        }
        .virtual-images img {
          width: 100%;
          aspect-ratio: 4 / 3;
          object-fit: cover;
          border-radius: 10px;
          display: block;
        }
        .virtual-images span {
          display: block;
          padding: 8px 4px;
          font-size: 13px;
          color: #173456;
        }
        .virtual-target {
          display: block;
          margin-top: 22px;
          font-size: 16px;
          font-weight: 700;
        }
        .virtual-target select {
          box-sizing: border-box;
          display: block;
          width: 100%;
          margin-top: 10px;
          padding: 13px;
          border: 1px solid #dce6ee;
          border-radius: 13px;
          background: #fff;
          color: #173456;
          font-size: 16px;
        }
        .virtual-areas { display: grid; gap: 8px; }
        .virtual-areas > div {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 13px;
          border: 1px solid #eee8de;
          border-radius: 12px;
          font-size: 13px;
        }
        .virtual-areas span {
          color: #398be0;
          overflow-wrap: anywhere;
          text-align: right;
        }
        .virtual-modes {
          display: flex;
          gap: 6px;
          margin-top: 16px;
          padding: 5px;
          background: #f3f6fa;
          border-radius: 14px;
        }
        .virtual-modes button {
          flex: 1;
          padding: 12px 8px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #748292;
          font-weight: 700;
          cursor: pointer;
        }
        .virtual-modes button.active {
          background: #398be0;
          color: #fff;
        }
        .virtual-area-picker { margin-top: 16px; }
        .virtual-generate, .virtual-save {
          width: 100%;
          margin-top: 16px;
          padding: 15px;
          border: 0;
          border-radius: 14px;
          background: #398be0;
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
        }
        .virtual-generate:disabled {
          background: #9ca3af;
          cursor: default;
        }
        .virtual-save {
          border: 1px solid #dce6ee;
          background: #fff;
          color: #173456;
        }
        .virtual-message {
          padding: 13px;
          background: #f3f6fa;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }
        .virtual-message.error {
          background: #fef2f2;
          color: #b91c1c;
        }
        .virtual-comparison strong {
          display: block;
          margin-bottom: 8px;
          font-size: 13px;
        }
        .virtual-comparison img {
          display: block;
          width: 100%;
          height: auto;
          border-radius: 10px;
        }
      `}</style>
    </section>
  );
}
// 파일 끝
