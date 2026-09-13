"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

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
              return {
                ...photo,
                signedUrl: null,
              };
            }

            return {
              ...photo,
              signedUrl: data?.signedUrl || null,
            };
          } catch {
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

  function startEdit(job) {
    setEditingId(job.id);
    setEditCategory(job.category || "");
    setEditSubCategory(job.sub_category || "");
    setEditCost(job.actual_cost != null ? String(job.actual_cost) : "");
    setEditMemo(job.memo || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveJobEdit(jobId) {
    const costNumber = Number(String(editCost).replace(/,/g, ""));

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
          sub_category: editSubCategory.trim() || editCategory.trim(),
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
      setJobsMessage(
        `❌ 수정 오류: ${error?.message || "수정하지 못했습니다."}`
      );
    }
  }

  function startPhotoEdit(photo) {
    setEditingPhotoId(photo.id);
    setEditPhotoType(photo.photo_type || "before");
    setEditPhotoCategory(photo.category || "");
    setEditPhotoSubCategory(photo.sub_category || photo.category || "");
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
      }

      tags = tags.filter(
        (tag) =>
          tag !== "시공전" &&
          tag !== "시공후" &&
          tag !== "전후비교"
      );

      if (editPhotoType === "before") tags.push("시공전");
      if (editPhotoType === "after") tags.push("시공후");

      tags = [...new Set(tags)];

      const searchTextValue = [
        `시공 부위: ${editPhotoCategory.trim()}`,
        `세부 부위: ${
          editPhotoSubCategory.trim() || editPhotoCategory.trim()
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

      const embedding = await createEmbedding(searchTextValue);

      const { error } = await supabase
        .from("work_photos")
        .update({
          photo_type: editPhotoType,
          category: editPhotoCategory.trim(),
          sub_category:
            editPhotoSubCategory.trim() || editPhotoCategory.trim(),
          ai_description: editPhotoDescription.trim(),
          ai_tags: tags,
          embedding,
        })
        .eq("id", photo.id);

      if (error) throw error;

      setJobsMessage("✅ 사진 정보가 수정되었습니다.");

      cancelPhotoEdit();
      await loadJobs();
    } catch (error) {
      setJobsMessage(
        `❌ 사진 수정 오류: ${error?.message || "수정 실패"}`
      );
    } finally {
      setPhotoEditLoading(false);
    }
  }

  async function deletePhoto(photo) {
    const ok = window.confirm("이 사진을 완전히 삭제하시겠습니까?");

    if (!ok) return;

    try {
      if (photo.storage_path) {
        await supabase.storage
          .from("work-photos")
          .remove([photo.storage_path]);
      }

      const { error } = await supabase
        .from("work_photos")
        .delete()
        .eq("id", photo.id);

      if (error) throw error;

      setJobsMessage("✅ 사진이 삭제되었습니다.");

      await loadJobs();
    } catch (error) {
      setJobsMessage(
        `❌ 사진 삭제 오류: ${error?.message || "삭제 실패"}`
      );
    }
  }

  async function deleteJob(job) {
    const ok = window.confirm(
      "이 시공건과 연결된 사진을 모두 삭제하시겠습니까?"
    );

    if (!ok) return;

    try {
      const photoPaths = (job.photos || [])
        .map((photo) => photo.storage_path)
        .filter(Boolean);

      if (photoPaths.length > 0) {
        await supabase.storage
          .from("work-photos")
          .remove(photoPaths);
      }

      await supabase
        .from("work_photos")
        .delete()
        .eq("work_item_id", job.id);

      const { error } = await supabase
        .from("work_items")
        .delete()
        .eq("id", job.id);

      if (error) throw error;

      setJobsMessage("✅ 시공건이 삭제되었습니다.");

      await loadJobs();
    } catch (error) {
      setJobsMessage(
        `❌ 삭제 오류: ${error?.message || "삭제 실패"}`
      );
    }
  }

  const filteredJobs = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return jobs;

    return jobs.filter((job) => {
      const text = [
        job.category,
        job.sub_category,
        job.memo,
        ...(job.photos || []).map((photo) => photo.ai_description),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(keyword);
    });
  }, [jobs, searchText]);

  async function getImageHash(file) {
    const buffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      buffer
    );

    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function removeDuplicateImages(newFiles, otherFiles = []) {
    const otherHashes = new Set();

    for (const file of otherFiles) {
      otherHashes.add(await getImageHash(file));
    }

    const selectedHashes = new Set();
    const uniqueFiles = [];
    let duplicateCount = 0;

    for (const file of newFiles) {
      const hash = await getImageHash(file);

      if (selectedHashes.has(hash) || otherHashes.has(hash)) {
        duplicateCount++;
        continue;
      }

      selectedHashes.add(hash);
      uniqueFiles.push(file);
    }

    if (duplicateCount > 0) {
      setMessage(
        `⚠️ 동일한 사진 ${duplicateCount}장을 제외했습니다.`
      );
    }

    return uniqueFiles;
  }

  async function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxSize = 1600;

        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);

            if (!blob) {
              reject(new Error("이미지 변환 실패"));
              return;
            }

            resolve(
              new File([blob], "ai-analysis.jpg", {
                type: "image/jpeg",
              })
            );
          },
          "image/jpeg",
          0.8
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("이미지 로드 실패"));
      };

      img.src = objectUrl;
    });
  }

  async function readJsonSafely(response) {
    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("서버 응답 오류");
    }
  }

  async function analyzeImage(file, photoType) {
    const resized = await resizeImage(file);

    const formData = new FormData();

    formData.append("image", resized);
    formData.append("photoType", photoType);

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const result = await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(result?.error || "AI 분석 실패");
    }

    return result.analysis;
  }

  // ============================================================
  // 다중 전후 사진 묶음 비교
  // ============================================================

  async function compareMultipleBeforeAfter(
    beforeFiles,
    afterFiles
  ) {
    const formData = new FormData();

    setMessage("시공 전·후 전체 사진을 비교 분석 중...");

    for (const file of beforeFiles) {
      const resized = await resizeImage(file);
      formData.append("beforeImages", resized);
    }

    for (const file of afterFiles) {
      const resized = await resizeImage(file);
      formData.append("afterImages", resized);
    }

    formData.append("photoType", "compare");

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const result = await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(
        result?.error || "다중 전후 비교 분석 실패"
      );
    }

    if (!result?.analysis) {
      throw new Error("전후 비교 분석 결과가 없습니다.");
    }

    return result.analysis;
  }

  async function createEmbedding(text) {
    const response = await fetch("/api/embedding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const result = await readJsonSafely(response);

    if (!response.ok || !result?.embedding) {
      throw new Error(result?.error || "임베딩 생성 실패");
    }

    return result.embedding;
  }

  async function savePhoto({
    image,
    photoType,
    workItemId,
    projectId,
    analysisOverride,
    index,
  }) {
    let aiAnalysis = analysisOverride;

    if (!aiAnalysis) {
      aiAnalysis = await analyzeImage(image, photoType);
    }

    let tags = Array.isArray(aiAnalysis?.tags)
      ? [...aiAnalysis.tags]
      : [];

    tags.push(photoType === "before" ? "시공전" : "시공후");

    if (analysisOverride && photoType === "after") {
      tags.push("전후비교");
      tags.push("다중사진");
    }

    if (material.trim()) {
      tags.push(material.trim());
    }

    tags = [...new Set(tags)];

    const searchTextValue = [
      `시공 부위: ${category.trim()}`,
      `세부 부위: ${
        aiAnalysis?.sub_category || category.trim()
      }`,
      `사진 상태: ${
        photoType === "before" ? "시공 전" : "시공 후"
      }`,
      aiAnalysis?.before_summary
        ? `시공 전 요약: ${aiAnalysis.before_summary}`
        : "",
      aiAnalysis?.after_summary
        ? `시공 후 요약: ${aiAnalysis.after_summary}`
        : "",
      `설명: ${aiAnalysis?.description || ""}`,
      Array.isArray(aiAnalysis?.changes)
        ? `주요 변화: ${aiAnalysis.changes.join(", ")}`
        : "",
      `특징: ${tags.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const embedding = await createEmbedding(searchTextValue);

    const extension =
      image.name.split(".").pop()?.toLowerCase() || "jpg";

    const filePath =
      `history/${workItemId}/${photoType}/${Date.now()}-${index}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("work-photos")
      .upload(filePath, image, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("work-photos")
      .getPublicUrl(filePath);

    const { error: photoError } = await supabase
      .from("work_photos")
      .insert([
        {
          project_id: projectId,
          work_item_id: workItemId,
          photo_url: publicUrlData.publicUrl,
          storage_path: filePath,
          photo_type: photoType,
          category: category.trim(),
          sub_category:
            aiAnalysis?.sub_category || category.trim(),
          ai_description: aiAnalysis?.description || "",
          ai_tags: tags,
          embedding,
        },
      ]);

    if (photoError) throw photoError;
  }

  async function handleSave() {
    if (beforeImages.length + afterImages.length === 0) {
      setMessage("⚠️ 사진을 선택해주세요.");
      return;
    }

    if (!category.trim()) {
      setMessage("⚠️ 시공 부위를 입력해주세요.");
      return;
    }

    const costNumber = Number(
      String(actualCost).replace(/,/g, "")
    );

    if (!costNumber || costNumber <= 0) {
      setMessage("⚠️ 실제 시공금액을 입력해주세요.");
      return;
    }

    setLoading(true);

    try {
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      const { data: workItemData, error: workItemError } =
        await supabase
          .from("work_items")
          .insert([
            {
              project_id: projectId,
              category: category.trim(),
              sub_category: category.trim(),
              actual_cost: costNumber,
              memo: memo.trim() || null,
            },
          ])
          .select("id")
          .single();

      if (workItemError) throw workItemError;

      const workItemId = workItemData.id;

      // 전체 전후 비교는 딱 한 번만 실행
      let comparisonAnalysis = null;

      if (
        beforeImages.length > 0 &&
        afterImages.length > 0
      ) {
        comparisonAnalysis =
          await compareMultipleBeforeAfter(
            beforeImages,
            afterImages
          );
      }

      // 시공 전은 각 사진 개별 분석
      for (let i = 0; i < beforeImages.length; i++) {
        setMessage(
          `시공 전 사진 ${i + 1}/${beforeImages.length} 저장 중...`
        );

        await savePhoto({
          image: beforeImages[i],
          photoType: "before",
          workItemId,
          projectId,
          analysisOverride: null,
          index: i,
        });
      }

      // 시공 후는 전체 전후 비교 결과를 공통 사용
      for (let i = 0; i < afterImages.length; i++) {
        setMessage(
          `시공 후 사진 ${i + 1}/${afterImages.length} 저장 중...`
        );

        await savePhoto({
          image: afterImages[i],
          photoType: "after",
          workItemId,
          projectId,
          analysisOverride: comparisonAnalysis,
          index: i,
        });
      }

      setMessage(
        `✅ 저장 완료! 시공 전 ${beforeImages.length}장, 시공 후 ${afterImages.length}장을 하나의 시공건으로 저장했습니다.`
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
        `❌ 오류: ${error?.message || "저장 실패"}`
      );
    } finally {
      setLoading(false);
    }
  }

  function FileList({ files }) {
    if (!files.length) return null;

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

      <section style={sectionStyle}>
        <h2>AI 유사도 기준</h2>

        <select
          value={similarityThreshold}
          onChange={(e) =>
            setSimilarityThreshold(Number(e.target.value))
          }
          style={inputStyle}
        >
          <option value={0.5}>50%</option>
          <option value={0.55}>55%</option>
          <option value={0.6}>60%</option>
          <option value={0.65}>65%</option>
          <option value={0.7}>70%</option>
          <option value={0.75}>75%</option>
        </select>

        <button
          onClick={saveSimilaritySetting}
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

        {settingMessage && <p>{settingMessage}</p>}
      </section>

      <h2 style={{ marginTop: "40px" }}>
        과거 시공 데이터 등록
      </h2>

      <section style={sectionStyle}>
        <div
          style={{
            padding: "12px",
            marginBottom: "18px",
            background: "#eff6ff",
            borderRadius: "10px",
            lineHeight: "1.6",
          }}
        >
          시공 전·후 사진은 여러 장 선택할 수 있습니다.
          <br />
          사진 장수와 순서는 서로 달라도 됩니다.
          <br />
          AI가 전체 사진 묶음을 종합해서 전후 변화를 분석합니다.
        </div>

        <label style={labelStyle}>
          📷 시공 전 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);

            setBeforeImages(
              await removeDuplicateImages(
                files,
                afterImages
              )
            );
          }}
        />

        <FileList files={beforeImages} />

        <div style={{ height: "20px" }} />

        <label style={labelStyle}>
          ✨ 시공 후 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);

            setAfterImages(
              await removeDuplicateImages(
                files,
                beforeImages
              )
            );
          }}
        />

        <FileList files={afterImages} />

        <div style={{ height: "20px" }} />

        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="시공 부위"
          style={inputStyle}
        />

        <div style={{ height: "12px" }} />

        <input
          type="number"
          value={actualCost}
          onChange={(e) => setActualCost(e.target.value)}
          placeholder="실제 시공금액"
          style={inputStyle}
        />

        <div style={{ height: "12px" }} />

        <input
          type="text"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="사용 자재"
          style={inputStyle}
        />

        <div style={{ height: "12px" }} />

        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
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
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading
            ? "AI 분석 및 저장 중..."
            : "시공 데이터 저장"}
        </button>

        {message && <p>{message}</p>}
      </section>

      <h2 style={{ marginTop: "45px" }}>
        데이터베이스 관리
      </h2>

      <section style={sectionStyle}>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="시공 부위 또는 메모 검색"
          style={inputStyle}
        />

        <button
          onClick={loadJobs}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "13px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            background: "white",
            fontWeight: "bold",
          }}
        >
          🔄 새로고침
        </button>

        <p>
          전체 {jobs.length}건 · 검색 결과 {filteredJobs.length}건
        </p>

        {jobsLoading && <p>불러오는 중...</p>}

        {jobsMessage && <p>{jobsMessage}</p>}

        {filteredJobs.map((job) => (
          <div
            key={job.id}
            style={{
              marginTop: "20px",
              padding: "18px",
              border: "1px solid #d1d5db",
              borderRadius: "16px",
            }}
          >
            <h3>{job.category || "시공건"}</h3>

            <p>
              💰{" "}
              {Number(
                job.actual_cost || 0
              ).toLocaleString()}
              원
            </p>

            {job.memo && <p>📝 {job.memo}</p>}

            {job.beforePhotos?.length > 0 && (
              <>
                <h4>📷 시공 전</h4>

                {job.beforePhotos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    editingPhotoId={editingPhotoId}
                    editPhotoType={editPhotoType}
                    setEditPhotoType={setEditPhotoType}
                    editPhotoCategory={editPhotoCategory}
                    setEditPhotoCategory={setEditPhotoCategory}
                    editPhotoSubCategory={editPhotoSubCategory}
                    setEditPhotoSubCategory={
                      setEditPhotoSubCategory
                    }
                    editPhotoDescription={editPhotoDescription}
                    setEditPhotoDescription={
                      setEditPhotoDescription
                    }
                    photoEditLoading={photoEditLoading}
                    startPhotoEdit={startPhotoEdit}
                    cancelPhotoEdit={cancelPhotoEdit}
                    savePhotoEdit={savePhotoEdit}
                    deletePhoto={deletePhoto}
                    setPreviewPhoto={setPreviewPhoto}
                    inputStyle={inputStyle}
                    labelStyle={labelStyle}
                  />
                ))}
              </>
            )}

            {job.afterPhotos?.length > 0 && (
              <>
                <h4>✨ 시공 후</h4>

                {job.afterPhotos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    editingPhotoId={editingPhotoId}
                    editPhotoType={editPhotoType}
                    setEditPhotoType={setEditPhotoType}
                    editPhotoCategory={editPhotoCategory}
                    setEditPhotoCategory={setEditPhotoCategory}
                    editPhotoSubCategory={editPhotoSubCategory}
                    setEditPhotoSubCategory={
                      setEditPhotoSubCategory
                    }
                    editPhotoDescription={editPhotoDescription}
                    setEditPhotoDescription={
                      setEditPhotoDescription
                    }
                    photoEditLoading={photoEditLoading}
                    startPhotoEdit={startPhotoEdit}
                    cancelPhotoEdit={cancelPhotoEdit}
                    savePhotoEdit={savePhotoEdit}
                    deletePhoto={deletePhoto}
                    setPreviewPhoto={setPreviewPhoto}
                    inputStyle={inputStyle}
                    labelStyle={labelStyle}
                  />
                ))}
              </>
            )}

            <button
              onClick={() => startEdit(job)}
              style={{
                width: "100%",
                marginTop: "10px",
                padding: "13px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background: "white",
                fontWeight: "bold",
              }}
            >
              ✏️ 시공정보 수정
            </button>

            <button
              onClick={() => deleteJob(job)}
              style={{
                width: "100%",
                marginTop: "7px",
                padding: "13px",
                border: "none",
                borderRadius: "10px",
                background: "#b91c1c",
                color: "white",
                fontWeight: "bold",
              }}
            >
              🗑️ 시공건 전체 삭제
            </button>
          </div>
        ))}
      </section>

      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <img
            src={previewPhoto.signedUrl}
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
