"use client";

import { useEffect, useMemo, useState } from "react";
import FilmColorPicker from "./FilmColorPicker";

/* =========================================================
   가상시공 종류
   - 싱크대 / 문·문틀만 여러 톤 허용
   - 붙박이장 / 신발장 / 냉장고장 / 기타 장류는 단일 컬러
========================================================= */

const TARGET_TYPES = [
  {
    key: "kitchen",
    label: "싱크대·주방가구",
    description: "상부장·하부장·냉장고장 등",
    multiTone: true,
  },
  {
    key: "door",
    label: "문·문틀",
    description: "문짝과 문틀",
    multiTone: true,
  },
  {
    key: "built_in",
    label: "붙박이장",
    description: "붙박이장 전체",
    multiTone: false,
  },
  {
    key: "shoe_cabinet",
    label: "신발장",
    description: "신발장 전체",
    multiTone: false,
  },
  {
    key: "fridge_cabinet",
    label: "냉장고장",
    description: "냉장고장 전체",
    multiTone: false,
  },
  {
    key: "cabinet",
    label: "기타 장류",
    description: "수납장·장식장 등",
    multiTone: false,
  },
];

const TARGET_AREAS = {
  kitchen: [
    { key: "kitchen_upper", label: "상부장" },
    { key: "kitchen_lower", label: "하부장" },
    { key: "fridge_cabinet", label: "냉장고장" },
    { key: "tall_cabinet", label: "키큰장" },
    { key: "pantry_cabinet", label: "팬트리장" },
    { key: "island_cabinet", label: "아일랜드장" },
  ],

  door: [
    { key: "door_leaf", label: "문짝" },
    { key: "door_frame", label: "문틀" },
  ],

  built_in: [
    { key: "built_in", label: "붙박이장" },
  ],

  shoe_cabinet: [
    { key: "shoe_cabinet", label: "신발장" },
  ],

  fridge_cabinet: [
    { key: "fridge_cabinet", label: "냉장고장" },
  ],

  cabinet: [
    { key: "cabinet", label: "수납장" },
  ],
};

function getImageId(image, index) {
  return String(
    image?.id ||
      image?.key ||
      image?.name ||
      image?.file?.name ||
      index
  );
}

function getImagePreview(image) {
  return (
    image?.preview ||
    image?.previewUrl ||
    image?.url ||
    image?.src ||
    ""
  );
}

function getFilmTitle(film) {
  if (!film) {
    return "필름 미선택";
  }

  return [film.brand, film.product_code]
    .filter(Boolean)
    .join(" ");
}

