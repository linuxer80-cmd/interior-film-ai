"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

// ============================================================
// 사진 카드
// ============================================================

function PhotoCard({
  photo,
  editingPhotoId,
  editPhotoType,
  setEditPhotoType,
  editPhotoCategory,
  setEditPhotoCategory,
  editPhotoSubCategory,
  setEditPhotoSubCategory,
  editPhotoDescription,
  setEditPhotoDescription,
  photoEditLoading,
  startPhotoEdit,
  cancelPhotoEdit,
  savePhotoEdit,
  deletePhoto,
  setPreviewPhoto,
  inputStyle,
  labelStyle,
}) {
  const isEditing = editingPhotoId === photo.id;

  const typeLabel =
    photo.photo_type === "after"
      ? "시공 후"
      : photo.photo_type === "before"
      ? "시공 전"
      : "기존 사진";

  return (
    <div
      style={{
        width: "100%",
        marginBottom: "18px",
        padding: "12px",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 3",
          borderRadius: "12px",
          overflow: "hidden",
          background: "#f3f4f6",
        }}
      >
        {photo.signedUrl ? (
          <img
            src={photo.signedUrl}
            alt={typeLabel}
            onClick={() => setPreviewPhoto(photo)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              cursor: "pointer",
            }}
          />
        ) : (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
            }}
          >
            사진을 불러올 수 없습니다.
          </div>
        )}

        <div
          style={{
            position: "absolute",
            top: "8px",
            left: "8px",
            background: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "5px 8px",
            borderRadius: "7px",
            fontSize: "12px",
          }}
        >
          {typeLabel}
        </div>
      </div>

      {!isEditing ? (
        <>
          <div
            style={{
              marginTop: "10px",
              lineHeight: "1.6",
            }}
          >
            <strong>{photo.category || "-"}</strong>

            <div>{photo.sub_category || ""}</div>

            {photo.ai_description && (
              <div
                style={{
                  marginTop: "6px",
                  color: "#4b5563",
                  fontSize: "14px",
                }}
              >
                {photo.ai_description}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => startPhotoEdit(photo)}
            style={{
              width: "100%",
              marginTop: "12px",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #2563eb",
              background: "white",
              color: "#1d4ed8",
              fontWeight: "bold",
            }}
          >
            ✏️ 사진정보 수정
          </button>

          <button
            type="button"
            onClick={() => deletePhoto(photo)}
            style={{
              width: "100%",
              marginTop: "7px",
              padding: "11px",
              borderRadius: "10px",
              border: "1px solid #fecaca",
              background: "white",
              color: "#b91c1c",
              fontWeight: "bold",
            }}
          >
            사진 삭제
          </button>
        </>
      ) : (
        <div
          style={{
            marginTop: "14px",
            padding: "14px",
            background: "#f9fafb",
            borderRadius: "12px",
          }}
        >
          <label style={labelStyle}>사진 구분</label>

          <select
            value={editPhotoType}
            onChange={(e) => setEditPhotoType(e.target.value)}
            style={inputStyle}
          >
            <option value="before">시공 전</option>
            <option value="after">시공 후</option>
            <option value="history">기존 과거 사진</option>
          </select>

          <div style={{ height: "12px" }} />

          <label style={labelStyle}>카테고리</label>

          <input
            type="text"
            value={editPhotoCategory}
            onChange={(e) => setEditPhotoCategory(e.target.value)}
            style={inputStyle}
          />

          <div style={{ height: "12px" }} />

          <label style={labelStyle}>세부 부위</label>

          <input
            type="text"
            value={editPhotoSubCategory}
            onChange={(e) => setEditPhotoSubCategory(e.target.value)}
            style={inputStyle}
          />

          <div style={{ height: "12px" }} />

          <label style={labelStyle}>AI 사진 설명</label>

          <textarea
            value={editPhotoDescription}
            onChange={(e) => setEditPhotoDescription(e.target.value)}
            rows={6}
            style={{
              ...inputStyle,
              resize: "vertical",
            }}
          />

          <button
            type="button"
            onClick={() => savePhotoEdit(photo)}
            disabled={photoEditLoading}
            style={{
              width: "100%",
              marginTop: "14px",
              padding: "14px",
              border: "none",
              borderRadius: "10px",
              background: "#111827",
              color: "white",
              fontWeight: "bold",
              opacity: photoEditLoading ? 0.6 : 1,
            }}
          >
            {photoEditLoading ? "저장 중..." : "✅ 사진정보 저장"}
          </button>

          <button
            type="button"
            onClick={cancelPhotoEdit}
            disabled={photoEditLoading}
            style={{
              width: "100%",
              marginTop: "7px",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              background: "white",
            }}
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);

  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [similarityThreshold, setSimilarityThreshold] = useState(0.65);
  const [settingMessage, setSettingMessage] = useState("");
  const [settingLoading, setSettingLoading] = useState(false);

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsMessage, setJobsMessage] = useState("");
  const [searchText, setSearchText] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editMemo, setEditMemo] = useState("");

  const [previewPhoto, setPreviewPhoto] = useState(null);

  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editPhotoType, setEditPhotoType] = useState("before");
  const [editPhotoCategory, setEditPhotoCategory] = useState("");
  const [editPhotoSubCategory, setEditPhotoSubCategory] = useState("");
  const [editPhotoDescription, setEditPhotoDescription] = useState("");
  const [photoEditLoading, setPhotoEditLoading] = useState(false);

  const inputStyle = {
    width: "100%",
    padding: "15px",
    fontSize: "17px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    boxSizing: "border-box",
    background: "white",
    color: "#111827",
  };

  const labelStyle = {
    display: "block",
    fontWeight: "bold",
    marginBottom: "8px",
  };

  const sectionStyle = {
    padding: "22px",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    background: "white",
  };

  useEffect(() => {
    loadSettings();
    loadJobs();
  }, []);

  // ============================================================
  // 설정
  // ============================================================

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("similarity_threshold")
        .eq("id", 1)
        .single();

      if (error) throw error;

      if (data?.similarity_threshold != null) {
        setSimilarityThreshold(Number(data.similarity_threshold));
      }
    } catch (error) {
      console.error(error);
      setSettingMessage("⚠️ 현재 유사도 설정을 불러오지 못했습니다.");
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

      if (error) throw error;

      setSettingMessage(
        `✅ 유사도 기준을 ${Math.round(
          similarityThreshold * 100
        )}%로 저장했습니다.`
      );
    } catch (error) {
      console.error(error);

      setSettingMessage(
        `❌ 오류: ${error?.message || "설정 저장 실패"}`
      );
    } finally {
      setSettingLoading(false);
    }
  }

  // ============================================================
  // DB 목록
  // ============================================================

  async function loadJobs() {
    setJobsLoading(true);
    setJobsMessage("");

    try {
      const { data: workItems, error: workItemsError } = await supabase
        .from("work_items")
        .select(`
          id,
          category,
          sub_category,
          actual_cost,
          memo,
          created_at
        `)
        .order("created_at", {
          ascending: false,
        });

      if (workItemsError) throw workItemsError;

      const items = workItems || [];

      if (items.length === 0) {
        setJobs([]);
        return;
      }

      const ids = items.map((item) => item.id);

      const { data: photoData, error: photoError } = await supabase
        .from("work_photos")
        .select(`
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
        `)
        .in("work_item_id", ids)
        .order("created_at", {
          ascending: true,
        });

      if (photoError) throw photoError;

      const photos = photoData || [];

      const photosWithUrls = await Promise.all(
        photos.map(async (photo) => {
          if (!photo.storage_path) {
            return {
              ...photo,
              signedUrl: photo.photo_url || null,
            };
          }

          try {
            const { data, error } = await supabase.storage
              .from("work-photos")
              .createSignedUrl(photo.storage_path, 60 * 60);

            if (error) {
              console.error(error);

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

      const combined = items.map((item) => {
        const linkedPhotos = photosWithUrls.filter(
          (photo) => photo.work_item_id === item.id
        );

        return {
          ...item,
          photos: linkedPhotos,

          beforePhotos: linkedPhotos.filter(
            (photo) => photo.photo_type === "before"
          ),

          afterPhotos: linkedPhotos.filter(
            (photo) => photo.photo_type === "after"
          ),

          historyPhotos: linkedPhotos.filter(
            (photo) => photo.photo_type === "history"
          ),
        };
      });

      setJobs(combined);
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 불러오기 오류: ${
          error?.message || "시공 데이터를 불러오지 못했습니다."
        }`
      );
    } finally {
      setJobsLoading(false);
    }
  }

  // ============================================================
  // 시공 정보 수정
  // ============================================================

  function startEdit(job) {
    setEditingId(job.id);
    setEditCategory(job.category || "");
    setEditSubCategory(job.sub_category || "");
    setEditCost(
      job.actual_cost != null ? String(job.actual_cost) : ""
    );
    setEditMemo(job.memo || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveJobEdit(jobId) {
    const costNumber = Number(
      String(editCost).replace(/,/g, "")
    );

    if (!editCategory.trim()) {
      setJobsMessage("⚠️ 시공 부위를 입력해주세요.");
      return;
    }

    if (!costNumber || costNumber <= 0) {
      setJobsMessage("⚠️ 실제 시공금액을 정확히 입력해주세요.");
      return;
    }

    setJobsMessage("수정 중...");

    try {
      const { error } = await supabase
        .from("work_items")
        .update({
          category: editCategory.trim(),
          sub_category:
            editSubCategory.trim() || editCategory.trim(),
          actual_cost: costNumber,
          memo: editMemo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (error) throw error;

      setJobsMessage("✅ 시공 데이터가 수정되었습니다.");

      cancelEdit();
      await loadJobs();
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 수정 오류: ${
          error?.message || "수정하지 못했습니다."
        }`
      );
    }
  }

  // ============================================================
  // 사진 정보 수정
  // ============================================================

  function startPhotoEdit(photo) {
    setEditingPhotoId(photo.id);
    setEditPhotoType(photo.photo_type || "before");
    setEditPhotoCategory(photo.category || "");
    setEditPhotoSubCategory(
      photo.sub_category || photo.category || ""
    );
    setEditPhotoDescription(photo.ai_description || "");
    setJobsMessage("");
  }

  function cancelPhotoEdit() {
    setEditingPhotoId(null);
    setEditPhotoType("before");
    setEditPhotoCategory("");
    setEditPhotoSubCategory("");
    setEditPhotoDescription("");
  }

  async function savePhotoEdit(photo) {
    if (!editPhotoCategory.trim()) {
      setJobsMessage("⚠️ 사진 카테고리를 입력해주세요.");
      return;
    }

    setPhotoEditLoading(true);
    setJobsMessage("사진 정보와 AI 검색 데이터를 수정 중...");

    try {
      let tags = [];

      if (Array.isArray(photo.ai_tags)) {
        tags = [...photo.ai_tags];
      } else if (photo.ai_tags) {
        try {
          const parsed = JSON.parse(photo.ai_tags);

          if (Array.isArray(parsed)) {
            tags = parsed;
          }
        } catch {
          tags = [];
        }
      }

      tags = tags.filter(
        (tag) =>
          tag !== "시공전" &&
          tag !== "시공후" &&
          tag !== "전후비교"
      );

      if (editPhotoType === "before") {
        tags.push("시공전");
      }

      if (editPhotoType === "after") {
        tags.push("시공후");
      }

      tags = [...new Set(tags)];

      const searchTextValue = [
        `시공 부위: ${editPhotoCategory.trim()}`,
        `세부 부위: ${
          editPhotoSubCategory.trim() ||
          editPhotoCategory.trim()
        }`,
        `사진 상태: ${
          editPhotoType === "before"
            ? "시공 전"
            : editPhotoType === "after"
            ? "시공 후"
            : "과거 시공 사진"
        }`,
        `사진 설명: ${editPhotoDescription.trim()}`,
        `특징: ${tags.join(", ")}`,
      ]
        .filter(Boolean)
        .join("\n");

      const embedding = await createEmbedding(
        searchTextValue
      );

      const { error } = await supabase
        .from("work_photos")
        .update({
          photo_type: editPhotoType,
          category: editPhotoCategory.trim(),
          sub_category:
            editPhotoSubCategory.trim() ||
            editPhotoCategory.trim(),
          ai_description: editPhotoDescription.trim(),
          ai_tags: tags,
          embedding,
        })
        .eq("id", photo.id);

      if (error) throw error;

      setJobsMessage(
        "✅ 사진 정보와 AI 검색 데이터가 수정되었습니다."
      );

      cancelPhotoEdit();
      await loadJobs();
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 사진 수정 오류: ${
          error?.message ||
          "사진 정보를 수정하지 못했습니다."
        }`
      );
    } finally {
      setPhotoEditLoading(false);
    }
  }

  // ============================================================
  // 삭제
  // ============================================================

  async function deletePhoto(photo) {
    const ok = window.confirm(
      "이 사진을 완전히 삭제하시겠습니까?"
    );

    if (!ok) return;

    setJobsMessage("사진 삭제 중...");

    try {
      if (photo.storage_path) {
        const { error: storageError } =
          await supabase.storage
            .from("work-photos")
            .remove([photo.storage_path]);

        if (storageError) throw storageError;
      }

      const { error } = await supabase
        .from("work_photos")
        .delete()
        .eq("id", photo.id);

      if (error) throw error;

      setJobsMessage("✅ 사진이 삭제되었습니다.");

      setPreviewPhoto(null);
      await loadJobs();
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 사진 삭제 오류: ${
          error?.message || "사진을 삭제하지 못했습니다."
        }`
      );
    }
  }

  async function deleteJob(job) {
    const ok = window.confirm(
      `${
        job.category || "이 시공건"
      }을 완전히 삭제하시겠습니까?\n\n사진과 DB 데이터가 모두 삭제됩니다.`
    );

    if (!ok) return;

    setJobsMessage("시공건 삭제 중...");

    try {
      const photoPaths = (job.photos || [])
        .map((photo) => photo.storage_path)
        .filter(Boolean);

      if (photoPaths.length > 0) {
        const { error: storageError } =
          await supabase.storage
            .from("work-photos")
            .remove(photoPaths);

        if (storageError) throw storageError;
      }

      const { error: photoDeleteError } =
        await supabase
          .from("work_photos")
          .delete()
          .eq("work_item_id", job.id);

      if (photoDeleteError) throw photoDeleteError;

      const { error: workItemDeleteError } =
        await supabase
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
    const keyword = searchText
      .trim()
      .toLowerCase();

    if (!keyword) return jobs;

    return jobs.filter((job) => {
      const photoText = (job.photos || [])
        .map((photo) =>
          [
            photo.category,
            photo.sub_category,
            photo.ai_description,
          ]
            .filter(Boolean)
            .join(" ")
        )
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
  // 중복 사진
  // ============================================================

  async function getImageHash(file) {
    const buffer = await file.arrayBuffer();

    const hashBuffer =
      await crypto.subtle.digest(
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

  async function removeDuplicateImages(
    newFiles,
    otherFiles = []
  ) {
    const otherHashes = new Set();

    for (const file of otherFiles) {
      otherHashes.add(
        await getImageHash(file)
      );
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

    if (duplicateCount > 0) {
      setMessage(
        `⚠️ 동일한 사진 ${duplicateCount}장을 발견해서 제외했습니다.`
      );
    }

    return {
      uniqueFiles,
      duplicateCount,
    };
  }

  // ============================================================
  // 이미지 축소
  // ============================================================

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
                    "이미지 변환에 실패했습니다."
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

  // ============================================================
  // JSON 읽기
  // ============================================================

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
          : "서버 응답 오류"
      );
    }
  }

  // ============================================================
  // 단일 사진 AI 분석
  // ============================================================

  async function analyzeImage(
    file,
    photoType = "before"
  ) {
    const resizedImage =
      await resizeImage(file);

    const formData = new FormData();

    formData.append(
      "image",
      resizedImage
    );

    const normalizedPhotoType =
      photoType === "after"
        ? "after"
        : "before";

    formData.append(
      "photoType",
      normalizedPhotoType
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
          "AI 사진 분석 실패"
      );
    }

    if (
      result?.photoType !==
      normalizedPhotoType
    ) {
      throw new Error(
        `사진 구분 전달 오류: 보낸 값=${normalizedPhotoType}, 서버 값=${result?.photoType}`
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
  // 시공 전 + 시공 후 비교 분석
  // ============================================================

  async function compareBeforeAfter(
    beforeFile,
    afterFile
  ) {
    const resizedBefore =
      await resizeImage(beforeFile);

    const resizedAfter =
      await resizeImage(afterFile);

    const formData = new FormData();

    formData.append(
      "beforeImage",
      resizedBefore
    );

    formData.append(
      "afterImage",
      resizedAfter
    );

    formData.append(
      "photoType",
      "compare"
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
          "시공 전후 비교 분석 실패"
      );
    }

    if (
      result?.photoType !== "compare"
    ) {
      throw new Error(
        `전후 비교 전달 오류: 서버 값=${result?.photoType}`
      );
    }

    if (!result?.analysis) {
      throw new Error(
        "시공 전후 비교 결과가 없습니다."
      );
    }

    return result.analysis;
  }

  // ============================================================
  // 임베딩
  // ============================================================

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
          "임베딩 생성 실패"
      );
    }

    return result.embedding;
  }

  // ============================================================
  // 사진 저장
  // analysisOverride가 있으면 전후 비교 결과 사용
  // ============================================================

  async function savePhoto({
    image,
    index,
    total,
    photoType,
    workItemId,
    projectId,
    analysisOverride = null,
  }) {
    const normalizedPhotoType =
      photoType === "after"
        ? "after"
        : "before";

    const typeLabel =
      normalizedPhotoType === "before"
        ? "시공 전"
        : "시공 후";

    setMessage(
      `${typeLabel} 사진 ${
        index + 1
      }/${total} AI 분석 중...`
    );

    let aiAnalysis;

    if (analysisOverride) {
      aiAnalysis = analysisOverride;
    } else {
      aiAnalysis =
        await analyzeImage(
          image,
          normalizedPhotoType
        );
    }

    let tags =
      Array.isArray(aiAnalysis?.tags)
        ? [...aiAnalysis.tags]
        : [];

    if (material.trim()) {
      tags.push(material.trim());
    }

    tags.push(
      normalizedPhotoType === "before"
        ? "시공전"
        : "시공후"
    );

    if (
      normalizedPhotoType === "after" &&
      analysisOverride
    ) {
      tags.push("전후비교");
    }

    tags = [...new Set(tags)];

    const searchTextValue = [
      `시공 부위: ${category.trim()}`,

      `세부 부위: ${
        aiAnalysis?.sub_category ||
        category.trim()
      }`,

      `사진 상태: ${
        normalizedPhotoType === "before"
          ? "시공 전"
          : "시공 후"
      }`,

      analysisOverride
        ? "분석 방식: 시공 전후 사진 비교"
        : "분석 방식: 단일 사진 분석",

      aiAnalysis?.before_summary
        ? `시공 전 상태: ${aiAnalysis.before_summary}`
        : "",

      aiAnalysis?.after_summary
        ? `시공 후 상태: ${aiAnalysis.after_summary}`
        : "",

      `사진 설명: ${
        aiAnalysis?.description || ""
      }`,

      Array.isArray(
        aiAnalysis?.changes
      )
        ? `전후 변화: ${aiAnalysis.changes.join(
            ", "
          )}`
        : "",

      `특징: ${tags.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const embedding =
      await createEmbedding(
        searchTextValue
      );

    const extension =
      image.name
        .split(".")
        .pop()
        ?.toLowerCase() || "jpg";

    const filePath =
      `history/${workItemId}/${normalizedPhotoType}/${Date.now()}-${index}.${extension}`;

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
            work_item_id: workItemId,

            photo_url:
              publicUrlData.publicUrl,

            storage_path: filePath,

            photo_type:
              normalizedPhotoType,

            category:
              category.trim(),

            sub_category:
              aiAnalysis?.sub_category ||
              category.trim(),

            ai_description:
              aiAnalysis?.description || "",

            ai_tags: tags,

            embedding,
          },
        ]);

    if (photoError) {
      throw photoError;
    }
  }

  // ============================================================
  // 전체 저장
  // ============================================================

  async function handleSave() {
    const totalPhotoCount =
      beforeImages.length +
      afterImages.length;

    if (totalPhotoCount === 0) {
      setMessage(
        "⚠️ 사진을 1장 이상 선택해주세요."
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

    const hashes = new Set();

    for (const file of [
      ...beforeImages,
      ...afterImages,
    ]) {
      const hash =
        await getImageHash(file);

      if (hashes.has(hash)) {
        setMessage(
          "❌ 동일한 사진이 중복되어 있습니다."
        );
        return;
      }

      hashes.add(hash);
    }

    setLoading(true);

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
            project_id: projectId,
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

      // --------------------------------------------------------
      // 시공 전 사진 저장
      // --------------------------------------------------------

      for (
        let i = 0;
        i < beforeImages.length;
        i++
      ) {
        await savePhoto({
          image: beforeImages[i],
          index: i,
          total: beforeImages.length,
          photoType: "before",
          workItemId,
          projectId,
        });
      }

      // --------------------------------------------------------
      // 시공 후 사진
      //
      // 시공 전 사진이 있으면
      // 같은 순서 사진끼리 전후 비교
      //
      // 후 사진 수가 더 많으면
      // 첫 번째 전 사진을 기준으로 비교
      // --------------------------------------------------------

      for (
        let i = 0;
        i < afterImages.length;
        i++
      ) {
        let comparisonAnalysis =
          null;

        if (
          beforeImages.length > 0
        ) {
          const beforeFile =
            beforeImages[i] ||
            beforeImages[0];

          setMessage(
            `✨ 시공 전후 사진 ${
              i + 1
            }/${
              afterImages.length
            } 비교 분석 중...`
          );

          comparisonAnalysis =
            await compareBeforeAfter(
              beforeFile,
              afterImages[i]
            );
        }

        await savePhoto({
          image: afterImages[i],
          index: i,
          total: afterImages.length,
          photoType: "after",
          workItemId,
          projectId,

          analysisOverride:
            comparisonAnalysis,
        });
      }

      if (
        beforeImages.length > 0 &&
        afterImages.length > 0
      ) {
        setMessage(
          `✅ 저장 완료! 시공 전 ${beforeImages.length}장 + 시공 후 ${afterImages.length}장을 저장했고, 시공 후 사진은 시공 전 사진과 비교 분석했습니다.`
        );
      } else {
        setMessage(
          `✅ 저장 완료! 시공 전 ${beforeImages.length}장 + 시공 후 ${afterImages.length}장을 저장했습니다.`
        );
      }

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
          "저장 실패"
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  function FileList({ files }) {
    if (!files.length) {
      return null;
    }

    return (
      <div
        style={{
          marginTop: "10px",
          padding: "10px",
          background: "#f3f4f6",
          borderRadius: "10px",
        }}
      >
        선택 사진 {files.length}장
      </div>
    );
  }

  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "25px 16px 80px",
        fontFamily: "Arial, sans-serif",
        background: "#f9fafb",
        minHeight: "100vh",
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "inline-block",
          background: "#111827",
          color: "white",
          padding: "8px 14px",
          borderRadius: "20px",
        }}
      >
        기분좋은공간
      </div>

      <h1>관리자 페이지</h1>

      {/* ====================================================== */}
      {/* AI 유사도 설정 */}
      {/* ====================================================== */}

      <section style={sectionStyle}>
        <h2>AI 유사도 기준</h2>

        <select
          value={similarityThreshold}
          onChange={(e) =>
            setSimilarityThreshold(
              Number(e.target.value)
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
          type="button"
          onClick={
            saveSimilaritySetting
          }
          disabled={settingLoading}
          style={{
            width: "100%",
            marginTop: "12px",
            padding: "15px",
            border: "none",
            borderRadius: "10px",
            background: "#111827",
            color: "white",
            fontWeight: "bold",
          }}
        >
          유사도 기준 저장
        </button>

        {settingMessage && (
          <p>{settingMessage}</p>
        )}
      </section>

      {/* ====================================================== */}
      {/* 과거 시공 등록 */}
      {/* ====================================================== */}

      <h2
        style={{
          marginTop: "40px",
        }}
      >
        과거 시공 데이터 등록
      </h2>

      <section style={sectionStyle}>
        <div
          style={{
            padding: "12px",
            marginBottom: "18px",
            background: "#eff6ff",
            borderRadius: "10px",
            fontSize: "14px",
            lineHeight: "1.6",
          }}
        >
          💡 시공 전·후 사진을 함께
          등록하면 AI가 두 사진을 직접
          비교해서 시공 후 변화를
          설명합니다.
          <br />
          여러 장일 경우 같은 순서로
          선택해주세요.
        </div>

        <label style={labelStyle}>
          📷 시공 전 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (e) => {
            const files =
              Array.from(
                e.target.files || []
              );

            const result =
              await removeDuplicateImages(
                files,
                afterImages
              );

            setBeforeImages(
              result.uniqueFiles
            );
          }}
        />

        <FileList
          files={beforeImages}
        />

        <div
          style={{
            height: "20px",
          }}
        />

        <label style={labelStyle}>
          ✨ 시공 후 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (e) => {
            const files =
              Array.from(
                e.target.files || []
              );

            const result =
              await removeDuplicateImages(
                files,
                beforeImages
              );

            setAfterImages(
              result.uniqueFiles
            );
          }}
        />

        <FileList
          files={afterImages}
        />

        <div
          style={{
            height: "20px",
          }}
        />

        <input
          type="text"
          value={category}
          onChange={(e) =>
            setCategory(
              e.target.value
            )
          }
          placeholder="시공 부위"
          style={inputStyle}
        />

        <div
          style={{
            height: "12px",
          }}
        />

        <input
          type="number"
          value={actualCost}
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
            height: "12px",
          }}
        />

        <input
          type="text"
          value={material}
          onChange={(e) =>
            setMaterial(
              e.target.value
            )
          }
          placeholder="사용 자재"
          style={inputStyle}
        />

        <div
          style={{
            height: "12px",
          }}
        />

        <textarea
          value={memo}
          onChange={(e) =>
            setMemo(e.target.value)
          }
          placeholder="메모"
          rows={4}
          style={inputStyle}
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          style={{
            width: "100%",
            marginTop: "15px",
            padding: "18px",
            border: "none",
            borderRadius: "12px",
            background: "#111827",
            color: "white",
            fontWeight: "bold",
            fontSize: "18px",
            opacity: loading
              ? 0.6
              : 1,
          }}
        >
          {loading
            ? "AI 분석 및 저장 중..."
            : "시공 데이터 저장"}
        </button>

        {message && (
          <p
            style={{
              lineHeight: "1.6",
            }}
          >
            {message}
          </p>
        )}
      </section>

      {/* ====================================================== */}
      {/* 데이터베이스 관리 */}
      {/* ====================================================== */}

      <h2
        style={{
          marginTop: "45px",
        }}
      >
        데이터베이스 관리
      </h2>

      <section style={sectionStyle}>
        <input
          type="text"
          value={searchText}
          onChange={(e) =>
            setSearchText(
              e.target.value
            )
          }
          placeholder="시공 부위 또는 메모 검색"
          style={inputStyle}
        />

        <button
          type="button"
          onClick={loadJobs}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "13px",
            borderRadius: "10px",
            border:
              "1px solid #d1d5db",
            background: "white",
            fontWeight: "bold",
          }}
        >
          🔄 새로고침
        </button>

        <p>
          전체 {jobs.length}건 · 검색
          결과 {filteredJobs.length}건
        </p>

        {jobsLoading && (
          <p>불러오는 중...</p>
        )}

        {jobsMessage && (
          <p>{jobsMessage}</p>
        )}

        {filteredJobs.map((job) => (
          <div
            key={job.id}
            style={{
              marginTop: "20px",
              padding: "18px",
              border:
                "1px solid #d1d5db",
              borderRadius: "16px",
            }}
          >
            {editingId === job.id ? (
              <>
                <h3>시공정보 수정</h3>

                <label
                  style={labelStyle}
                >
                  시공 부위
                </label>

                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) =>
                    setEditCategory(
                      e.target.value
                    )
                  }
                  style={inputStyle}
                />

                <div
                  style={{
                    height: "10px",
                  }}
                />

                <label
                  style={labelStyle}
                >
                  세부 부위
                </label>

                <input
                  type="text"
                  value={
                    editSubCategory
                  }
                  onChange={(e) =>
                    setEditSubCategory(
                      e.target.value
                    )
                  }
                  style={inputStyle}
                />

                <div
                  style={{
                    height: "10px",
                  }}
                />

                <label
                  style={labelStyle}
                >
                  실제 시공금액
                </label>

                <input
                  type="number"
                  value={editCost}
                  onChange={(e) =>
                    setEditCost(
                      e.target.value
                    )
                  }
                  style={inputStyle}
                />

                <div
                  style={{
                    height: "10px",
                  }}
                />

                <label
                  style={labelStyle}
                >
                  메모
                </label>

                <textarea
                  value={editMemo}
                  onChange={(e) =>
                    setEditMemo(
                      e.target.value
                    )
                  }
                  rows={4}
                  style={inputStyle}
                />

                <button
                  type="button"
                  onClick={() =>
                    saveJobEdit(job.id)
                  }
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    padding: "14px",
                    background:
                      "#111827",
                    color: "white",
                    border: "none",
                    borderRadius:
                      "10px",
                  }}
                >
                  수정 저장
                </button>

                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{
                    width: "100%",
                    marginTop: "7px",
                    padding: "12px",
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
                <h3>
                  {job.category ||
                    "시공건"}
                </h3>

                {job.sub_category && (
                  <p>
                    📌{" "}
                    {job.sub_category}
                  </p>
                )}

                <p>
                  💰{" "}
                  {Number(
                    job.actual_cost ||
                      0
                  ).toLocaleString()}
                  원
                </p>

                {job.memo && (
                  <p>
                    📝 {job.memo}
                  </p>
                )}

                {job.beforePhotos
                  ?.length > 0 && (
                  <>
                    <h4>
                      📷 시공 전
                    </h4>

                    {job.beforePhotos.map(
                      (photo) => (
                        <PhotoCard
                          key={
                            photo.id
                          }
                          photo={photo}
                          editingPhotoId={
                            editingPhotoId
                          }
                          editPhotoType={
                            editPhotoType
                          }
                          setEditPhotoType={
                            setEditPhotoType
                          }
                          editPhotoCategory={
                            editPhotoCategory
                          }
                          setEditPhotoCategory={
                            setEditPhotoCategory
                          }
                          editPhotoSubCategory={
                            editPhotoSubCategory
                          }
                          setEditPhotoSubCategory={
                            setEditPhotoSubCategory
                          }
                          editPhotoDescription={
                            editPhotoDescription
                          }
                          setEditPhotoDescription={
                            setEditPhotoDescription
                          }
                          photoEditLoading={
                            photoEditLoading
                          }
                          startPhotoEdit={
                            startPhotoEdit
                          }
                          cancelPhotoEdit={
                            cancelPhotoEdit
                          }
                          savePhotoEdit={
                            savePhotoEdit
                          }
                          deletePhoto={
                            deletePhoto
                          }
                          setPreviewPhoto={
                            setPreviewPhoto
                          }
                          inputStyle={
                            inputStyle
                          }
                          labelStyle={
                            labelStyle
                          }
                        />
                      )
                    )}
                  </>
                )}

                {job.afterPhotos
                  ?.length > 0 && (
                  <>
                    <h4>
                      ✨ 시공 후
                    </h4>

                    {job.afterPhotos.map(
                      (photo) => (
                        <PhotoCard
                          key={
                            photo.id
                          }
                          photo={photo}
                          editingPhotoId={
                            editingPhotoId
                          }
                          editPhotoType={
                            editPhotoType
                          }
                          setEditPhotoType={
                            setEditPhotoType
                          }
                          editPhotoCategory={
                            editPhotoCategory
                          }
                          setEditPhotoCategory={
                            setEditPhotoCategory
                          }
                          editPhotoSubCategory={
                            editPhotoSubCategory
                          }
                          setEditPhotoSubCategory={
                            setEditPhotoSubCategory
                          }
                          editPhotoDescription={
                            editPhotoDescription
                          }
                          setEditPhotoDescription={
                            setEditPhotoDescription
                          }
                          photoEditLoading={
                            photoEditLoading
                          }
                          startPhotoEdit={
                            startPhotoEdit
                          }
                          cancelPhotoEdit={
                            cancelPhotoEdit
                          }
                          savePhotoEdit={
                            savePhotoEdit
                          }
                          deletePhoto={
                            deletePhoto
                          }
                          setPreviewPhoto={
                            setPreviewPhoto
                          }
                          inputStyle={
                            inputStyle
                          }
                          labelStyle={
                            labelStyle
                          }
                        />
                      )
                    )}
                  </>
                )}

                {job.historyPhotos
                  ?.length > 0 && (
                  <>
                    <h4>
                      🗂 기존 사진
                    </h4>

                    {job.historyPhotos.map(
                      (photo) => (
                        <PhotoCard
                          key={
                            photo.id
                          }
                          photo={photo}
                          editingPhotoId={
                            editingPhotoId
                          }
                          editPhotoType={
                            editPhotoType
                          }
                          setEditPhotoType={
                            setEditPhotoType
                          }
                          editPhotoCategory={
                            editPhotoCategory
                          }
                          setEditPhotoCategory={
                            setEditPhotoCategory
                          }
                          editPhotoSubCategory={
                            editPhotoSubCategory
                          }
                          setEditPhotoSubCategory={
                            setEditPhotoSubCategory
                          }
                          editPhotoDescription={
                            editPhotoDescription
                          }
                          setEditPhotoDescription={
                            setEditPhotoDescription
                          }
                          photoEditLoading={
                            photoEditLoading
                          }
                          startPhotoEdit={
                            startPhotoEdit
                          }
                          cancelPhotoEdit={
                            cancelPhotoEdit
                          }
                          savePhotoEdit={
                            savePhotoEdit
                          }
                          deletePhoto={
                            deletePhoto
                          }
                          setPreviewPhoto={
                            setPreviewPhoto
                          }
                          inputStyle={
                            inputStyle
                          }
                          labelStyle={
                            labelStyle
                          }
                        />
                      )
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() =>
                    startEdit(job)
                  }
                  style={{
                    width: "100%",
                    marginTop: "10px",
                    padding: "13px",
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
                  ✏️ 시공정보 수정
                </button>

                <button
                  type="button"
                  onClick={() =>
                    deleteJob(job)
                  }
                  style={{
                    width: "100%",
                    marginTop: "7px",
                    padding: "13px",
                    border: "none",
                    borderRadius:
                      "10px",
                    background:
                      "#b91c1c",
                    color: "white",
                    fontWeight:
                      "bold",
                  }}
                >
                  🗑️ 시공건 전체 삭제
                </button>
              </>
            )}
          </div>
        ))}
      </section>

      {/* ====================================================== */}
      {/* 사진 확대 */}
      {/* ====================================================== */}

      {previewPhoto && (
        <div
          onClick={() =>
            setPreviewPhoto(null)
          }
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background:
              "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent:
              "center",
            padding: "20px",
          }}
        >
          <img
            src={
              previewPhoto.signedUrl
            }
            alt="확대 사진"
            style={{
              maxWidth: "100%",
              maxHeight: "90vh",
              objectFit: "contain",
            }}
          />
        </div>
      )}
    </main>
  );
          }
