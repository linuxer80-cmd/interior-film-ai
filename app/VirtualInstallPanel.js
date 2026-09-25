"use client";

import { useEffect, useMemo, useState } from "react";
import FilmColorPicker from "./FilmColorPicker";

const TARGET_TYPES = [
  {
    key: "kitchen",
    label: "싱크대·주방가구",
  },
  {
    key: "door",
    label: "문·문틀",
  },
  {
    key: "built_in",
    label: "붙박이장",
  },
  {
    key: "shoe_cabinet",
    label: "신발장",
  },
  {
    key: "fridge_cabinet",
    label: "냉장고장",
  },
  {
    key: "cabinet",
    label: "기타 장류",
  },
];

const AREA_DEFINITIONS = {
  kitchen: [
    {
      key: "kitchen_upper",
      label: "상부장",
      words: [
        "상부장",
        "상부수납장",
        "uppercabinet",
        "upper cabinet",
        "wallcabinet",
        "wall cabinet",
      ],
    },
    {
      key: "kitchen_lower",
      label: "하부장",
      words: [
        "하부장",
        "하부수납장",
        "lowercabinet",
        "lower cabinet",
        "basecabinet",
        "base cabinet",
      ],
    },
    {
      key: "fridge_cabinet",
      label: "냉장고장",
      words: [
        "냉장고장",
        "냉장고수납장",
        "fridgecabinet",
        "fridge cabinet",
        "refrigeratorcabinet",
        "refrigerator cabinet",
      ],
    },
    {
      key: "tall_cabinet",
      label: "키큰장",
      words: [
        "키큰장",
        "키높이장",
        "tallcabinet",
        "tall cabinet",
      ],
    },
    {
      key: "pantry_cabinet",
      label: "팬트리장",
      words: [
        "팬트리",
        "펜트리",
        "팬트리장",
        "펜트리장",
        "pantry",
        "pantrycabinet",
        "pantry cabinet",
      ],
    },
    {
      key: "island_cabinet",
      label: "아일랜드장",
      words: [
        "아일랜드",
        "아일랜드장",
        "island",
        "islandcabinet",
        "island cabinet",
      ],
    },
  ],

  door: [
    {
      key: "door_leaf",
      label: "문짝",
      words: [
        "문짝",
        "방문",
        "방화문",
        "중문",
        "현관문",
        "도어",
        "doorleaf",
        "door leaf",
        "door",
      ],
    },
    {
      key: "door_frame",
      label: "문틀",
      words: [
        "문틀",
        "도어프레임",
        "도어 프레임",
        "doorframe",
        "door frame",
      ],
    },
  ],

  built_in: [
    {
      key: "built_in",
      label: "붙박이장",
      words: [
        "붙박이장",
        "붙박이",
        "built-in",
        "builtin",
        "wardrobe",
      ],
    },
  ],

  shoe_cabinet: [
    {
      key: "shoe_cabinet",
      label: "신발장",
      words: [
        "신발장",
        "신발수납장",
        "shoecabinet",
        "shoe cabinet",
      ],
    },
  ],

  fridge_cabinet: [
    {
      key: "fridge_cabinet",
      label: "냉장고장",
      words: [
        "냉장고장",
        "냉장고수납장",
        "fridgecabinet",
        "fridge cabinet",
      ],
    },
  ],

  cabinet: [
    {
      key: "cabinet",
      label: "수납장",
      words: [
        "수납장",
        "장식장",
        "거실장",
        "서랍장",
        "옷장",
        "책장",
        "cabinet",
        "storagecabinet",
        "storage cabinet",
        "closet",
      ],
    },
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

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "";
  }
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

    safeJson(photo?.analysis),
  ]
    .filter(Boolean)
    .join(" ");
}

function detectTypeFromText(text) {
  if (!text) {
    return "";
  }

  /*
   * 붙박이장
   */
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

  /*
   * 신발장
   */
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

  /*
   * 싱크대/주방가구
   *
   * 냉장고장보다 먼저 판정합니다.
   * 상부장/하부장과 냉장고장이 같이 있는 주방 사진이
   * 냉장고장 단독으로 잘못 분류되는 것을 막습니다.
   */
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
      "basecabinet",
    ])
  ) {
    return "kitchen";
  }

  /*
   * 냉장고장 단독
   */
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

  /*
   * 문/문틀
   */
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

  if (
    includesAny(text, [
      "문짝",
      "도어",
      "door",
    ])
  ) {
    return "door";
  }

  /*
   * 기타 장류
   */
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