function getFilmDescription(film) {
  if (!film) {
    return "";
  }

  return (
    film.color_description ||
    film.color_family ||
    film.product_name ||
    ""
  );
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function includesAny(text, words) {
  const normalized = normalizeText(text);

  return words.some((word) =>
    normalized.includes(normalizeText(word))
  );
}

function getIdentityValues(item) {
  return [
    item?.id,
    item?.imageId,
    item?.image_id,
    item?.key,
    item?.name,
    item?.fileName,
    item?.file_name,
    item?.file?.name,
    item?.preview,
    item?.previewUrl,
    item?.url,
    item?.src,
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function getAnalysisText(photo, group) {
  return [
    group?.key,
    group?.category,
    group?.subCategory,
    group?.sub_category,
    group?.name,
    group?.label,
    group?.title,
    group?.description,

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
    photo?.analysis?.description,

    ...(Array.isArray(photo?.analysis?.tags)
      ? photo.analysis.tags
      : []),

    ...(Array.isArray(photo?.tags)
      ? photo.tags
      : []),
  ]
    .filter(Boolean)
    .join(" ");
}

/* =========================================================
   AI 분석 텍스트 → 가상시공 종류

   중요:
   "붙박이장 문짝", "신발장 도어", "냉장고장 문짝"처럼
   문/도어라는 단어가 함께 있어도 가구 종류를 먼저 판정한다.
========================================================= */

function detectTypeFromText(text) {
  if (!text) {
    return "";
  }

  /* -------------------------
     1. 붙박이장 최우선
  ------------------------- */

  if (
    includesAny(text, [
      "붙박이장",
      "붙박이",
      "붙박이장문",
      "붙박이장문짝",
      "붙박이장도어",
      "builtincloset",
      "built-incloset",
      "builtincabinet",
      "built-incabinet",
      "wardrobe",
    ])
  ) {
    return "built_in";
  }

  /* -------------------------
     2. 신발장
  ------------------------- */

  if (
    includesAny(text, [
      "신발장",
      "신발수납장",
      "신발장문",
      "신발장문짝",
      "신발장도어",
      "shoecabinet",
      "shoestorage",
    ])
  ) {
    return "shoe_cabinet";
  }

  /* -------------------------
     3. 냉장고장
     싱크대 전체 사진에 포함된 냉장고장은 아래에서
     kitchen으로 판정될 수 있지만,
     사진 자체가 냉장고장으로 분석된 경우 우선 분리한다.
  ------------------------- */

  if (
    includesAny(text, [
      "냉장고장",
      "냉장고수납장",
      "냉장고장문",
      "냉장고장문짝",
      "냉장고장도어",
      "fridgecabinet",
      "refrigeratorcabinet",
    ])
  ) {
    return "fridge_cabinet";
  }

  /* -------------------------
     4. 싱크대 / 주방가구
  ------------------------- */

  if (
    includesAny(text, [
      "싱크대",
      "주방",
      "주방가구",
      "상부장",
      "하부장",
      "키큰장",
      "키높이장",
      "팬트리",
      "펜트리",
      "아일랜드",
      "싱크볼",
      "조리대",
      "kitchen",
      "kitchencabinet",
      "uppercabinet",
      "lowercabinet",
    ])
  ) {
    return "kitchen";
  }

  /* -------------------------
     5. 실제 문 / 문틀
  ------------------------- */

  if (
    includesAny(text, [
      "방문",
      "방화문",
      "중문",
      "현관문",
      "도어프레임",
      "문틀",
      "doorframe",
      "firedoor",
      "slidingdoor",
      "entrancedoor",
    ])
  ) {
    return "door";
  }

  /*
   * '문짝', '도어', 'door'만 있는 경우.
   * 위의 붙박이장/신발장/냉장고장 판정을 모두 통과한
   * 뒤에만 일반 문으로 처리한다.
   */

  if (
    includesAny(text, [
      "문짝",
      "도어",
      "door",
    ])
  ) {
    return "door";
  }

  /* -------------------------
     6. 기타 장류
  ------------------------- */

  if (
    includesAny(text, [
      "수납장",
      "장식장",
      "거실장",
      "서랍장",
      "옷장",
      "책장",
      "cabinet",
      "storagecabinet",
      "closet",
    ])
  ) {
    return "cabinet";
  }

  return "";
}

function detectTargetTypeForImage(
  image,
  imageIndex,
  images,
  groups
) {
  const imageValues = getIdentityValues(image);
  const entries = [];

  (Array.isArray(groups) ? groups : []).forEach((group) => {
    const photos = Array.isArray(group?.photos)
      ? group.photos
      : [];

    photos.forEach((photo) => {
      entries.push({
        photo,
        group,
      });
    });
  });

  let matchedEntries = entries.filter(({ photo }) => {
    const photoValues = getIdentityValues(photo);

    return imageValues.some((value) =>
      photoValues.includes(value)
    );
  });

  if (
    !matchedEntries.length &&
    entries.length === images.length &&
    entries[imageIndex]
  ) {
    matchedEntries = [entries[imageIndex]];
  }

  /*
   * 사진 자체의 분석 결과를 가장 먼저 확인한다.
   */

  const photoText = [
    getAnalysisText(image, null),

    ...matchedEntries.map(({ photo }) =>
      getAnalysisText(photo, null)
    ),
  ].join(" ");

  const photoType = detectTypeFromText(photoText);

  if (photoType) {
    return photoType;
  }

  /*
   * 사진 분석으로 판단되지 않은 경우
   * 해당 사진이 속한 그룹 정보를 사용한다.
   */

  const groupText = matchedEntries
    .map(({ group }) =>
      getAnalysisText(null, group)
    )
    .join(" ");

  const groupType = detectTypeFromText(groupText);

  if (groupType) {
    return groupType;
  }

  /*
   * 마지막으로 category / subCategory만 모아서
   * 다시 한 번 판정한다.
   */

  const priorityText = [
    image?.category,
    image?.subCategory,
    image?.sub_category,

    ...matchedEntries.flatMap(({ photo }) => [
      photo?.category,
      photo?.subCategory,
      photo?.sub_category,

      photo?.analysis?.category,
      photo?.analysis?.subCategory,
      photo?.analysis?.sub_category,
    ]),
  ]
    .filter(Boolean)
    .join(" ");

  return detectTypeFromText(priorityText);
}

function makeFilmPayload(area, film) {
  return {
    areaKey: area?.key || "",
    areaLabel: area?.label || "",
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

function downloadImage(imageUrl, fileName) {
  if (!imageUrl) {
    return;
  }

  const link = document.createElement("a");

  link.href = imageUrl;
  link.download = fileName || "virtual-install.webp";

  document.body.appendChild(link);
  link.click();
  link.remove();
}

function TypeButton({
  title,
  description,
  onSelect,
}) {
  function handleSelect(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    onSelect?.();
  }

  return (
    <button
      type="button"
      onPointerDown={handleSelect}
      onClick={handleSelect}
      style={{
        position: "relative",
        zIndex: 2,
        width: "100%",
        minHeight: "105px",
        padding: "14px 12px",
        border: "1px solid #d1d5db",
        borderRadius: "13px",
        background: "#ffffff",
        color: "#111827",
        textAlign: "left",
        cursor: "pointer",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "7px",
          pointerEvents: "none",
        }}
      >
        <strong
          style={{
            minWidth: 0,
            fontSize: "14px",
            lineHeight: 1.35,
            letterSpacing: "-0.5px",
            wordBreak: "keep-all",
          }}
        >
          {title}
        </strong>

        <span
          style={{
            width: "24px",
            height: "24px",
            flex: "0 0 24px",
            borderRadius: "50%",
            background: "#e5e7eb",
          }}
        />
      </div>

      <div
        style={{
          marginTop: "6px",
          color: "#6b7280",
          fontSize: "11px",
          lineHeight: 1.45,
          wordBreak: "keep-all",
          pointerEvents: "none",
        }}
      >
        {description}
      </div>
    </button>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 8px",
        border: "none",
        borderRadius: "9px",
        background: active
          ? "#6d28d9"
          : "transparent",
        color: active
          ? "#ffffff"
          : "#4b5563",
        fontSize: "13px",
        fontWeight: "900",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function AreaRow({ area, film }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        padding: "12px",
        border: "1px solid #e5e7eb",
        borderRadius: "11px",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "9px",
          minWidth: 0,
        }}
      >
        <span
          style={{
            width: "28px",
            height: "28px",
            flex: "0 0 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            background: "#ede9fe",
            color: "#6d28d9",
            fontSize: "14px",
            fontWeight: "900",
          }}
        >
          ✓
        </span>

        <strong
          style={{
            fontSize: "14px",
            whiteSpace: "nowrap",
          }}
        >
          {area.label}
        </strong>
      </div>

      <div
        style={{
          minWidth: 0,
          color: "#6d28d9",
          fontSize: "12px",
          fontWeight: "800",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: "right",
        }}
      >
        {getFilmTitle(film)}
      </div>
    </div>
  );
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
}) {
  const [selectedImageId, setSelectedImageId] =
    useState("");

  const [targetType, setTargetType] =
    useState("");

  const [manualTypeMode, setManualTypeMode] =
    useState(false);

  const [colorMode, setColorMode] =
    useState(
      useSplitTone
        ? "multi"
        : "single"
    );

  const [localAreaFilms, setLocalAreaFilms] =
    useState(areaFilms || {});

  const [result, setResult] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    if (!images.length) {
      setSelectedImageId("");
      setTargetType("");
      setResult(null);
      return;
    }

    const selectedExists = images.some(
      (image, index) =>
        getImageId(image, index) === selectedImageId
    );

    if (!selectedExists) {
      setSelectedImageId(
        getImageId(images[0], 0)
      );
    }
  }, [images, selectedImageId]);

  useEffect(() => {
    setLocalAreaFilms(areaFilms || {});
  }, [areaFilms]);

  useEffect(() => {
    setColorMode(
      useSplitTone
        ? "multi"
        : "single"
    );
  }, [useSplitTone]);

  const selectedImage = useMemo(() => {
    return (
      images.find(
        (image, index) =>
          getImageId(image, index) === selectedImageId
      ) || null
    );
  }, [images, selectedImageId]);

  const selectedImageIndex = useMemo(() => {
    return images.findIndex(
      (image, index) =>
        getImageId(image, index) === selectedImageId
    );
  }, [images, selectedImageId]);

  const detectedTargetType = useMemo(() => {
    if (!selectedImage) {
      return "";
    }

    return detectTargetTypeForImage(
      selectedImage,
      selectedImageIndex,
      images,
      groups
    );
  }, [
    selectedImage,
    selectedImageIndex,
    images,
    groups,
  ]);

  /*
   * 현재 선택 종류가 여러 톤을 지원하는지 확인한다.
   * 싱크대와 문·문틀만 true.
   */

  const supportsMultiTone = useMemo(() => {
    return (
      targetType === "kitchen" ||
      targetType === "door"
    );
  }, [targetType]);

  /*
   * 선택한 사진의 AI 분석 결과만 사용해
   * 시공 종류를 자동 선택한다.
   */

  useEffect(() => {
    if (
      !selectedImage ||
      manualTypeMode
    ) {
      return;
    }

    if (!detectedTargetType) {
      setTargetType("");
      return;
    }

    setTargetType((current) =>
      current === detectedTargetType
        ? current
        : detectedTargetType
    );

    /*
     * 사진이 바뀌거나 AI 판정이 바뀌면
     * 항상 컬러 통일부터 시작한다.
     */

    setColorMode("single");
    onUseSplitToneChange?.(false);
  }, [
    selectedImageId,
    detectedTargetType,
    manualTypeMode,
  ]);

  /*
   * 붙박이장/신발장/냉장고장/기타 장류에서는
   * 외부 상태가 multi로 들어오더라도 single로 강제한다.
   */

  useEffect(() => {
    if (!targetType) {
      return;
    }

    if (
      !supportsMultiTone &&
      colorMode === "multi"
    ) {
      setColorMode("single");
      setLocalAreaFilms({});
      onUseSplitToneChange?.(false);
      onAreaFilmsChange?.({});
    }
  }, [
    targetType,
    supportsMultiTone,
    colorMode,
    onUseSplitToneChange,
    onAreaFilmsChange,
  ]);

  useEffect(() => {
    setResult(null);
    setMessage("");
  }, [
    selectedImageId,
    targetType,
    colorMode,
    product?.id,
    localAreaFilms,
  ]);

  const selectedType = useMemo(() => {
    return (
      TARGET_TYPES.find(
        (item) => item.key === targetType
      ) || null
    );
  }, [targetType]);

  const targetAreas = useMemo(() => {
    return TARGET_AREAS[targetType] || [];
  }, [targetType]);

  useEffect(() => {
    if (
      colorMode !== "multi" ||
      !supportsMultiTone ||
      !product ||
      !targetAreas.length
    ) {
      return;
    }

    setLocalAreaFilms((previous) => {
      const next = {
        ...previous,
      };

      targetAreas.forEach((area) => {
        if (!next[area.key]) {
          next[area.key] = product;
        }
      });

      return next;
    });
  }, [
    colorMode,
    supportsMultiTone,
    product,
    targetAreas,
  ]);

  function selectImage(imageId) {
    if (loading) {
      return;
    }

    setManualTypeMode(false);
    setTargetType("");
    setSelectedImageId(imageId);
    setColorMode("single");
    setLocalAreaFilms({});
    setResult(null);
    setMessage("");

    onUseSplitToneChange?.(false);
    onAreaFilmsChange?.({});
  }

  function selectTargetType(type) {
    if (loading) {
      return;
    }

    setTargetType(type);
    setManualTypeMode(false);
    setColorMode("single");
    setLocalAreaFilms({});
    setResult(null);
    setMessage("");

    onUseSplitToneChange?.(false);
    onAreaFilmsChange?.({});
  }

  function changeTargetType() {
    if (loading) {
      return;
    }

    setManualTypeMode(true);
    setTargetType("");
    setColorMode("single");
    setLocalAreaFilms({});
    setResult(null);
    setMessage("");

    onUseSplitToneChange?.(false);
    onAreaFilmsChange?.({});
  }

  function selectManualTargetType(type) {
    if (loading) {
      return;
    }

    setTargetType(type);
    setManualTypeMode(true);
    setColorMode("single");
    setLocalAreaFilms({});
    setResult(null);
    setMessage("");

    onUseSplitToneChange?.(false);
    onAreaFilmsChange?.({});
  }

  function selectColorMode(mode) {
    if (loading) {
      return;
    }

    /*
     * 싱크대 / 문·문틀이 아니면
     * 여러 톤 선택 자체를 허용하지 않는다.
     */

    if (
      mode === "multi" &&
      !supportsMultiTone
    ) {
      setColorMode("single");
      setLocalAreaFilms({});
      onUseSplitToneChange?.(false);
      onAreaFilmsChange?.({});
      return;
    }

    setColorMode(mode);
    setResult(null);
    setMessage("");

    if (mode === "single") {
      setLocalAreaFilms({});
      onAreaFilmsChange?.({});
    }

    onUseSplitToneChange?.(
      mode === "multi"
    );
  }

  function selectAreaFilm(areaKey, film) {
    if (!supportsMultiTone) {
      return;
    }

    const next = {
      ...localAreaFilms,
      [areaKey]: film || product,
    };

    setLocalAreaFilms(next);
    onAreaFilmsChange?.(next);
  }

  function makeRequestForm() {
    const formData = new FormData();

    formData.append(
      "image",
      selectedImage.file
    );

    formData.append(
      "targetType",
      targetType
    );

    formData.append(
      "brand",
      product?.brand || ""
    );

    formData.append(
      "productCode",
      product?.product_code || ""
    );

    formData.append(
      "productName",
      product?.product_name || ""
    );

    formData.append(
      "texture",
      product?.texture || ""
    );

    formData.append(
      "colorFamily",
      product?.color_family || ""
    );

    formData.append(
      "colorDescription",
      product?.color_description || ""
    );

    formData.append(
      "colorHex",
      product?.color_hex || ""
    );
        formData.append(
      "sampleImageUrl",
      product?.sample_image_path || ""
    );

    /*
     * 여러 톤은 싱크대 / 문·문틀에서만 허용한다.
     * 다른 종류에서는 상태가 잘못 들어와도 false로 전송한다.
     */
    const multiTone =
      supportsMultiTone &&
      colorMode === "multi";

    formData.append(
      "useSplitTone",
      multiTone
        ? "true"
        : "false"
    );

    const films = targetAreas.map((area) =>
      makeFilmPayload(
        area,
        multiTone
          ? localAreaFilms[area.key] || product
          : product
      )
    );

    formData.append(
      "areaFilms",
      JSON.stringify(films)
    );

    /*
     * 서버가 일반 단일컬러 종류에서도
     * 어떤 시공 종류인지 명확하게 알 수 있도록
     * 사람이 읽을 수 있는 이름도 같이 전달한다.
     */
    formData.append(
      "targetLabel",
      selectedType?.label || ""
    );

    return formData;
  }

  async function generateVirtualImage() {
    if (loading) {
      return;
    }

    if (!selectedImage) {
      setMessage(
        "❌ 가상시공할 사진을 선택해주세요."
      );
      return;
    }

    if (!targetType) {
      setMessage(
        "❌ 시공 종류를 선택해주세요."
      );
      return;
    }

    if (!product) {
      setMessage(
        "❌ 먼저 기본 필름을 선택해주세요."
      );
      return;
    }

    /*
     * 여러 톤은 싱크대 / 문·문틀에서만 검사한다.
     */
    if (
      supportsMultiTone &&
      colorMode === "multi"
    ) {
      const missingArea = targetAreas.find(
        (area) =>
          !localAreaFilms[area.key]
      );

      if (missingArea) {
        setMessage(
          `❌ ${missingArea.label} 필름을 선택해주세요.`
        );
        return;
      }
    }

    setLoading(true);
    setResult(null);

    setMessage(
      "선택한 사진을 가상 시공하고 있습니다."
    );

    try {
      const response = await fetch(
        "/api/virtual-install",
        {
          method: "POST",
          body: makeRequestForm(),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (
        !response.ok ||
        !data?.imageUrl
      ) {
        throw new Error(
          data?.error ||
            "가상시공에 실패했습니다."
        );
      }

      setResult({
        image: selectedImage,
        imageUrl: data.imageUrl,
      });

      setMessage(
        "✅ 선택한 사진의 가상 시공이 완료되었습니다."
      );
    } catch (error) {
      console.error(
        "가상시공 오류:",
        error
      );

      setMessage(
        `❌ ${
          error?.message ||
          "다시 시도해주세요."
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  if (
    !Array.isArray(images) ||
    !images.length ||
    !product
  ) {
    return null;
  }

  return (
    <section
      style={{
        marginTop: "14px",
        padding: "15px",
        border: "1px solid #e5e7eb",
        borderRadius: "18px",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          fontSize: "19px",
          fontWeight: "900",
          color: "#111827",
        }}
      >
        가상 시공
      </div>

      <div
        style={{
          marginTop: "4px",
          color: "#6b7280",
          fontSize: "12px",
          lineHeight: 1.55,
        }}
      >
        사진을 선택하면 AI 분석 결과에 맞는 시공 부위가
        자동으로 표시됩니다.
      </div>

      <div
        style={{
          marginTop: "13px",
          padding: "12px",
          borderRadius: "12px",
          background: "#f3f4f6",
        }}
      >
        <div
          style={{
            color: "#6b7280",
            fontSize: "11px",
            fontWeight: "700",
          }}
        >
          기본 선택 필름
        </div>

        <div
          style={{
            marginTop: "3px",
            color: "#111827",
            fontSize: "16px",
            fontWeight: "900",
          }}
        >
          {getFilmTitle(product)}
        </div>

        <div
          style={{
            marginTop: "2px",
            color: "#6b7280",
            fontSize: "12px",
          }}
        >
          {getFilmDescription(product)}
        </div>
      </div>

      {/* =====================================================
          1. 사진 선택
      ===================================================== */}

      <div
        style={{
          marginTop: "18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <strong
            style={{
              fontSize: "15px",
            }}
          >
            1. 가상시공할 사진
          </strong>

          <span
            style={{
              color: "#6d28d9",
              fontSize: "11px",
              fontWeight: "800",
            }}
          >
            한 장만 선택
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: "9px",
            marginTop: "9px",
          }}
        >
          {images.map((image, index) => {
            const imageId =
              getImageId(image, index);

            const active =
              selectedImageId === imageId;

            return (
              <button
                key={imageId}
                type="button"
                disabled={loading}
                onClick={() =>
                  selectImage(imageId)
                }
                style={{
                  position: "relative",
                  minWidth: 0,
                  padding: "4px",
                  border: active
                    ? "3px solid #6d28d9"
                    : "1px solid #d1d5db",
                  borderRadius: "13px",
                  background: "#ffffff",
                  cursor: loading
                    ? "default"
                    : "pointer",
                  touchAction: "manipulation",
                }}
              >
                <img
                  src={getImagePreview(image)}
                  alt={`사진 ${index + 1}`}
                  style={{
                    display: "block",
                    width: "100%",
                    aspectRatio: "4 / 3",
                    objectFit: "cover",
                    borderRadius: "9px",
                  }}
                />

                <span
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    width: "30px",
                    height: "30px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    background: active
                      ? "#6d28d9"
                      : "rgba(17,24,39,0.55)",
                    color: "#ffffff",
                    fontSize: "17px",
                    fontWeight: "900",
                  }}
                >
                  {active ? "✓" : ""}
                </span>

                <span
                  style={{
                    display: "block",
                    padding: "6px 3px 3px",
                    color: "#111827",
                    fontSize: "12px",
                    fontWeight: "800",
                  }}
                >
                  사진 {index + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================
          AI가 종류를 못 찾았거나 수동 변경할 때
      ===================================================== */}

      {!targetType && (
        <div
          style={{
            marginTop: "19px",
          }}
        >
          <strong
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "15px",
            }}
          >
            {manualTypeMode
              ? "시공 종류 변경"
              : "AI가 종류를 판단하지 못했습니다"}
          </strong>

          <div
            style={{
              marginBottom: "9px",
              color: "#6b7280",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            시공할 종류를 직접 선택해주세요.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: "8px",
            }}
          >
            {TARGET_TYPES.map((type) => (
              <TypeButton
                key={type.key}
                title={type.label}
                description={type.description}
                onSelect={() =>
                  selectManualTargetType(
                    type.key
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* =====================================================
          판정 완료
      ===================================================== */}

      {targetType && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              marginTop: "19px",
              padding: "12px",
              borderRadius: "12px",
              background: "#f5f3ff",
            }}
          >
            <div>
              <div
                style={{
                  color: "#6b7280",
                  fontSize: "11px",
                  fontWeight: "700",
                }}
              >
                {manualTypeMode
                  ? "선택한 시공 종류"
                  : "AI 자동판정 시공 종류"}
              </div>

              <div
                style={{
                  marginTop: "2px",
                  color: "#5b21b6",
                  fontSize: "16px",
                  fontWeight: "900",
                }}
              >
                {selectedType?.label}
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={changeTargetType}
              style={{
                padding: "8px 11px",
                border: "1px solid #c4b5fd",
                borderRadius: "9px",
                background: "#ffffff",
                color: "#6d28d9",
                fontSize: "12px",
                fontWeight: "800",
                cursor: loading
                  ? "default"
                  : "pointer",
              }}
            >
              종류 변경
            </button>
          </div>

          {/* =================================================
              컬러 방식
          ================================================= */}

          <div
            style={{
              marginTop: "17px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <strong
                style={{
                  fontSize: "15px",
                }}
              >
                {targetType === "kitchen"
                  ? "싱크대 시공 부위"
                  : targetType === "door"
                    ? "문·문틀 시공 부위"
                    : `${selectedType?.label || "선택 부위"} 시공`}
              </strong>

              <span
                style={{
                  color: "#6b7280",
                  fontSize: "11px",
                }}
              >
                사진에 있는 부위만 적용
              </span>
            </div>

            {/* 싱크대 / 문·문틀만 여러 톤 버튼 표시 */}

            {supportsMultiTone ? (
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  padding: "4px",
                  borderRadius: "12px",
                  background: "#f3f4f6",
                }}
              >
                <ModeButton
                  active={
                    colorMode === "single"
                  }
                  onClick={() =>
                    selectColorMode("single")
                  }
                >
                  컬러 통일
                </ModeButton>

                <ModeButton
                  active={
                    colorMode === "multi"
                  }
                  onClick={() =>
                    selectColorMode("multi")
                  }
                >
                  여러 톤 사용
                </ModeButton>
              </div>
            ) : (
              <div
                style={{
                  padding: "11px 12px",
                  borderRadius: "11px",
                  background: "#f3f4f6",
                  color: "#374151",
                  fontSize: "13px",
                  fontWeight: "800",
                }}
              >
                컬러 통일
              </div>
            )}
          </div>

          {/* =================================================
              단일 컬러
          ================================================= */}

          {colorMode === "single" && (
            <div
              style={{
                display: "grid",
                gap: "7px",
                marginTop: "11px",
              }}
            >
              {targetAreas.map((area) => (
                <AreaRow
                  key={area.key}
                  area={area}
                  film={product}
                />
              ))}

              <div
                style={{
                  padding: "10px",
                  borderRadius: "9px",
                  background: "#f9fafb",
                  color: "#6b7280",
                  fontSize: "11px",
                  lineHeight: 1.5,
                }}
              >
                사진에 실제로 존재하는 시공 대상의 형태와
                구조는 그대로 유지하고 선택한 필름 색상만
                적용합니다.
              </div>
            </div>
          )}

          {/* =================================================
              여러 톤
              싱크대 / 문·문틀에서만 렌더링
          ================================================= */}

          {supportsMultiTone &&
            colorMode === "multi" && (
              <div
                style={{
                  marginTop: "11px",
                }}
              >
                {targetAreas.map((area) => {
                  const film =
                    localAreaFilms[
                      area.key
                    ] || product;

                  return (
                    <div
                      key={area.key}
                      style={{
                        marginBottom: "11px",
                        padding: "12px",
                        border:
                          "1px solid #e5e7eb",
                        borderRadius: "13px",
                        background: "#fafafa",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          gap: "8px",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "15px",
                          }}
                        >
                          {area.label}
                        </strong>

                        <span
                          style={{
                            maxWidth: "65%",
                            color: "#6d28d9",
                            fontSize: "12px",
                            fontWeight: "800",
                            whiteSpace:
                              "nowrap",
                            overflow:
                              "hidden",
                            textOverflow:
                              "ellipsis",
                          }}
                        >
                          {getFilmTitle(
                            film
                          )}
                        </span>
                      </div>

                      <FilmColorPicker
                        value={film}
                        onSelect={(
                          selectedFilm
                        ) =>
                          selectAreaFilm(
                            area.key,
                            selectedFilm ||
                              product
                          )
                        }
                      />
                    </div>
                  );
                })}

                <div
                  style={{
                    padding: "10px",
                    borderRadius: "9px",
                    background: "#f9fafb",
                    color: "#6b7280",
                    fontSize: "11px",
                    lineHeight: 1.5,
                  }}
                >
                  사진에 실제로 없는 부위는 새로 만들지
                  않고 자동으로 제외합니다.
                </div>
              </div>
            )}

          {/* =================================================
              가상시공 실행
          ================================================= */}

          <button
            type="button"
            disabled={
              loading ||
              !selectedImage
            }
            onClick={
              generateVirtualImage
            }
            style={{
              width: "100%",
              marginTop: "17px",
              padding: "15px",
              border: "none",
              borderRadius: "13px",
              background: loading
                ? "#9ca3af"
                : "#6b463c",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "900",
              cursor: loading
                ? "default"
                : "pointer",
            }}
          >
            {loading
              ? "가상 시공 중..."
              : `${
                  selectedType?.label ||
                  ""
                } 가상 시공하기`}
          </button>
        </>
      )}

      {/* =====================================================
          상태 메시지
      ===================================================== */}

      {message && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            borderRadius: "11px",
            background:
              message.startsWith("❌")
                ? "#fef2f2"
                : "#f9fafb",
            color:
              message.startsWith("❌")
                ? "#b91c1c"
                : "#374151",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>
      )}

      {/* =====================================================
          가상시공 결과
      ===================================================== */}

      {result && (
        <div
          style={{
            marginTop: "20px",
          }}
        >
          <div
            style={{
              marginBottom: "9px",
              fontSize: "17px",
              fontWeight: "900",
            }}
          >
            가상시공 결과
          </div>

          <div
            style={{
              padding: "10px",
              border: "1px solid #e5e7eb",
              borderRadius: "15px",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: "8px",
              }}
            >
              <div>
                <div
                  style={{
                    marginBottom: "5px",
                    fontSize: "12px",
                    fontWeight: "800",
                  }}
                >
                  원본
                </div>

                <img
                  src={getImagePreview(
                    result.image
                  )}
                  alt="원본"
                  style={{
                    display: "block",
                    width: "100%",
                    aspectRatio: "4 / 3",
                    objectFit: "cover",
                    borderRadius: "10px",
                  }}
                />
              </div>

              <div>
                <div
                  style={{
                    marginBottom: "5px",
                    fontSize: "12px",
                    fontWeight: "800",
                  }}
                >
                  가상시공
                </div>

                <img
                  src={result.imageUrl}
                  alt="가상시공 결과"
                  style={{
                    display: "block",
                    width: "100%",
                    aspectRatio: "4 / 3",
                    objectFit: "cover",
                    borderRadius: "10px",
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                downloadImage(
                  result.imageUrl,
                  `virtual-install-${Date.now()}.webp`
                )
              }
              style={{
                width: "100%",
                marginTop: "10px",
                padding: "12px",
                border:
                  "1px solid #d1d5db",
                borderRadius: "10px",
                background: "#ffffff",
                color: "#111827",
                fontSize: "14px",
                fontWeight: "800",
                cursor: "pointer",
              }}
            >
              결과 이미지 저장
            </button>
          </div>

          {onRequestDetail && (
            <button
              type="button"
              onClick={onRequestDetail}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "15px",
                border: "none",
                borderRadius: "12px",
                background: "#111827",
                color: "#ffffff",
                fontSize: "16px",
                fontWeight: "900",
                cursor: "pointer",
              }}
            >
              이 색상으로 상세견적 신청
            </button>
          )}
        </div>
      )}
    </section>
  );
      }
