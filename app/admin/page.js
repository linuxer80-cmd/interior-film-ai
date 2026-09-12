"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);

  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");

  const [similarityThreshold, setSimilarityThreshold] =
    useState(0.65);

  const [settingMessage, setSettingMessage] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [settingLoading, setSettingLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const { data, error } = await supabase
      .from("app_settings")
      .select("similarity_threshold")
      .eq("id", 1)
      .single();

    if (error) {
      console.error(error);

      setSettingMessage(
        "⚠️ 현재 유사도 설정을 불러오지 못했습니다."
      );

      return;
    }

    if (data?.similarity_threshold != null) {
      setSimilarityThreshold(
        Number(data.similarity_threshold)
      );
    }
  }

  async function saveSimilaritySetting() {
    setSettingLoading(true);
    setSettingMessage("저장 중...");

    try {
      const { error } = await supabase
        .from("app_settings")
        .update({
          similarity_threshold: similarityThreshold,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) {
        throw error;
      }

      setSettingMessage(
        `✅ 유사도 기준을 ${Math.round(
          similarityThreshold * 100
        )}%로 저장했습니다.`
      );
    } catch (error) {
      console.error(error);

      setSettingMessage(
        `❌ 오류: ${
          error?.message ||
          "유사도 기준 저장에 실패했습니다."
        }`
      );
    } finally {
      setSettingLoading(false);
    }
  }

  // ======================================================
  // 같은 이미지인지 확인하기 위한 SHA-256 해시 생성
  // 파일명이 달라도 파일 내용이 완전히 같으면 같은 값이 나옵니다.
  // ======================================================

  async function getImageHash(file) {
    const buffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      buffer
    );

    const hashArray = Array.from(
      new Uint8Array(hashBuffer)
    );

    return hashArray
      .map((byte) =>
        byte.toString(16).padStart(2, "0")
      )
      .join("");
  }

  // ======================================================
  // 선택된 사진 안의 중복 + 시공전/시공후 사이 중복 검사
  // ======================================================

  async function removeDuplicateImages(
    newFiles,
    otherFiles = []
  ) {
    const otherHashes = new Set();

    for (const file of otherFiles) {
      const hash = await getImageHash(file);
      otherHashes.add(hash);
    }

    const selectedHashes = new Set();
    const uniqueFiles = [];

    let duplicateCount = 0;

    for (const file of newFiles) {
      const hash = await getImageHash(file);

      if (
        selectedHashes.has(hash) ||
        otherHashes.has(hash)
      ) {
        duplicateCount++;
        continue;
      }

      selectedHashes.add(hash);
      uniqueFiles.push(file);
    }

    return {
      uniqueFiles,
      duplicateCount,
    };
  }

  // ======================================================
  // AI 분석용 이미지 축소
  // ======================================================

  async function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      const objectUrl =
        URL.createObjectURL(file);

      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

          const maxSize = 1600;

          if (
            width > maxSize ||
            height > maxSize
          ) {
            if (width >= height) {
              height = Math.round(
                (height * maxSize) / width
              );

              width = maxSize;
            } else {
              width = Math.round(
                (width * maxSize) / height
              );

              height = maxSize;
            }
          }

          const canvas =
            document.createElement("canvas");

          canvas.width = width;
          canvas.height = height;

          const ctx =
            canvas.getContext("2d");

          if (!ctx) {
            URL.revokeObjectURL(objectUrl);

            reject(
              new Error(
                "이미지 처리에 실패했습니다."
              )
            );

            return;
          }

          ctx.drawImage(
            img,
            0,
            0,
            width,
            height
          );

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);

              if (!blob) {
                reject(
                  new Error(
                    "AI 분석용 이미지 변환에 실패했습니다."
                  )
                );

                return;
              }

              resolve(
                new File(
                  [blob],
                  "ai-analysis.jpg",
                  {
                    type: "image/jpeg",
                  }
                )
              );
            },
            "image/jpeg",
            0.8
          );
        } catch (error) {
          URL.revokeObjectURL(objectUrl);

          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);

        reject(
          new Error(
            "사진을 불러올 수 없습니다."
          )
        );
      };

      img.src = objectUrl;
    });
  }

  async function readJsonSafely(response) {
    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        text
          ? `서버 응답 오류: ${text.slice(
              0,
              200
            )}`
          : "서버에서 올바른 응답을 받지 못했습니다."
      );
    }
  }

  // ======================================================
  // AI 사진 분석
  // ======================================================

  async function analyzeImage(file) {
    const resizedImage =
      await resizeImage(file);

    const formData = new FormData();

    formData.append(
      "image",
      resizedImage
    );

    const response = await fetch(
      "/api/analyze",
      {
        method: "POST",
        body: formData,
      }
    );

    const result =
      await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(
        result?.error ||
          "AI 사진 분석에 실패했습니다."
      );
    }

    if (!result?.analysis) {
      throw new Error(
        "AI 분석 결과가 없습니다."
      );
    }

    return result.analysis;
  }

  // ======================================================
  // 검색용 임베딩 생성
  // ======================================================

  async function createEmbedding(text) {
    const response = await fetch(
      "/api/embedding",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          text,
        }),
      }
    );

    const result =
      await readJsonSafely(response);

    if (
      !response.ok ||
      !result?.embedding
    ) {
      throw new Error(
        result?.error ||
          "임베딩 생성에 실패했습니다."
      );
    }

    return result.embedding;
  }

  // ======================================================
  // 개별 사진 저장
  // ======================================================

  async function savePhoto({
    image,
    index,
    total,
    photoType,
    workItemId,
    projectId,
  }) {
    const typeLabel =
      photoType === "before"
        ? "시공 전"
        : "시공 후";

    setMessage(
      `${typeLabel} 사진 ${
        index + 1
      }/${total} AI 분석 중...`
    );

    const aiAnalysis =
      await analyzeImage(image);

    let tags = Array.isArray(
      aiAnalysis?.tags
    )
      ? [...aiAnalysis.tags]
      : [];

    if (material.trim()) {
      tags.push(material.trim());
    }

    tags.push(
      photoType === "before"
        ? "시공전"
        : "시공후"
    );

    tags = [...new Set(tags)];

    const searchText = [
      `시공 부위: ${category.trim()}`,

      `세부 부위: ${
        aiAnalysis?.sub_category ||
        category.trim()
      }`,

      `사진 상태: ${
        photoType === "before"
          ? "시공 전"
          : "시공 후"
      }`,

      `사진 설명: ${
        aiAnalysis?.description || ""
      }`,

      `특징: ${tags.join(", ")}`,

      material.trim()
        ? `사용 자재: ${material.trim()}`
        : "",

      memo.trim()
        ? `시공 메모: ${memo.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    setMessage(
      `${typeLabel} 사진 ${
        index + 1
      }/${total} 검색 데이터 생성 중...`
    );

    const embedding =
      await createEmbedding(searchText);

    const extension =
      image.name
        .split(".")
        .pop()
        ?.toLowerCase() || "jpg";

    const filePath =
      `history/${workItemId}/${photoType}/${Date.now()}-${index}.${extension}`;

    setMessage(
      `${typeLabel} 사진 ${
        index + 1
      }/${total} 원본 저장 중...`
    );

    const { error: uploadError } =
      await supabase.storage
        .from("work-photos")
        .upload(filePath, image, {
          cacheControl: "3600",
          upsert: false,
        });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } =
      supabase.storage
        .from("work-photos")
        .getPublicUrl(filePath);

    const { error: photoError } =
      await supabase
        .from("work_photos")
        .insert([
          {
            project_id: projectId,

            work_item_id:
              workItemId,

            photo_url:
              publicUrlData.publicUrl,

            storage_path:
              filePath,

            photo_type:
              photoType,

            category:
              category.trim(),

            sub_category:
              aiAnalysis?.sub_category ||
              category.trim(),

            ai_description:
              aiAnalysis?.description || "",

            ai_tags:
              tags,

            embedding,
          },
        ]);

    if (photoError) {
      throw photoError;
    }
  }

  // ======================================================
  // 시공건 전체 저장
  // ======================================================

  async function handleSave() {
    const totalPhotoCount =
      beforeImages.length +
      afterImages.length;

    if (totalPhotoCount === 0) {
      setMessage(
        "⚠️ 시공 전 또는 시공 후 사진을 1장 이상 선택해주세요."
      );

      return;
    }

    if (!category.trim()) {
      setMessage(
        "⚠️ 시공 부위를 입력해주세요."
      );

      return;
    }

    const costNumber = Number(
      String(actualCost).replace(
        /,/g,
        ""
      )
    );

    if (
      !costNumber ||
      costNumber <= 0
    ) {
      setMessage(
        "⚠️ 실제 시공금액을 입력해주세요."
      );

      return;
    }

    // 저장 직전에 한 번 더 전체 사진 중복 검사

    setMessage(
      "사진 중복 여부를 확인하고 있습니다..."
    );

    const allHashes = new Set();

    for (const file of [
      ...beforeImages,
      ...afterImages,
    ]) {
      const hash =
        await getImageHash(file);

      if (allHashes.has(hash)) {
        setMessage(
          "❌ 동일한 사진이 중복되어 있습니다. 중복 사진을 제거한 후 다시 저장해주세요."
        );

        return;
      }

      allHashes.add(hash);
    }

    setLoading(true);

    setMessage(
      "시공정보를 저장하고 있습니다..."
    );

    try {
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      const {
        data: workItemData,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert([
          {
            project_id:
              projectId,

            category:
              category.trim(),

            sub_category:
              category.trim(),

            actual_cost:
              costNumber,

            memo:
              memo.trim() || null,
          },
        ])
        .select("id")
        .single();

      if (workItemError) {
        throw workItemError;
      }

      const workItemId =
        workItemData.id;

      for (
        let i = 0;
        i < beforeImages.length;
        i++
      ) {
        await savePhoto({
          image:
            beforeImages[i],

          index: i,

          total:
            beforeImages.length,

          photoType:
            "before",

          workItemId,

          projectId,
        });
      }

      for (
        let i = 0;
        i < afterImages.length;
        i++
      ) {
        await savePhoto({
          image:
            afterImages[i],

          index: i,

          total:
            afterImages.length,

          photoType:
            "after",

          workItemId,

          projectId,
        });
      }

      setMessage(
        `✅ 저장 완료! 시공 전 ${beforeImages.length}장 + 시공 후 ${afterImages.length}장이 같은 시공건으로 연결되었습니다.`
      );

      setBeforeImages([]);
      setAfterImages([]);
      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");
    } catch (error) {
      console.error(error);

      setMessage(
        `❌ 오류: ${
          error?.message ||
          "저장 중 오류가 발생했습니다."
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  function FileList({ files }) {
    if (files.length === 0) {
      return null;
    }

    return (
      <div
        style={{
          marginTop: "12px",
          padding: "12px",
          background: "#f3f4f6",
          borderRadius: "10px",
          lineHeight: "1.7",
        }}
      >
        선택한 사진: {files.length}장

        {files.map(
          (file, index) => (
            <div
              key={`${file.name}-${index}`}
            >
              {index + 1}.{" "}
              {file.name}
            </div>
          )
        )}
      </div>
    );
  }

  const inputStyle = {
    width: "100%",
    padding: "15px",
    fontSize: "17px",
    border: "1px solid #ccc",
    borderRadius: "10px",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontWeight: "bold",
    marginBottom: "10px",
  };

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding:
          "30px 20px 60px",
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "inline-block",
          background: "#111827",
          color: "white",
          padding: "8px 14px",
          borderRadius: "20px",
          marginBottom: "20px",
        }}
      >
        기분좋은공간
      </div>

      <h1
        style={{
          fontSize: "34px",
          lineHeight: "1.3",
        }}
      >
        관리자 설정
      </h1>

      {/* 유사도 설정 */}

      <section
        style={{
          marginTop: "25px",
          padding: "25px",
          border:
            "2px solid #111827",
          borderRadius: "20px",
        }}
      >
        <h2>
          AI 유사도 기준
        </h2>

        <p
          style={{
            color: "#666",
            lineHeight: "1.6",
          }}
        >
          이 기준보다 유사도가 낮은
          과거 시공사례는 견적에서
          제외합니다.
        </p>

        <label style={labelStyle}>
          최소 유사도
        </label>

        <select
          value={
            similarityThreshold
          }
          onChange={(e) =>
            setSimilarityThreshold(
              Number(
                e.target.value
              )
            )
          }
          style={inputStyle}
        >
          <option value={0.5}>
            50%
          </option>

          <option value={0.55}>
            55%
          </option>

          <option value={0.6}>
            60%
          </option>

          <option value={0.65}>
            65%
          </option>

          <option value={0.7}>
            70%
          </option>

          <option value={0.75}>
            75%
          </option>
        </select>

        <div
          style={{
            marginTop: "15px",
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          현재 선택:{" "}
          {Math.round(
            similarityThreshold *
              100
          )}
          %
        </div>

        <button
          type="button"
          onClick={
            saveSimilaritySetting
          }
          disabled={
            settingLoading
          }
          style={{
            width: "100%",
            marginTop: "20px",
            padding: "17px",
            border: "none",
            borderRadius: "12px",
            background: "#111827",
            color: "white",
            fontSize: "18px",
            fontWeight: "bold",
            opacity:
              settingLoading
                ? 0.7
                : 1,
          }}
        >
          {settingLoading
            ? "저장 중..."
            : "유사도 기준 저장"}
        </button>

        {settingMessage && (
          <div
            style={{
              marginTop: "15px",
              padding: "12px",
              background:
                "#f3f4f6",
              borderRadius: "10px",
            }}
          >
            {settingMessage}
          </div>
        )}
      </section>

      <h1
        style={{
          marginTop: "45px",
          fontSize: "34px",
          lineHeight: "1.3",
        }}
      >
        과거 시공 데이터 등록
      </h1>

      <p
        style={{
          color: "#666",
          fontSize: "18px",
          lineHeight: "1.7",
        }}
      >
        시공 전 사진과 시공 후
        사진을 구분해서 등록합니다.
        <br />
        동일한 사진이 중복 선택되면
        자동으로 제외합니다.
      </p>

      <section
        style={{
          marginTop: "30px",
          padding: "25px",
          border: "1px solid #ddd",
          borderRadius: "20px",
        }}
      >
        {/* 시공 전 */}

        <div
          style={{
            marginBottom: "30px",
            padding: "20px",
            background:
              "#f9fafb",
            borderRadius: "15px",
          }}
        >
          <label style={labelStyle}>
            📷 시공 전 사진
          </label>

          <p
            style={{
              color: "#666",
              fontSize: "14px",
            }}
          >
            고객 견적사진과 비교할
            때 사용됩니다.
          </p>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={async (e) => {
              const files =
                Array.from(
                  e.target.files ||
                    []
                );

              setMessage(
                "사진 중복 여부를 확인하고 있습니다..."
              );

              const {
                uniqueFiles,
                duplicateCount,
              } =
                await removeDuplicateImages(
                  files,
                  afterImages
                );

              setBeforeImages(
                uniqueFiles
              );

              if (
                duplicateCount > 0
              ) {
                setMessage(
                  `⚠️ 동일한 사진 ${duplicateCount}장을 발견해서 제외했습니다.`
                );
              } else {
                setMessage(
                  `✅ 시공 전 사진 ${uniqueFiles.length}장이 선택되었습니다.`
                );
              }
            }}
          />

          <FileList
            files={
              beforeImages
            }
          />
        </div>

        {/* 시공 후 */}

        <div
          style={{
            marginBottom: "30px",
            padding: "20px",
            background:
              "#f9fafb",
            borderRadius: "15px",
          }}
        >
          <label style={labelStyle}>
            ✨ 시공 후 사진
          </label>

          <p
            style={{
              color: "#666",
              fontSize: "14px",
            }}
          >
            완료 사례와
            포트폴리오에 활용할 수
            있습니다.
          </p>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={async (e) => {
              const files =
                Array.from(
                  e.target.files ||
                    []
                );

              setMessage(
                "사진 중복 여부를 확인하고 있습니다..."
              );

              const {
                uniqueFiles,
                duplicateCount,
              } =
                await removeDuplicateImages(
                  files,
                  beforeImages
                );

              setAfterImages(
                uniqueFiles
              );

              if (
                duplicateCount > 0
              ) {
                setMessage(
                  `⚠️ 동일한 사진 ${duplicateCount}장을 발견해서 제외했습니다.`
                );
              } else {
                setMessage(
                  `✅ 시공 후 사진 ${uniqueFiles.length}장이 선택되었습니다.`
                );
              }
            }}
          />

          <FileList
            files={
              afterImages
            }
          />
        </div>

        {/* 시공 부위 */}

        <div
          style={{
            marginBottom: "25px",
          }}
        >
          <label style={labelStyle}>
            시공 부위
          </label>

          <input
            type="text"
            value={category}
            onChange={(e) =>
              setCategory(
                e.target.value
              )
            }
            placeholder="예: 싱크대, 중문, 방문, 방화문"
            style={inputStyle}
          />
        </div>

        {/* 실제 시공금액 */}

        <div
          style={{
            marginBottom: "25px",
          }}
        >
          <label style={labelStyle}>
            실제 시공금액
          </label>

          <input
            type="number"
            inputMode="numeric"
            value={actualCost}
            onChange={(e) =>
              setActualCost(
                e.target.value
              )
            }
            placeholder="예: 550000"
            style={inputStyle}
          />
        </div>

        {/* 자재 */}

        <div
          style={{
            marginBottom: "25px",
          }}
        >
          <label style={labelStyle}>
            사용 자재
          </label>

          <input
            type="text"
            value={material}
            onChange={(e) =>
              setMaterial(
                e.target.value
              )
            }
            placeholder="예: 현대L&C GS115"
            style={inputStyle}
          />
        </div>

        {/* 메모 */}

        <div
          style={{
            marginBottom: "25px",
          }}
        >
          <label style={labelStyle}>
            메모
          </label>

          <textarea
            value={memo}
            onChange={(e) =>
              setMemo(
                e.target.value
              )
            }
            placeholder="예: 싱크대 상하부장 + 아일랜드 + 냉장고장"
            rows={5}
            style={{
              ...inputStyle,
              resize: "vertical",
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          style={{
            width: "100%",
            padding: "20px",
            border: "none",
            borderRadius: "14px",
            background: "#111827",
            color: "white",
            fontSize: "20px",
            fontWeight: "bold",
            opacity:
              loading
                ? 0.7
                : 1,
          }}
        >
          {loading
            ? "AI 분석 및 저장 중..."
            : "시공 전·후 데이터 저장"}
        </button>

        {message && (
          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              background:
                "#f3f4f6",
              borderRadius: "12px",
              lineHeight: "1.6",
            }}
          >
            {message}
          </div>
        )}
      </section>
    </main>
  );
}