function getMatchedAnalysisForImage(
  image,
  imageIndex,
  images,
  groups
) {
  const imageValues =
    getIdentityValues(image);

  const entries = [];

  (Array.isArray(groups)
    ? groups
    : []
  ).forEach((group) => {
    const photos =
      Array.isArray(group?.photos)
        ? group.photos
        : [];

    photos.forEach((photo) => {
      entries.push({
        photo,
        group,
      });
    });
  });

  let matchedEntries =
    entries.filter(({ photo }) => {
      const photoValues =
        getIdentityValues(photo);

      return imageValues.some((value) =>
        photoValues.includes(value)
      );
    });

  /*
   * 이미지 ID 매칭이 안 되지만
   * 이미지 개수와 분석결과 개수가 같은 경우
   * 순서 기준으로 보조 매칭
   */
  if (
    !matchedEntries.length &&
    entries.length === images.length &&
    entries[imageIndex]
  ) {
    matchedEntries = [
      entries[imageIndex],
    ];
  }

  const photoText = [
    getAnalysisText(
      image,
      null
    ),

    ...matchedEntries.map(
      ({ photo }) =>
        getAnalysisText(
          photo,
          null
        )
    ),
  ]
    .filter(Boolean)
    .join(" ");

  const groupText =
    matchedEntries
      .map(({ group }) =>
        getAnalysisText(
          null,
          group
        )
      )
      .filter(Boolean)
      .join(" ");

  const priorityText = [
    image?.category,
    image?.subCategory,
    image?.sub_category,

    ...matchedEntries.flatMap(
      ({ photo }) => [
        photo?.category,
        photo?.subCategory,
        photo?.sub_category,
        photo?.analysis?.category,
        photo?.analysis?.subCategory,
        photo?.analysis?.sub_category,
      ]
    ),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    matchedEntries,
    photoText,
    groupText,
    priorityText,

    allText: [
      photoText,
      groupText,
      priorityText,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function detectTargetTypeForImage(
  image,
  imageIndex,
  images,
  groups
) {
  const analysis =
    getMatchedAnalysisForImage(
      image,
      imageIndex,
      images,
      groups
    );

  /*
   * 사진 자체 AI 분석을 우선
   */
  const photoType =
    detectTypeFromText(
      analysis.photoText
    );

  if (photoType) {
    return photoType;
  }

  /*
   * 그룹 분석을 다음으로 사용
   */
  const groupType =
    detectTypeFromText(
      analysis.groupText
    );

  if (groupType) {
    return groupType;
  }

  /*
   * category / subCategory를 마지막으로 사용
   */
  return detectTypeFromText(
    analysis.priorityText
  );
}

function detectTargetAreasForImage(
  targetType,
  image,
  imageIndex,
  images,
  groups
) {
  if (
    !targetType ||
    !image
  ) {
    return [];
  }

  const definitions =
    AREA_DEFINITIONS[
      targetType
    ] || [];

  if (
    !definitions.length
  ) {
    return [];
  }

  const analysis =
    getMatchedAnalysisForImage(
      image,
      imageIndex,
      images,
      groups
    );

  const text =
    analysis.allText;

  /*
   * 핵심:
   * TARGET_AREAS 전체를 보여주는 게 아니라
   * AI 분석 텍스트에 실제 등장한 부위만 추출합니다.
   */
  const detected =
    definitions.filter(
      (area) =>
        includesAny(
          text,
          area.words || []
        )
    );

  if (
    detected.length
  ) {
    return detected.map(
      ({
        key,
        label,
      }) => ({
        key,
        label,
      })
    );
  }

  /*
   * AI가 종류는 싱크대로 인식했지만
   * 세부 부위까지 명확히 말하지 않은 경우
   * 임의로 상부장/하부장 등을 생성하지 않고
   * 싱크대 전체 하나로 처리합니다.
   */
  if (
    targetType ===
    "kitchen"
  ) {
    return [
      {
        key: "kitchen_all",
        label:
          "싱크대·주방가구",
      },
    ];
  }

  /*
   * 문도 동일합니다.
   */
  if (
    targetType ===
    "door"
  ) {
    return [
      {
        key: "door_all",
        label: "문·문틀",
      },
    ];
  }

  /*
   * 붙박이장/신발장 등 단일 구조
   */
  return definitions
    .slice(0, 1)
    .map(
      ({
        key,
        label,
      }) => ({
        key,
        label,
      })
    );
}

function makeFilmPayload(
  area,
  film
) {
  return {
    areaKey:
      area?.key || "",

    areaLabel:
      area?.label || "",

    brand:
      film?.brand || "",

    productCode:
      film?.product_code ||
      "",

    productName:
      film?.product_name ||
      "",

    texture:
      film?.texture || "",

    colorFamily:
      film?.color_family ||
      "",

    colorDescription:
      film?.color_description ||
      "",

    colorHex:
      film?.color_hex || "",

    sampleImageUrl:
      film?.sample_image_path ||
      "",
  };
}

function downloadImage(
  imageUrl,
  fileName
) {
  if (!imageUrl) {
    return;
  }

  const link =
    document.createElement(
      "a"
    );

  link.href =
    imageUrl;

  link.download =
    fileName ||
    "virtual-install.webp";

  document.body.appendChild(
    link
  );

  link.click();
  link.remove();
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
        padding:
          "10px 8px",
        border: "none",
        borderRadius:
          "9px",

        background:
          active
            ? "#6d28d9"
            : "transparent",

        color:
          active
            ? "#ffffff"
            : "#4b5563",

        fontSize:
          "13px",

        fontWeight:
          "900",

        cursor:
          "pointer",
      }}
    >
      {children}
    </button>
  );
}

