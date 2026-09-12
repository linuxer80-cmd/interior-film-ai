"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  // =========================
  // 신규 시공 데이터 등록
  // =========================
  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);

  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // =========================
  // AI 유사도 설정
  // =========================
  const [similarityThreshold, setSimilarityThreshold] =
    useState(0.65);

  const [settingMessage, setSettingMessage] = useState("");
  const [settingLoading, setSettingLoading] = useState(false);

  // =========================
  // DB 관리
  // =========================
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsMessage, setJobsMessage] = useState("");
  const [searchText, setSearchText] = useState("");

  // 수정
  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editMemo, setEditMemo] = useState("");

  // 사진 크게 보기
  const [previewPhoto, setPreviewPhoto] = useState(null);

  useEffect(() => {
    loadSettings();
    loadJobs();
  }, []);

  // =========================
  // 공통 스타일
  // =========================
  const inputStyle = {
    width: "100%",
    padding: "15px",
    fontSize: "17px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    boxSizing: "border-box",
    background: "white",
  };

  const labelStyle = {
    display: "block",
    fontWeight: "bold",
    marginBottom: "10px",
  };

  const sectionStyle = {
    padding: "22px",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    background: "white",
  };

  // ============================================================
  // AI 유사도 설정
  // ============================================================

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("similarity_threshold")
        .eq("id", 1)
        .single();

      if (error) {
        throw error;
      }

      if (data?.similarity_threshold != null) {
        setSimilarityThreshold(
          Number(data.similarity_threshold)
        );
      }
    } catch (error) {
      console.error(error);

      setSettingMessage(
        "⚠️ 현재 유사도 설정을 불러오지 못했습니다."
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

  // ============================================================
  // DB 목록 불러오기
  // ============================================================

  async function loadJobs() {
    setJobsLoading(true);
    setJobsMessage("");

    try {
      // 1. 시공건 불러오기
      const {
        data: workItems,
        error: workItemsError,
      } = await supabase
        .from("work_items")
        .select(
          `
          id,
          category,
          sub_category,
          actual_cost,
          memo,
          created_at
        `
        )
        .order("created_at", {
          ascending: false,
        });

      if (workItemsError) {
        throw workItemsError;
      }

      const items = workItems || [];

      if (items.length === 0) {
        setJobs([]);
        return;
      }

      const ids = items.map((item) => item.id);

      // 2. 연결 사진 불러오기
      const {
        data: photoData,
        error: photoError,
      } = await supabase
        .from("work_photos")
        .select(
          `
          id,
          work_item_id,
          photo_type,
          category,
          sub_category,
          storage_path,
          photo_url,
          ai_description,
          ai_tags,
          created_at
        `
        )
        .in("work_item_id", ids)
        .order("created_at", {
          ascending: true,
        });

      if (photoError) {
        throw photoError;
      }

      const photos = photoData || [];

      // 3. Private Storage 사진 signed URL 생성
      const photosWithUrls = await Promise.all(
        photos.map(async (photo) => {
          if (!photo.storage_path) {
            return {
              ...photo,
              signedUrl: photo.photo_url || null,
            };
          }

          try {
            const {
              data,
              error,
            } = await supabase.storage
              .from("work-photos")
              .createSignedUrl(
                photo.storage_path,
                60 * 60
              );

            if (error) {
              console.error(
                "Signed URL 오류:",
                error
              );

              return {
                ...photo,
                signedUrl: null,
              };
            }

            return {
              ...photo,
              signedUrl: data?.signedUrl || null,
            };
          } catch (error) {
            console.error(error);

            return {
              ...photo,
              signedUrl: null,
            };
          }
        })
      );

      // 4. 시공건 + 사진 합치기
      const combined = items.map((item) => {
        const linkedPhotos =
          photosWithUrls.filter(
            (photo) =>
              photo.work_item_id === item.id
          );

        return {
          ...item,
          photos: linkedPhotos,
          beforePhotos: linkedPhotos.filter(
            (photo) =>
              photo.photo_type === "before"
          ),
          afterPhotos: linkedPhotos.filter(
            (photo) =>
              photo.photo_type === "after"
          ),
          historyPhotos: linkedPhotos.filter(
            (photo) =>
              photo.photo_type === "history"
          ),
        };
      });

      setJobs(combined);
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 불러오기 오류: ${
          error?.message ||
          "시공 데이터를 불러오지 못했습니다."
        }`
      );
    } finally {
      setJobsLoading(false);
    }
  }

  // ============================================================
  // 시공건 수정
  // ============================================================

  function startEdit(job) {
    setEditingId(job.id);

    setEditCategory(
      job.category || ""
    );

    setEditSubCategory(
      job.sub_category ||
        job.category ||
        ""
    );

    setEditCost(
      job.actual_cost != null
        ? String(job.actual_cost)
        : ""
    );

    setEditMemo(
      job.memo || ""
    );

    setJobsMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCategory("");
    setEditSubCategory("");
    setEditCost("");
    setEditMemo("");
  }

  async function saveJobEdit(jobId) {
    const costNumber = Number(
      String(editCost).replace(/,/g, "")
    );

    if (!editCategory.trim()) {
      setJobsMessage(
        "⚠️ 시공 부위를 입력해주세요."
      );
      return;
    }

    if (!costNumber || costNumber <= 0) {
      setJobsMessage(
        "⚠️ 실제 시공금액을 정확히 입력해주세요."
      );
      return;
    }

    setJobsMessage("수정 중...");

    try {
      // work_items 수정
      const {
        error: workItemError,
      } = await supabase
        .from("work_items")
        .update({
          category: editCategory.trim(),

          sub_category:
            editSubCategory.trim() ||
            editCategory.trim(),

          actual_cost: costNumber,

          memo:
            editMemo.trim() || null,

          updated_at:
            new Date().toISOString(),
        })
        .eq("id", jobId);

      if (workItemError) {
        throw workItemError;
      }

      // 연결 사진 카테고리도 같이 수정
      const {
        error: photoError,
      } = await supabase
        .from("work_photos")
        .update({
          category: editCategory.trim(),
        })
        .eq("work_item_id", jobId);

      if (photoError) {
        throw photoError;
      }

      setJobsMessage(
        "✅ 시공 데이터가 수정되었습니다."
      );

      cancelEdit();

      await loadJobs();
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 수정 오류: ${
          error?.message ||
          "데이터를 수정하지 못했습니다."
        }`
      );
    }
  }

  // ============================================================
  // 개별 사진 삭제
  // ============================================================

  async function deletePhoto(photo) {
    const ok = window.confirm(
      `${
        photo.photo_type === "after"
          ? "시공 후"
          : photo.photo_type === "before"
          ? "시공 전"
          : "과거"
      } 사진을 삭제하시겠습니까?`
    );

    if (!ok) {
      return;
    }

    setJobsMessage(
      "사진 삭제 중..."
    );

    try {
      // Storage 원본 삭제
      if (photo.storage_path) {
        const {
          error: storageError,
        } = await supabase.storage
          .from("work-photos")
          .remove([
            photo.storage_path,
          ]);

        if (storageError) {
          throw storageError;
        }
      }

      // DB 사진 행 삭제
      const {
        error: photoDeleteError,
      } = await supabase
        .from("work_photos")
        .delete()
        .eq("id", photo.id);

      if (photoDeleteError) {
        throw photoDeleteError;
      }

      setJobsMessage(
        "✅ 사진이 삭제되었습니다."
      );

      setPreviewPhoto(null);

      await loadJobs();
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 사진 삭제 오류: ${
          error?.message ||
          "사진을 삭제하지 못했습니다."
        }`
      );
    }
  }

  // ============================================================
  // 시공건 전체 삭제
  // ============================================================

  async function deleteJob(job) {
    const ok = window.confirm(
      `${
        job.category || "이 시공건"
      }을 완전히 삭제하시겠습니까?\n\n사진 파일과 DB 데이터가 모두 삭제됩니다.`
    );

    if (!ok) {
      return;
    }

    setJobsMessage(
      "시공건 삭제 중..."
    );

    try {
      const photoPaths = (
        job.photos || []
      )
        .map(
          (photo) =>
            photo.storage_path
        )
        .filter(Boolean);

      // Storage 파일 먼저 삭제
      if (photoPaths.length > 0) {
        const {
          error: storageError,
        } = await supabase.storage
          .from("work-photos")
          .remove(photoPaths);

        if (storageError) {
          throw storageError;
        }
      }

      // 사진 DB 삭제
      const {
        error: photoDeleteError,
      } = await supabase
        .from("work_photos")
        .delete()
        .eq(
          "work_item_id",
          job.id
        );

      if (photoDeleteError) {
        throw photoDeleteError;
      }

      // 시공건 삭제
      const {
        error: workItemDeleteError,
      } = await supabase
        .from("work_items")
        .delete()
        .eq("id", job.id);

      if (workItemDeleteError) {
        throw workItemDeleteError;
      }

      setJobsMessage(
        "✅ 시공건과 연결 사진이 모두 삭제되었습니다."
      );

      await loadJobs();
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 삭제 오류: ${
          error?.message ||
          "시공건을 삭제하지 못했습니다."
        }`
      );
    }
  }

  // ============================================================
  // 검색
  // ============================================================

  const filteredJobs = useMemo(() => {
    const keyword =
      searchText
        .trim()
        .toLowerCase();

    if (!keyword) {
      return jobs;
    }

    return jobs.filter((job) => {
      const photoText = (
        job.photos || []
      )
        .map((photo) => {
          const tags =
            Array.isArray(
              photo.ai_tags
            )
              ? photo.ai_tags.join(" ")
              : String(
                  photo.ai_tags || ""
                );

          return [
            photo.category,
            photo.sub_category,
            photo.ai_description,
            tags,
          ]
            .filter(Boolean)
            .join(" ");
        })
        .join(" ");

      const text = [
        job.category,
        job.sub_category,
        job.memo,
        job.actual_cost,
        photoText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(keyword);
    });
  }, [jobs, searchText]);

  // ============================================================
  // 이미지 SHA-256 중복 검사
  // ============================================================

  async function getImageHash(file) {
    const buffer =
      await file.arrayBuffer();

    const hashBuffer =
      await crypto.subtle.digest(
        "SHA-256",
        buffer
      );

    const hashArray =
      Array.from(
        new Uint8Array(
          hashBuffer
        )
      );

    return hashArray
      .map((byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
      )
      .join("");
  }

  async function removeDuplicateImages(
    newFiles,
    otherFiles = []
  ) {
    const otherHashes =
      new Set();

    for (const file of otherFiles) {
      const hash =
        await getImageHash(file);

      otherHashes.add(hash);
    }

    const selectedHashes =
      new Set();

    const uniqueFiles = [];

    let duplicateCount = 0;

    for (const file of newFiles) {
      const hash =
        await getImageHash(file);

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

  // ============================================================
  // AI용 이미지 리사이즈
  // ============================================================

  async function resizeImage(file) {
    return new Promise(
      (resolve, reject) => {
        const img = new Image();

        const objectUrl =
          URL.createObjectURL(file);

        img.onload = () => {
          try {
            let width =
              img.width;

            let height =
              img.height;

            const maxSize = 1600;

            if (
              width > maxSize ||
              height > maxSize
            ) {
              if (
                width >= height
              ) {
                height = Math.round(
                  (height *
                    maxSize) /
                    width
                );

                width = maxSize;
              } else {
                width = Math.round(
                  (width *
                    maxSize) /
                    height
                );

                height = maxSize;
              }
            }

            const canvas =
              document.createElement(
                "canvas"
              );

            canvas.width = width;
            canvas.height = height;

            const ctx =
              canvas.getContext("2d");

            if (!ctx) {
              URL.revokeObjectURL(
                objectUrl
              );

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
                URL.revokeObjectURL(
                  objectUrl
                );

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
                      type:
                        "image/jpeg",
                    }
                  )
                );
              },
              "image/jpeg",
              0.8
            );
          } catch (error) {
            URL.revokeObjectURL(
              objectUrl
            );

            reject(error);
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(
            objectUrl
          );

          reject(
            new Error(
              "사진을 불러올 수 없습니다."
            )
          );
        };

        img.src = objectUrl;
      }
    );
  }

  // ============================================================
  // JSON 안전 처리
  // ============================================================

  async function readJsonSafely(
    response
  ) {
    const text =
      await response.text();

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

  // ============================================================
  // AI 사진 분석
  // ============================================================

  async function analyzeImage(
    file
  ) {
    const resizedImage =
      await resizeImage(file);

    const formData =
      new FormData();

    formData.append(
      "image",
      resizedImage
    );

    const response =
      await fetch(
        "/api/analyze",
        {
          method: "POST",
          body: formData,
        }
      );

    const result =
      await readJsonSafely(
        response
      );

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

  // ============================================================
  // 임베딩 생성
  // ============================================================

  async function createEmbedding(
    text
  ) {
    const response =
      await fetch(
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
      await readJsonSafely(
        response
      );

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

  // ============================================================
  // 사진 한 장 저장
  // ============================================================

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
      await analyzeImage(
        image
      );

    let tags =
      Array.isArray(
        aiAnalysis?.tags
      )
        ? [...aiAnalysis.tags]
        : [];

    if (material.trim()) {
      tags.push(
        material.trim()
      );
    }

    tags.push(
      photoType === "before"
        ? "시공전"
        : "시공후"
    );

    tags = [
      ...new Set(tags),
    ];

    const searchTextValue = [
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
        aiAnalysis?.description ||
        ""
      }`,

      `특징: ${tags.join(
        ", "
      )}`,

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
      await createEmbedding(
        searchTextValue
      );

    const extension =
      image.name
        .split(".")
        .pop()
        ?.toLowerCase() ||
      "jpg";

    const filePath =
      `history/${workItemId}/${photoType}/${Date.now()}-${index}.${extension}`;

    setMessage(
      `${typeLabel} 사진 ${
        index + 1
      }/${total} 원본 저장 중...`
    );

    const {
      error: uploadError,
    } = await supabase.storage
      .from("work-photos")
      .upload(
        filePath,
        image,
        {
          cacheControl:
            "3600",
          upsert: false,
        }
      );

    if (uploadError) {
      throw uploadError;
    }

    const {
      data: publicUrlData,
    } = supabase.storage
      .from("work-photos")
      .getPublicUrl(
        filePath
      );

    const {
      error: photoError,
    } = await supabase
      .from("work_photos")
      .insert([
        {
          project_id:
            projectId,

          work_item_id:
            workItemId,

          photo_url:
            publicUrlData
              .publicUrl,

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
            aiAnalysis?.description ||
            "",

          ai_tags: tags,

          embedding,
        },
      ]);

    if (photoError) {
      throw photoError;
    }
  }

  // ============================================================
  // 신규 시공건 저장
  // ============================================================

  async function handleSave() {
    const totalPhotoCount =
      beforeImages.length +
      afterImages.length;

    if (
      totalPhotoCount === 0
    ) {
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

    const costNumber =
      Number(
        String(
          actualCost
        ).replace(/,/g, "")
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

    setMessage(
      "사진 중복 여부를 확인하고 있습니다..."
    );

    const allHashes =
      new Set();

    for (const file of [
      ...beforeImages,
      ...afterImages,
    ]) {
      const hash =
        await getImageHash(
          file
        );

      if (
        allHashes.has(hash)
      ) {
        setMessage(
          "❌ 동일한 사진이 중복되어 있습니다."
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
              memo.trim() ||
              null,
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
        i <
        beforeImages.length;
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
        i <
        afterImages.length;
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

      await loadJobs();
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

  // ============================================================
  // 선택 파일 목록
  // ============================================================

  function FileList({
    files,
  }) {
    if (
      files.length === 0
    ) {
      return null;
    }

    return (
      <div
        style={{
          marginTop: "12px",
          padding: "12px",
          background:
            "#f3f4f6",
          borderRadius:
            "10px",
          lineHeight: "1.7",
        }}
      >
        <strong>
          선택한 사진:{" "}
          {files.length}장
        </strong>

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

  // ============================================================
  // 사진 카드
  // ============================================================

  function PhotoCard({
    photo,
  }) {
    const typeLabel =
      photo.photo_type ===
      "after"
        ? "시공 후"
        : photo.photo_type ===
          "before"
        ? "시공 전"
        : "과거 사진";

    return (
      <div
        style={{
          width:
            "calc(50% - 6px)",
          minWidth: "0",
        }}
      >
        <div
          style={{
            position:
              "relative",
            width: "100%",
            aspectRatio: "1 / 1",
            borderRadius:
              "12px",
            overflow: "hidden",
            background:
              "#f3f4f6",
            border:
              "1px solid #e5e7eb",
          }}
        >
          {photo.signedUrl ? (
            <img
              src={
                photo.signedUrl
              }
              alt={typeLabel}
              onClick={() =>
                setPreviewPhoto(
                  photo
                )
              }
              style={{
                width:
                  "100%",
                height:
                  "100%",
                objectFit:
                  "cover",
                display:
                  "block",
                cursor:
                  "pointer",
              }}
            />
          ) : (
            <div
              style={{
                height:
                  "100%",
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                textAlign:
                  "center",
                padding:
                  "10px",
                fontSize:
                  "13px",
                color:
                  "#6b7280",
              }}
            >
              사진을 불러올 수
              없습니다
            </div>
          )}

          <div
            style={{
              position:
                "absolute",
              top: "7px",
              left: "7px",
              background:
                "rgba(0,0,0,0.7)",
              color:
                "white",
              padding:
                "5px 8px",
              borderRadius:
                "7px",
              fontSize:
                "12px",
              fontWeight:
                "bold",
            }}
          >
            {typeLabel}
          </div>
        </div>

        <button
          onClick={() =>
            deletePhoto(photo)
          }
          style={{
            width: "100%",
            marginTop: "6px",
            padding: "9px",
            border:
              "1px solid #fecaca",
            borderRadius:
              "9px",
            background:
              "#fff",
            color:
              "#b91c1c",
            fontWeight:
              "bold",
          }}
        >
          사진 삭제
        </button>
      </div>
    );
  }

  // ============================================================
  // 화면
  // ============================================================

  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding:
          "30px 18px 80px",
        fontFamily:
          "Arial, sans-serif",
        background:
          "#f9fafb",
        minHeight:
          "100vh",
        boxSizing:
          "border-box",
      }}
    >
      <div
        style={{
          display:
            "inline-block",
          background:
            "#111827",
          color:
            "white",
          padding:
            "8px 14px",
          borderRadius:
            "20px",
          marginBottom:
            "20px",
          fontWeight:
            "bold",
        }}
      >
        기분좋은공간
      </div>

      <h1>
        관리자 페이지
      </h1>

      {/* AI 설정 */}
      <section
        style={{
          ...sectionStyle,
          marginTop:
            "25px",
          border:
            "2px solid #111827",
        }}
      >
        <h2>
          AI 유사도 기준
        </h2>

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

        <button
          onClick={
            saveSimilaritySetting
          }
          disabled={
            settingLoading
          }
          style={{
            width: "100%",
            marginTop:
              "15px",
            padding: "17px",
            border: "none",
            borderRadius:
              "12px",
            background:
              "#111827",
            color: "white",
            fontSize:
              "18px",
            fontWeight:
              "bold",
          }}
        >
          유사도 기준 저장
        </button>

        {settingMessage && (
          <p>
            {settingMessage}
          </p>
        )}
      </section>

      {/* 신규 데이터 등록 */}
      <h2
        style={{
          marginTop:
            "45px",
        }}
      >
        과거 시공 데이터 등록
      </h2>

      <section
        style={
          sectionStyle
        }
      >
        <label
          style={
            labelStyle
          }
        >
          📷 시공 전 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (
            e
          ) => {
            const files =
              Array.from(
                e.target
                  .files ||
                  []
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
              duplicateCount >
              0
            ) {
              setMessage(
                `⚠️ 동일한 사진 ${duplicateCount}장을 제외했습니다.`
              );
            }
          }}
        />

        <FileList
          files={
            beforeImages
          }
        />

        <div
          style={{
            height:
              "25px",
          }}
        />

        <label
          style={
            labelStyle
          }
        >
          ✨ 시공 후 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (
            e
          ) => {
            const files =
              Array.from(
                e.target
                  .files ||
                  []
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
              duplicateCount >
              0
            ) {
              setMessage(
                `⚠️ 동일한 사진 ${duplicateCount}장을 제외했습니다.`
              );
            }
          }}
        />

        <FileList
          files={
            afterImages
          }
        />

        <div
          style={{
            height:
              "25px",
          }}
        />

        <input
          value={category}
          onChange={(e) =>
            setCategory(
              e.target.value
            )
          }
          placeholder="시공 부위 예: 싱크대"
          style={inputStyle}
        />

        <div
          style={{
            height:
              "15px",
          }}
        />

        <input
          type="number"
          value={
            actualCost
          }
          onChange={(e) =>
            setActualCost(
              e.target.value
            )
          }
          placeholder="실제 시공금액"
          style={inputStyle}
        />

        <div
          style={{
            height:
              "15px",
          }}
        />

        <input
          value={material}
          onChange={(e) =>
            setMaterial(
              e.target.value
            )
          }
          placeholder="사용 자재 예: 현대 GS115"
          style={inputStyle}
        />

        <div
          style={{
            height:
              "15px",
          }}
        />

        <textarea
          value={memo}
          onChange={(e) =>
            setMemo(
              e.target.value
            )
          }
          placeholder="메모"
          rows={4}
          style={inputStyle}
        />

        <button
          onClick={
            handleSave
          }
          disabled={
            loading
          }
          style={{
            width: "100%",
            marginTop:
              "20px",
            padding: "20px",
            border: "none",
            borderRadius:
              "14px",
            background:
              "#111827",
            color: "white",
            fontSize:
              "20px",
            fontWeight:
              "bold",
          }}
        >
          {loading
            ? "AI 분석 및 저장 중..."
            : "시공 전·후 데이터 저장"}
        </button>

        {message && (
          <p
            style={{
              lineHeight:
                "1.6",
            }}
          >
            {message}
          </p>
        )}
      </section>

      {/* DB 관리 */}
      <h2
        style={{
          marginTop:
            "50px",
        }}
      >
        데이터베이스 관리
      </h2>

      <section
        style={
          sectionStyle
        }
      >
        <input
          value={
            searchText
          }
          onChange={(e) =>
            setSearchText(
              e.target.value
            )
          }
          placeholder="싱크대, 중문, 메모 등 검색"
          style={inputStyle}
        />

        <button
          onClick={
            loadJobs
          }
          disabled={
            jobsLoading
          }
          style={{
            width: "100%",
            marginTop:
              "12px",
            padding: "14px",
            borderRadius:
              "10px",
            border:
              "1px solid #d1d5db",
            background:
              "white",
            fontWeight:
              "bold",
          }}
        >
          {jobsLoading
            ? "불러오는 중..."
            : "🔄 새로고침"}
        </button>

        <p
          style={{
            color:
              "#6b7280",
          }}
        >
          전체 {jobs.length}건 ·
          검색 결과{" "}
          {
            filteredJobs.length
          }
          건
        </p>

        {jobsMessage && (
          <div
            style={{
              padding:
                "12px",
              background:
                "#f3f4f6",
              borderRadius:
                "10px",
              marginBottom:
                "15px",
              lineHeight:
                "1.5",
            }}
          >
            {jobsMessage}
          </div>
        )}

        {!jobsLoading &&
          filteredJobs.length ===
            0 && (
            <p>
              등록된 시공
              데이터가 없습니다.
            </p>
          )}

        {filteredJobs.map(
          (job) => (
            <div
              key={job.id}
              style={{
                marginTop:
                  "22px",
                padding:
                  "18px",
                border:
                  "1px solid #d1d5db",
                borderRadius:
                  "16px",
                background:
                  "#ffffff",
                boxShadow:
                  "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              {/* 수정 모드 */}
              {editingId ===
              job.id ? (
                <>
                  <h3>
                    시공정보 수정
                  </h3>

                  <label
                    style={
                      labelStyle
                    }
                  >
                    시공 부위
                  </label>

                  <input
                    value={
                      editCategory
                    }
                    onChange={(
                      e
                    ) =>
                      setEditCategory(
                        e.target
                          .value
                      )
                    }
                    style={
                      inputStyle
                    }
                  />

                  <div
                    style={{
                      height:
                        "12px",
                    }}
                  />

                  <label
                    style={
                      labelStyle
                    }
                  >
                    세부 부위
                  </label>

                  <input
                    value={
                      editSubCategory
                    }
                    onChange={(
                      e
                    ) =>
                      setEditSubCategory(
                        e.target
                          .value
                      )
                    }
                    style={
                      inputStyle
                    }
                  />

                  <div
                    style={{
                      height:
                        "12px",
                    }}
                  />

                  <label
                    style={
                      labelStyle
                    }
                  >
                    실제 시공금액
                  </label>

                  <input
                    type="number"
                    value={
                      editCost
                    }
                    onChange={(
                      e
                    ) =>
                      setEditCost(
                        e.target
                          .value
                      )
                    }
                    style={
                      inputStyle
                    }
                  />

                  <div
                    style={{
                      height:
                        "12px",
                    }}
                  />

                  <label
                    style={
                      labelStyle
                    }
                  >
                    메모
                  </label>

                  <textarea
                    value={
                      editMemo
                    }
                    onChange={(
                      e
                    ) =>
                      setEditMemo(
                        e.target
                          .value
                      )
                    }
                    rows={4}
                    style={
                      inputStyle
                    }
                  />

                  <button
                    onClick={() =>
                      saveJobEdit(
                        job.id
                      )
                    }
                    style={{
                      width:
                        "100%",
                      marginTop:
                        "15px",
                      padding:
                        "15px",
                      border:
                        "none",
                      borderRadius:
                        "10px",
                      background:
                        "#111827",
                      color:
                        "white",
                      fontWeight:
                        "bold",
                      fontSize:
                        "16px",
                    }}
                  >
                    ✅ 수정 저장
                  </button>

                  <button
                    onClick={
                      cancelEdit
                    }
                    style={{
                      width:
                        "100%",
                      marginTop:
                        "8px",
                      padding:
                        "13px",
                      borderRadius:
                        "10px",
                      border:
                        "1px solid #d1d5db",
                      background:
                        "white",
                    }}
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <h3
                    style={{
                      marginTop:
                        "0",
                      marginBottom:
                        "6px",
                    }}
                  >
                    {job.category ||
                      "시공 부위 없음"}
                  </h3>

                  {job.sub_category &&
                    job.sub_category !==
                      job.category && (
                      <p
                        style={{
                          marginTop:
                            "0",
                          color:
                            "#6b7280",
                        }}
                      >
                        세부:{" "}
                        {
                          job.sub_category
                        }
                      </p>
                    )}

                  <p>
                    💰 실제
                    시공금액:{" "}
                    <strong>
                      {Number(
                        job.actual_cost ||
                          0
                      ).toLocaleString()}
                      원
                    </strong>
                  </p>

                  {job.memo && (
                    <p
                      style={{
                        whiteSpace:
                          "pre-wrap",
                      }}
                    >
                      📝{" "}
                      {job.memo}
                    </p>
                  )}

                  {/* 시공 전 사진 */}
                  {job.beforePhotos
                    ?.length >
                    0 && (
                    <>
                      <h4>
                        📷 시공 전{" "}
                        {
                          job
                            .beforePhotos
                            .length
                        }
                        장
                      </h4>

                      <div
                        style={{
                          display:
                            "flex",
                          flexWrap:
                            "wrap",
                          gap:
                            "12px",
                        }}
                      >
                        {job.beforePhotos.map(
                          (
                            photo
                          ) => (
                            <PhotoCard
                              key={
                                photo.id
                              }
                              photo={
                                photo
                              }
                            />
                          )
                        )}
                      </div>
                    </>
                  )}

                  {/* 시공 후 사진 */}
                  {job.afterPhotos
                    ?.length >
                    0 && (
                    <>
                      <h4>
                        ✨ 시공 후{" "}
                        {
                          job
                            .afterPhotos
                            .length
                        }
                        장
                      </h4>

                      <div
                        style={{
                          display:
                            "flex",
                          flexWrap:
                            "wrap",
                          gap:
                            "12px",
                        }}
                      >
                        {job.afterPhotos.map(
                          (
                            photo
                          ) => (
                            <PhotoCard
                              key={
                                photo.id
                              }
                              photo={
                                photo
                              }
                            />
                          )
                        )}
                      </div>
                    </>
                  )}

                  {/* 예전 history 사진 */}
                  {job.historyPhotos
                    ?.length >
                    0 && (
                    <>
                      <h4>
                        🗂 기존 과거 사진{" "}
                        {
                          job
                            .historyPhotos
                            .length
                        }
                        장
                      </h4>

                      <div
                        style={{
                          display:
                            "flex",
                          flexWrap:
                            "wrap",
                          gap:
                            "12px",
                        }}
                      >
                        {job.historyPhotos.map(
                          (
                            photo
                          ) => (
                            <PhotoCard
                              key={
                                photo.id
                              }
                              photo={
                                photo
                              }
                            />
                          )
                        )}
                      </div>
                    </>
                  )}

                  {(job.photos ||
                    []).length ===
                    0 && (
                    <p
                      style={{
                        color:
                          "#9ca3af",
                      }}
                    >
                      연결된 사진이
                      없습니다.
                    </p>
                  )}

                  <button
                    onClick={() =>
                      startEdit(
                        job
                      )
                    }
                    style={{
                      width:
                        "100%",
                      marginTop:
                        "20px",
                      padding:
                        "14px",
                      borderRadius:
                        "10px",
                      border:
                        "1px solid #d1d5db",
                      background:
                        "white",
                      fontWeight:
                        "bold",
                      fontSize:
                        "16px",
                    }}
                  >
                    ✏️ 시공정보 수정
                  </button>

                  <button
                    onClick={() =>
                      deleteJob(
                        job
                      )
                    }
                    style={{
                      width:
                        "100%",
                      marginTop:
                        "8px",
                      padding:
                        "14px",
                      borderRadius:
                        "10px",
                      border:
                        "none",
                      background:
                        "#b91c1c",
                      color:
                        "white",
                      fontWeight:
                        "bold",
                      fontSize:
                        "16px",
                    }}
                  >
                    🗑️ 시공건 전체 삭제
                  </button>
                </>
              )}
            </div>
          )
        )}
      </section>

      {/* 사진 크게 보기 */}
      {previewPhoto && (
        <div
          onClick={() =>
            setPreviewPhoto(
              null
            )
          }
          style={{
            position:
              "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "rgba(0,0,0,0.9)",
            zIndex:
              9999,
            display:
              "flex",
            flexDirection:
              "column",
            justifyContent:
              "center",
            alignItems:
              "center",
            padding:
              "20px",
            boxSizing:
              "border-box",
          }}
        >
          <button
            onClick={() =>
              setPreviewPhoto(
                null
              )
            }
            style={{
              position:
                "absolute",
              top:
                "20px",
              right:
                "20px",
              background:
                "white",
              border:
                "none",
              borderRadius:
                "50%",
              width:
                "44px",
              height:
                "44px",
              fontSize:
                "22px",
              fontWeight:
                "bold",
            }}
          >
            ×
          </button>

          {previewPhoto.signedUrl && (
            <img
              src={
                previewPhoto.signedUrl
              }
              alt="확대 사진"
              onClick={(e) =>
                e.stopPropagation()
              }
              style={{
                maxWidth:
                  "100%",
                maxHeight:
                  "75vh",
                objectFit:
                  "contain",
                borderRadius:
                  "12px",
              }}
            />
          )}

          {previewPhoto.ai_description && (
            <div
              onClick={(e) =>
                e.stopPropagation()
              }
              style={{
                maxWidth:
                  "650px",
                marginTop:
                  "15px",
                background:
                  "white",
                color:
                  "#111827",
                padding:
                  "15px",
                borderRadius:
                  "12px",
                lineHeight:
                  "1.6",
              }}
            >
              <strong>
                AI 사진 설명
              </strong>

              <div
                style={{
                  marginTop:
                    "6px",
                }}
              >
                {
                  previewPhoto.ai_description
                }
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
