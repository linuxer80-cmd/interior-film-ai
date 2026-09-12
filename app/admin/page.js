"use client";

import { useEffect, useMemo, useState } from "react";
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

  // DB 관리
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsMessage, setJobsMessage] = useState("");
  const [searchText, setSearchText] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editMemo, setEditMemo] = useState("");

  useEffect(() => {
    loadSettings();
    loadJobs();
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

      if (error) throw error;

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

  // =========================
  // DB 시공건 목록
  // =========================

  async function loadJobs() {
    setJobsLoading(true);
    setJobsMessage("");

    try {
      const { data: workItems, error: workItemsError } =
        await supabase
          .from("work_items")
          .select(
            "id, category, sub_category, actual_cost, memo, created_at"
          )
          .order("created_at", { ascending: false });

      if (workItemsError) {
        throw workItemsError;
      }

      const workItemIds = (workItems || []).map(
        (item) => item.id
      );

      let photos = [];

      if (workItemIds.length > 0) {
        const { data: photoData, error: photoError } =
          await supabase
            .from("work_photos")
            .select(
              "id, work_item_id, photo_type, storage_path"
            )
            .in("work_item_id", workItemIds);

        if (photoError) {
          throw photoError;
        }

        photos = photoData || [];
      }

      const combined = (workItems || []).map((item) => {
        const linkedPhotos = photos.filter(
          (photo) => photo.work_item_id === item.id
        );

        return {
          ...item,
          photoCount: linkedPhotos.length,
          beforeCount: linkedPhotos.filter(
            (photo) => photo.photo_type === "before"
          ).length,
          afterCount: linkedPhotos.filter(
            (photo) => photo.photo_type === "after"
          ).length,
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
    setEditCost(
      job.actual_cost != null
        ? String(job.actual_cost)
        : ""
    );
    setEditMemo(job.memo || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCategory("");
    setEditCost("");
    setEditMemo("");
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
      setJobsMessage(
        "⚠️ 실제 시공금액을 정확히 입력해주세요."
      );
      return;
    }

    setJobsMessage("수정 중...");

    try {
      const { error: workItemError } = await supabase
        .from("work_items")
        .update({
          category: editCategory.trim(),
          sub_category: editCategory.trim(),
          actual_cost: costNumber,
          memo: editMemo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (workItemError) {
        throw workItemError;
      }

      // 연결된 사진의 category도 같이 맞춤
      const { error: photoError } = await supabase
        .from("work_photos")
        .update({
          category: editCategory.trim(),
        })
        .eq("work_item_id", jobId);

      if (photoError) {
        throw photoError;
      }

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

  async function deleteJob(job) {
    const ok = window.confirm(
      `${job.category || "이 시공건"}을 삭제하시겠습니까?\n\n연결된 DB 사진 정보도 함께 삭제됩니다.`
    );

    if (!ok) return;

    setJobsMessage("삭제 중...");

    try {
      // 먼저 사진 DB 행 삭제
      const { error: photoDeleteError } = await supabase
        .from("work_photos")
        .delete()
        .eq("work_item_id", job.id);

      if (photoDeleteError) {
        throw photoDeleteError;
      }

      // 그 다음 시공건 삭제
      const { error: workItemDeleteError } = await supabase
        .from("work_items")
        .delete()
        .eq("id", job.id);

      if (workItemDeleteError) {
        throw workItemDeleteError;
      }

      setJobsMessage(
        "✅ 시공 데이터가 삭제되었습니다."
      );

      await loadJobs();
    } catch (error) {
      console.error(error);
      setJobsMessage(
        `❌ 삭제 오류: ${
          error?.message || "삭제하지 못했습니다."
        }`
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
        job.actual_cost,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(keyword);
    });
  }, [jobs, searchText]);

  // =========================
  // 이미지 중복 검사
  // =========================

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

  async function removeDuplicateImages(
    newFiles,
    otherFiles = []
  ) {
    const otherHashes = new Set();

    for (const file of otherFiles) {
      otherHashes.add(await getImageHash(file));
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

  async function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          const maxSize = 1600;

          if (width > maxSize || height > maxSize) {
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

          const ctx = canvas.getContext("2d");

          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            reject(
              new Error("이미지 처리에 실패했습니다.")
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
                  { type: "image/jpeg" }
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
          new Error("사진을 불러올 수 없습니다.")
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
          ? `서버 응답 오류: ${text.slice(0, 200)}`
          : "서버에서 올바른 응답을 받지 못했습니다."
      );
    }
  }

  async function analyzeImage(file) {
    const resizedImage = await resizeImage(file);

    const formData = new FormData();
    formData.append("image", resizedImage);

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const result = await readJsonSafely(response);

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
      throw new Error(
        result?.error ||
          "임베딩 생성에 실패했습니다."
      );
    }

    return result.embedding;
  }

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
      `${typeLabel} 사진 ${index + 1}/${total} AI 분석 중...`
    );

    const aiAnalysis = await analyzeImage(image);

    let tags = Array.isArray(aiAnalysis?.tags)
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
      `${typeLabel} 사진 ${index + 1}/${total} 검색 데이터 생성 중...`
    );

    const embedding =
      await createEmbedding(searchTextValue);

    const extension =
      image.name
        .split(".")
        .pop()
        ?.toLowerCase() || "jpg";

    const filePath =
      `history/${workItemId}/${photoType}/${Date.now()}-${index}.${extension}`;

    setMessage(
      `${typeLabel} 사진 ${index + 1}/${total} 원본 저장 중...`
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
            work_item_id: workItemId,
            photo_url:
              publicUrlData.publicUrl,
            storage_path: filePath,
            photo_type: photoType,
            category: category.trim(),
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
      String(actualCost).replace(/,/g, "")
    );

    if (!costNumber || costNumber <= 0) {
      setMessage(
        "⚠️ 실제 시공금액을 입력해주세요."
      );
      return;
    }

    setMessage(
      "사진 중복 여부를 확인하고 있습니다..."
    );

    const allHashes = new Set();

    for (const file of [
      ...beforeImages,
      ...afterImages,
    ]) {
      const hash = await getImageHash(file);

      if (allHashes.has(hash)) {
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
            project_id: projectId,
            category: category.trim(),
            sub_category: category.trim(),
            actual_cost: costNumber,
            memo: memo.trim() || null,
          },
        ])
        .select("id")
        .single();

      if (workItemError) {
        throw workItemError;
      }

      const workItemId = workItemData.id;

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

      for (
        let i = 0;
        i < afterImages.length;
        i++
      ) {
        await savePhoto({
          image: afterImages[i],
          index: i,
          total: afterImages.length,
          photoType: "after",
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

        {files.map((file, index) => (
          <div key={`${file.name}-${index}`}>
            {index + 1}. {file.name}
          </div>
        ))}
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
        maxWidth: "760px",
        margin: "0 auto",
        padding: "30px 20px 60px",
        fontFamily: "Arial, sans-serif",
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

      <h1>관리자 설정</h1>

      <section
        style={{
          marginTop: "25px",
          padding: "25px",
          border: "2px solid #111827",
          borderRadius: "20px",
        }}
      >
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
          <option value={0.5}>50%</option>
          <option value={0.55}>55%</option>
          <option value={0.6}>60%</option>
          <option value={0.65}>65%</option>
          <option value={0.7}>70%</option>
          <option value={0.75}>75%</option>
        </select>

        <button
          onClick={saveSimilaritySetting}
          disabled={settingLoading}
          style={{
            width: "100%",
            marginTop: "15px",
            padding: "17px",
            border: "none",
            borderRadius: "12px",
            background: "#111827",
            color: "white",
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          유사도 기준 저장
        </button>

        {settingMessage && (
          <p>{settingMessage}</p>
        )}
      </section>

      <h1 style={{ marginTop: "45px" }}>
        과거 시공 데이터 등록
      </h1>

      <section
        style={{
          padding: "25px",
          border: "1px solid #ddd",
          borderRadius: "20px",
        }}
      >
        <label style={labelStyle}>
          📷 시공 전 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (e) => {
            const files = Array.from(
              e.target.files || []
            );

            const {
              uniqueFiles,
              duplicateCount,
            } = await removeDuplicateImages(
              files,
              afterImages
            );

            setBeforeImages(uniqueFiles);

            if (duplicateCount > 0) {
              setMessage(
                `⚠️ 동일한 사진 ${duplicateCount}장을 제외했습니다.`
              );
            }
          }}
        />

        <FileList files={beforeImages} />

        <div style={{ height: "25px" }} />

        <label style={labelStyle}>
          ✨ 시공 후 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (e) => {
            const files = Array.from(
              e.target.files || []
            );

            const {
              uniqueFiles,
              duplicateCount,
            } = await removeDuplicateImages(
              files,
              beforeImages
            );

            setAfterImages(uniqueFiles);

            if (duplicateCount > 0) {
              setMessage(
                `⚠️ 동일한 사진 ${duplicateCount}장을 제외했습니다.`
              );
            }
          }}
        />

        <FileList files={afterImages} />

        <div style={{ height: "25px" }} />

        <input
          value={category}
          onChange={(e) =>
            setCategory(e.target.value)
          }
          placeholder="시공 부위"
          style={inputStyle}
        />

        <div style={{ height: "15px" }} />

        <input
          type="number"
          value={actualCost}
          onChange={(e) =>
            setActualCost(e.target.value)
          }
          placeholder="실제 시공금액"
          style={inputStyle}
        />

        <div style={{ height: "15px" }} />

        <input
          value={material}
          onChange={(e) =>
            setMaterial(e.target.value)
          }
          placeholder="사용 자재"
          style={inputStyle}
        />

        <div style={{ height: "15px" }} />

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
          onClick={handleSave}
          disabled={loading}
          style={{
            width: "100%",
            marginTop: "20px",
            padding: "20px",
            border: "none",
            borderRadius: "14px",
            background: "#111827",
            color: "white",
            fontSize: "20px",
            fontWeight: "bold",
          }}
        >
          {loading
            ? "AI 분석 및 저장 중..."
            : "시공 전·후 데이터 저장"}
        </button>

        {message && <p>{message}</p>}
      </section>

      <h1 style={{ marginTop: "50px" }}>
        데이터베이스 관리
      </h1>

      <section
        style={{
          padding: "25px",
          border: "1px solid #ddd",
          borderRadius: "20px",
        }}
      >
        <input
          value={searchText}
          onChange={(e) =>
            setSearchText(e.target.value)
          }
          placeholder="싱크대, 중문, 메모 등 검색"
          style={inputStyle}
        />

        <button
          onClick={loadJobs}
          style={{
            width: "100%",
            marginTop: "12px",
            padding: "14px",
            borderRadius: "10px",
            border: "1px solid #ccc",
            background: "white",
            fontWeight: "bold",
          }}
        >
          새로고침
        </button>

        {jobsMessage && (
          <p>{jobsMessage}</p>
        )}

        {jobsLoading ? (
          <p>불러오는 중...</p>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job.id}
              style={{
                marginTop: "20px",
                padding: "18px",
                border: "1px solid #ddd",
                borderRadius: "14px",
              }}
            >
              {editingId === job.id ? (
                <>
                  <input
                    value={editCategory}
                    onChange={(e) =>
                      setEditCategory(
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  />

                  <div
                    style={{ height: "10px" }}
                  />

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
                    style={{ height: "10px" }}
                  />

                  <textarea
                    value={editMemo}
                    onChange={(e) =>
                      setEditMemo(
                        e.target.value
                      )
                    }
                    rows={3}
                    style={inputStyle}
                  />

                  <button
                    onClick={() =>
                      saveJobEdit(job.id)
                    }
                    style={{
                      width: "100%",
                      marginTop: "12px",
                      padding: "14px",
                      border: "none",
                      borderRadius: "10px",
                      background: "#111827",
                      color: "white",
                      fontWeight: "bold",
                    }}
                  >
                    수정 저장
                  </button>

                  <button
                    onClick={cancelEdit}
                    style={{
                      width: "100%",
                      marginTop: "8px",
                      padding: "12px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: "white",
                    }}
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <h3>
                    {job.category ||
                      "시공 부위 없음"}
                  </h3>

                  <p>
                    실제 시공금액:{" "}
                    {Number(
                      job.actual_cost || 0
                    ).toLocaleString()}
                    원
                  </p>

                  <p>
                    시공 전 {job.beforeCount}장 ·
                    시공 후 {job.afterCount}장
                  </p>

                  {job.memo && (
                    <p>메모: {job.memo}</p>
                  )}

                  <button
                    onClick={() =>
                      startEdit(job)
                    }
                    style={{
                      width: "100%",
                      marginTop: "10px",
                      padding: "13px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: "white",
                      fontWeight: "bold",
                    }}
                  >
                    수정
                  </button>

                  <button
                    onClick={() =>
                      deleteJob(job)
                    }
                    style={{
                      width: "100%",
                      marginTop: "8px",
                      padding: "13px",
                      borderRadius: "10px",
                      border: "none",
                      background: "#b91c1c",
                      color: "white",
                      fontWeight: "bold",
                    }}
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
                           }