function AreaRow({
  area,
  film,
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems:
          "center",
        justifyContent:
          "space-between",
        gap: "10px",
        padding: "12px",
        border:
          "1px solid #e5e7eb",
        borderRadius:
          "11px",
        background:
          "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          gap: "9px",
          minWidth: 0,
        }}
      >
        <span
          style={{
            width:
              "28px",
            height:
              "28px",
            flex:
              "0 0 28px",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            borderRadius:
              "8px",
            background:
              "#ede9fe",
            color:
              "#6d28d9",
            fontSize:
              "14px",
            fontWeight:
              "900",
          }}
        >
          ✓
        </span>

        <strong
          style={{
            fontSize:
              "14px",
            whiteSpace:
              "nowrap",
          }}
        >
          {area.label}
        </strong>
      </div>

      <div
        style={{
          minWidth: 0,
          color:
            "#6d28d9",
          fontSize:
            "12px",
          fontWeight:
            "800",
          whiteSpace:
            "nowrap",
          overflow:
            "hidden",
          textOverflow:
            "ellipsis",
          textAlign:
            "right",
        }}
      >
        {getFilmTitle(
          film
        )}
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
  companySlug = "",
}) {
  const [
    selectedImageId,
    setSelectedImageId,
  ] = useState("");

  const [
    targetType,
    setTargetType,
  ] = useState("");

  const [
    colorMode,
    setColorMode,
  ] = useState(
    useSplitTone
      ? "multi"
      : "single"
  );

  const [
    localAreaFilms,
    setLocalAreaFilms,
  ] = useState(
    areaFilms || {}
  );

  const [
    result,
    setResult,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  /*
   * 사진 기본 선택
   */
  useEffect(() => {
    if (
      !images.length
    ) {
      setSelectedImageId(
        ""
      );

      setTargetType(
        ""
      );

      setResult(null);

      return;
    }

    const selectedExists =
      images.some(
        (
          image,
          index
        ) =>
          getImageId(
            image,
            index
          ) ===
          selectedImageId
      );

    if (
      !selectedExists
    ) {
      setSelectedImageId(
        getImageId(
          images[0],
          0
        )
      );
    }
  }, [
    images,
    selectedImageId,
  ]);

  useEffect(() => {
    setLocalAreaFilms(
      areaFilms || {}
    );
  }, [
    areaFilms,
  ]);

  useEffect(() => {
    setColorMode(
      useSplitTone
        ? "multi"
        : "single"
    );
  }, [
    useSplitTone,
  ]);

  const selectedImage =
    useMemo(() => {
      return (
        images.find(
          (
            image,
            index
          ) =>
            getImageId(
              image,
              index
            ) ===
            selectedImageId
        ) || null
      );
    }, [
      images,
      selectedImageId,
    ]);

  const selectedImageIndex =
    useMemo(() => {
      return images.findIndex(
        (
          image,
          index
        ) =>
          getImageId(
            image,
            index
          ) ===
          selectedImageId
      );
    }, [
      images,
      selectedImageId,
    ]);

  const detectedTargetType =
    useMemo(() => {
      if (
        !selectedImage
      ) {
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
   * 사용자가 시공 종류를 바꾸는 로직은 없습니다.
   *
   * 항상 AI 판정 결과만 사용합니다.
   */
  useEffect(() => {
    if (
      !selectedImage
    ) {
      setTargetType(
        ""
      );

      return;
    }

    setTargetType(
      detectedTargetType ||
        ""
    );

    setColorMode(
      "single"
    );

    setLocalAreaFilms(
      {}
    );

    setResult(null);
    setMessage("");

    onUseSplitToneChange?.(
      false
    );

    onAreaFilmsChange?.(
      {}
    );
  }, [
    selectedImageId,
    detectedTargetType,
    onUseSplitToneChange,
    onAreaFilmsChange,
  ]);

  const selectedType =
    useMemo(() => {
      return (
        TARGET_TYPES.find(
          (item) =>
            item.key ===
            targetType
        ) || null
      );
    }, [
      targetType,
    ]);

  /*
   * AI가 실제로 인식한 부위만 계산
   */
  const targetAreas =
    useMemo(() => {
      if (
        !selectedImage ||
        !targetType
      ) {
        return [];
      }

      return detectTargetAreasForImage(
        targetType,
        selectedImage,
        selectedImageIndex,
        images,
        groups
      );
    }, [
      targetType,
      selectedImage,
      selectedImageIndex,
      images,
      groups,
    ]);

  /*
   * 실제로 AI가 2개 이상 부위를 인식했을 때만
   * 여러 톤 사용 가능
   */
  const supportsMultiTone =
    useMemo(() => {
      return (
        (
          targetType ===
            "kitchen" ||
          targetType ===
            "door"
        ) &&
        targetAreas.length >
          1
      );
    }, [
      targetType,
      targetAreas.length,
    ]);

  useEffect(() => {
    if (
      supportsMultiTone ||
      colorMode !==
        "multi"
    ) {
      return;
    }

    setColorMode(
      "single"
    );

    setLocalAreaFilms(
      {}
    );

    onUseSplitToneChange?.(
      false
    );

    onAreaFilmsChange?.(
      {}
    );
  }, [
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

  /*
   * 여러 톤 모드로 들어가면
   * AI가 인식한 부위에만 기본 필름 설정
   */
  useEffect(() => {
    if (
      colorMode !==
        "multi" ||
      !supportsMultiTone ||
      !product ||
      !targetAreas.length
    ) {
      return;
    }

    setLocalAreaFilms(
      (previous) => {
        const next = {
          ...previous,
        };

        targetAreas.forEach(
          (area) => {
            if (
              !next[
                area.key
              ]
            ) {
              next[
                area.key
              ] = product;
            }
          }
        );

        onAreaFilmsChange?.(
          next
        );

        return next;
      }
    );
  }, [
    colorMode,
    supportsMultiTone,
    product,
    targetAreas,
    onAreaFilmsChange,
  ]);

  function selectImage(
    imageId
  ) {
    if (loading) {
      return;
    }

    setSelectedImageId(
      imageId
    );

    setTargetType(
      ""
    );

    setColorMode(
      "single"
    );

    setLocalAreaFilms(
      {}
    );

    setResult(null);
    setMessage("");

    onUseSplitToneChange?.(
      false
    );

    onAreaFilmsChange?.(
      {}
    );
  }

  function selectColorMode(
    mode
  ) {
    if (loading) {
      return;
    }

    if (
      mode === "multi" &&
      !supportsMultiTone
    ) {
      return;
    }

    setColorMode(
      mode
    );

    setResult(null);
    setMessage("");

    if (
      mode === "single"
    ) {
      setLocalAreaFilms(
        {}
      );

      onAreaFilmsChange?.(
        {}
      );
    }

    onUseSplitToneChange?.(
      mode === "multi"
    );
  }

  function selectAreaFilm(
    areaKey,
    film
  ) {
    if (
      !supportsMultiTone
    ) {
      return;
    }

    const next = {
      ...localAreaFilms,

      [areaKey]:
        film ||
        product,
    };

    setLocalAreaFilms(
      next
    );

    onAreaFilmsChange?.(
      next
    );
            }
    function makeRequestForm() {
    const formData =
      new FormData();

    formData.append(
      "company_slug",
      companySlug || ""
    );

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
      product?.product_code ||
        ""
    );

    formData.append(
      "productName",
      product?.product_name ||
        ""
    );

    formData.append(
      "texture",
      product?.texture ||
        ""
    );

    formData.append(
      "colorFamily",
      product?.color_family ||
        ""
    );

    formData.append(
      "colorDescription",
      product?.color_description ||
        ""
    );

    formData.append(
      "colorHex",
      product?.color_hex ||
        ""
    );

    formData.append(
      "sampleImageUrl",
      product?.sample_image_path ||
        ""
    );

    const multiTone =
      supportsMultiTone &&
      colorMode ===
        "multi";

    formData.append(
      "useSplitTone",
      multiTone
        ? "true"
        : "false"
    );

    /*
     * 중요:
     * AI가 실제로 인식한 targetAreas만
     * API로 전달합니다.
     */
    const films =
      targetAreas.map(
        (area) =>
          makeFilmPayload(
            area,

            multiTone
              ? localAreaFilms[
                  area.key
                ] ||
                  product
              : product
          )
      );

    formData.append(
      "areaFilms",
      JSON.stringify(
        films
      )
    );

    formData.append(
      "targetLabel",
      selectedType?.label ||
        ""
    );

    return formData;
  }

  async function generateVirtualImage() {
    if (loading) {
      return;
    }

    if (
      !selectedImage
    ) {
      setMessage(
        "❌ 가상시공할 사진을 선택해주세요."
      );

      return;
    }

    if (
      !targetType
    ) {
      setMessage(
        "❌ AI가 이 사진의 시공 종류를 확인하지 못했습니다. 다른 사진으로 다시 시도해주세요."
      );

      return;
    }

    if (
      !targetAreas.length
    ) {
      setMessage(
        "❌ AI가 가상시공할 부위를 확인하지 못했습니다. 다른 사진으로 다시 시도해주세요."
      );

      return;
    }

    if (!product) {
      setMessage(
        "❌ 먼저 기본 필름을 선택해주세요."
      );

      return;
    }

    if (
      !companySlug
    ) {
      setMessage(
        "❌ 업체 정보를 확인할 수 없습니다. 업체 페이지에서 다시 시도해주세요."
      );

      return;
    }

    if (
      supportsMultiTone &&
      colorMode ===
        "multi"
    ) {
      const missingArea =
        targetAreas.find(
          (area) =>
            !localAreaFilms[
              area.key
            ]
        );

      if (
        missingArea
      ) {
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
      const response =
        await fetch(
          "/api/virtual-install",
          {
            method:
              "POST",

            body:
              makeRequestForm(),
          }
        );

      const data =
        await response
          .json()
          .catch(
            () => ({})
          );

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
        image:
          selectedImage,

        imageUrl:
          data.imageUrl,
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
    !Array.isArray(
      images
    ) ||
    !images.length ||
    !product
  ) {
    return null;
  }

  return (
    <section
      style={{
        marginTop:
          "14px",

        padding:
          "15px",

        border:
          "1px solid #e5e7eb",

        borderRadius:
          "18px",

        background:
          "#ffffff",
      }}
    >
      <div
        style={{
          fontSize:
            "19px",

          fontWeight:
            "900",

          color:
            "#111827",
        }}
      >
        가상 시공
      </div>

      <div
        style={{
          marginTop:
            "4px",

          color:
            "#6b7280",

          fontSize:
            "12px",

          lineHeight:
            1.55,
        }}
      >
        AI가 사진에서 확인한 시공 종류와 부위만 가상시공에 사용합니다.
      </div>

      {/* ===================================================
          기본 선택 필름
      =================================================== */}

      <div
        style={{
          marginTop:
            "13px",

          padding:
            "12px",

          borderRadius:
            "12px",

          background:
            "#f3f4f6",
        }}
      >
        <div
          style={{
            color:
              "#6b7280",

            fontSize:
              "11px",

            fontWeight:
              "700",
          }}
        >
          기본 선택 필름
        </div>

        <div
          style={{
            marginTop:
              "3px",

            color:
              "#111827",

            fontSize:
              "16px",

            fontWeight:
              "900",
          }}
        >
          {getFilmTitle(
            product
          )}
        </div>

        <div
          style={{
            marginTop:
              "2px",

            color:
              "#6b7280",

            fontSize:
              "12px",
          }}
        >
          {getFilmDescription(
            product
          )}
        </div>
      </div>

      {/* ===================================================
          사진 선택
      =================================================== */}

      <div
        style={{
          marginTop:
            "18px",
        }}
      >
        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "space-between",

            gap:
              "8px",
          }}
        >
          <strong
            style={{
              fontSize:
                "15px",
            }}
          >
            1. 가상시공할 사진
          </strong>

          <span
            style={{
              color:
                "#6d28d9",

              fontSize:
                "11px",

              fontWeight:
                "800",
            }}
          >
            한 장만 선택
          </span>
        </div>

        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",

            gap:
              "9px",

            marginTop:
              "9px",
          }}
        >
          {images.map(
            (
              image,
              index
            ) => {
              const imageId =
                getImageId(
                  image,
                  index
                );

              const active =
                selectedImageId ===
                imageId;

              return (
                <button
                  key={
                    imageId
                  }
                  type="button"
                  disabled={
                    loading
                  }
                  onClick={() =>
                    selectImage(
                      imageId
                    )
                  }
                  style={{
                    position:
                      "relative",

                    minWidth:
                      0,

                    padding:
                      "4px",

                    border:
                      active
                        ? "3px solid #6d28d9"
                        : "1px solid #d1d5db",

                    borderRadius:
                      "13px",

                    background:
                      "#ffffff",

                    cursor:
                      loading
                        ? "default"
                        : "pointer",

                    touchAction:
                      "manipulation",
                  }}
                >
                  <img
                    src={getImagePreview(
                      image
                    )}
                    alt={`사진 ${
                      index +
                      1
                    }`}
                    style={{
                      display:
                        "block",

                      width:
                        "100%",

                      aspectRatio:
                        "4 / 3",

                      objectFit:
                        "cover",

                      borderRadius:
                        "9px",
                    }}
                  />

                  <span
                    style={{
                      position:
                        "absolute",

                      top:
                        "8px",

                      right:
                        "8px",

                      width:
                        "30px",

                      height:
                        "30px",

                      display:
                        "flex",

                      alignItems:
                        "center",

                      justifyContent:
                        "center",

                      borderRadius:
                        "50%",

                      background:
                        active
                          ? "#6d28d9"
                          : "rgba(17,24,39,0.55)",

                      color:
                        "#ffffff",

                      fontSize:
                        "17px",

                      fontWeight:
                        "900",
                    }}
                  >
                    {active
                      ? "✓"
                      : ""}
                  </span>

                  <span
                    style={{
                      display:
                        "block",

                      padding:
                        "6px 3px 3px",

                      color:
                        "#111827",

                      fontSize:
                        "12px",

                      fontWeight:
                        "800",
                    }}
                  >
                    사진{" "}
                    {index +
                      1}
                  </span>
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* ===================================================
          AI 인식 실패
      =================================================== */}

      {!targetType && (
        <div
          style={{
            marginTop:
              "19px",

            padding:
              "13px",

            borderRadius:
              "12px",

            background:
              "#fff7ed",

            border:
              "1px solid #fed7aa",
          }}
        >
          <strong
            style={{
              display:
                "block",

              color:
                "#9a3412",

              fontSize:
                "14px",
            }}
          >
            AI가 시공 종류를 확인하지 못했습니다.
          </strong>

          <div
            style={{
              marginTop:
                "5px",

              color:
                "#9a3412",

              fontSize:
                "11px",

              lineHeight:
                1.5,
            }}
          >
            시공 종류를 임의로 지정하지 않습니다. 시공할 부위가 더 잘 보이는 다른 사진으로 다시 분석해주세요.
          </div>
        </div>
      )}

      {/* ===================================================
          AI 인식 성공
      =================================================== */}

      {targetType && (
        <>
          <div
            style={{
              marginTop:
                "19px",

              padding:
                "12px",

              borderRadius:
                "12px",

              background:
                "#f5f3ff",
            }}
          >
            <div
              style={{
                color:
                  "#6b7280",

                fontSize:
                  "11px",

                fontWeight:
                  "700",
              }}
            >
              AI 자동판정 시공 종류
            </div>

            <div
              style={{
                marginTop:
                  "2px",

                color:
                  "#5b21b6",

                fontSize:
                  "16px",

                fontWeight:
                  "900",
              }}
            >
              {selectedType?.label}
            </div>
          </div>

          {/* ===============================================
              AI가 실제로 찾은 부위
          =============================================== */}

          <div
            style={{
              marginTop:
                "17px",
            }}
          >
            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "space-between",

                gap:
                  "8px",

                marginBottom:
                  "8px",
              }}
            >
              <strong
                style={{
                  fontSize:
                    "15px",
                }}
              >
                AI가 인식한 시공 부위
              </strong>

              <span
                style={{
                  color:
                    "#6b7280",

                  fontSize:
                    "11px",
                }}
              >
                자동 적용
              </span>
            </div>

            <div
              style={{
                display:
                  "grid",

                gap:
                  "7px",
              }}
            >
              {targetAreas.map(
                (area) => (
                  <AreaRow
                    key={
                      area.key
                    }
                    area={
                      area
                    }
                    film={
                      colorMode ===
                      "multi"
                        ? localAreaFilms[
                            area
                              .key
                          ] ||
                          product
                        : product
                    }
                  />
                )
              )}
            </div>
          </div>

          {/* ===============================================
              컬러 통일 / 여러 톤
          =============================================== */}

          {supportsMultiTone && (
            <div
              style={{
                marginTop:
                  "17px",
              }}
            >
              <strong
                style={{
                  display:
                    "block",

                  marginBottom:
                    "8px",

                  fontSize:
                    "15px",
                }}
              >
                컬러 적용
              </strong>

              <div
                style={{
                  display:
                    "flex",

                  gap:
                    "4px",

                  padding:
                    "4px",

                  borderRadius:
                    "12px",

                  background:
                    "#f3f4f6",
                }}
              >
                <ModeButton
                  active={
                    colorMode ===
                    "single"
                  }
                  onClick={() =>
                    selectColorMode(
                      "single"
                    )
                  }
                >
                  컬러 통일
                </ModeButton>

                <ModeButton
                  active={
                    colorMode ===
                    "multi"
                  }
                  onClick={() =>
                    selectColorMode(
                      "multi"
                    )
                  }
                >
                  여러 톤 사용
                </ModeButton>
              </div>
            </div>
          )}

          {!supportsMultiTone && (
            <div
              style={{
                marginTop:
                  "14px",

                padding:
                  "11px 12px",

                borderRadius:
                  "11px",

                background:
                  "#f3f4f6",

                color:
                  "#4b5563",

                fontSize:
                  "12px",

                fontWeight:
                  "800",
              }}
            >
              AI가 인식한 부위에 한 가지 컬러로 적용합니다.
            </div>
          )}

          {/* ===============================================
              여러 톤이면 AI 인식 부위만 각각 필름 선택
          =============================================== */}

          {supportsMultiTone &&
            colorMode ===
              "multi" && (
              <div
                style={{
                  marginTop:
                    "11px",
                }}
              >
                {targetAreas.map(
                  (area) => {
                    const film =
                      localAreaFilms[
                        area
                          .key
                      ] ||
                      product;

                    return (
                      <div
                        key={
                          area.key
                        }
                        style={{
                          marginBottom:
                            "11px",

                          padding:
                            "12px",

                          border:
                            "1px solid #e5e7eb",

                          borderRadius:
                            "13px",

                          background:
                            "#fafafa",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",

                            alignItems:
                              "center",

                            justifyContent:
                              "space-between",

                            gap:
                              "8px",
                          }}
                        >
                          <strong
                            style={{
                              fontSize:
                                "15px",
                            }}
                          >
                            {
                              area.label
                            }
                          </strong>

                          <span
                            style={{
                              maxWidth:
                                "65%",

                              color:
                                "#6d28d9",

                              fontSize:
                                "12px",

                              fontWeight:
                                "800",

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
                          value={
                            film
                          }
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
                  }
                )}
              </div>
            )}

          <div
            style={{
              marginTop:
                "11px",

              padding:
                "10px",

              borderRadius:
                "9px",

              background:
                "#f9fafb",

              color:
                "#6b7280",

              fontSize:
                "11px",

              lineHeight:
                1.5,
            }}
          >
            AI가 사진에서 인식한 시공 부위만 사용합니다. 고객이 시공 종류나 부위를 임의로 추가하거나 변경할 수 없습니다.
          </div>

          {/* ===============================================
              실행
          =============================================== */}

          <button
            type="button"
            disabled={
              loading ||
              !selectedImage ||
              !targetAreas.length
            }
            onClick={
              generateVirtualImage
            }
            style={{
              width:
                "100%",

              marginTop:
                "17px",

              padding:
                "15px",

              border:
                "none",

              borderRadius:
                "13px",

              background:
                loading
                  ? "#9ca3af"
                  : "#6b463c",

              color:
                "#ffffff",

              fontSize:
                "16px",

              fontWeight:
                "900",

              cursor:
                loading
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

      {/* ===================================================
          메시지
      =================================================== */}

      {message && (
        <div
          style={{
            marginTop:
              "12px",

            padding:
              "12px",

            borderRadius:
              "11px",

            background:
              message.startsWith(
                "❌"
              )
                ? "#fef2f2"
                : "#f9fafb",

            color:
              message.startsWith(
                "❌"
              )
                ? "#b91c1c"
                : "#374151",

            fontSize:
              "13px",

            lineHeight:
              1.5,
          }}
        >
          {message}
        </div>
      )}

      {/* ===================================================
          결과
      =================================================== */}

      {result && (
        <div
          style={{
            marginTop:
              "20px",
          }}
        >
          <div
            style={{
              marginBottom:
                "9px",

              fontSize:
                "17px",

              fontWeight:
                "900",
            }}
          >
            가상시공 결과
          </div>

          <div
            style={{
              padding:
                "10px",

              border:
                "1px solid #e5e7eb",

              borderRadius:
                "15px",

              background:
                "#ffffff",
            }}
          >
            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",

                gap:
                  "8px",
              }}
            >
              <div>
                <div
                  style={{
                    marginBottom:
                      "5px",

                    fontSize:
                      "12px",

                    fontWeight:
                      "800",
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
                    display:
                      "block",

                    width:
                      "100%",

                    aspectRatio:
                      "4 / 3",

                    objectFit:
                      "cover",

                    borderRadius:
                      "10px",
                  }}
                />
              </div>

              <div>
                <div
                  style={{
                    marginBottom:
                      "5px",

                    fontSize:
                      "12px",

                    fontWeight:
                      "800",
                  }}
                >
                  가상시공
                </div>

                <img
                  src={
                    result.imageUrl
                  }
                  alt="가상시공 결과"
                  style={{
                    display:
                      "block",

                    width:
                      "100%",

                    aspectRatio:
                      "4 / 3",

                    objectFit:
                      "cover",

                    borderRadius:
                      "10px",
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
                width:
                  "100%",

                marginTop:
                  "10px",

                padding:
                  "12px",

                border:
                  "1px solid #d1d5db",

                borderRadius:
                  "10px",

                background:
                  "#ffffff",

                color:
                  "#111827",

                fontSize:
                  "14px",

                fontWeight:
                  "800",

                cursor:
                  "pointer",
              }}
            >
              결과 이미지 저장
            </button>
          </div>

          {onRequestDetail && (
            <button
              type="button"
              onClick={
                onRequestDetail
              }
              style={{
                width:
                  "100%",

                marginTop:
                  "12px",

                padding:
                  "15px",

                border:
                  "none",

                borderRadius:
                  "12px",

                background:
                  "#111827",

                color:
                  "#ffffff",

                fontSize:
                  "16px",

                fontWeight:
                  "900",

                cursor:
                  "pointer",
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
