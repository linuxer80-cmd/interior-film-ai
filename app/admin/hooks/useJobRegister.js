"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { PROJECT_ID } from "../adminConstants";
import {
  resizeImage,
  getImageHash,
} from "../imageUtils";
import {
  createEmbedding,
  analyzeImage,
  compareMultipleBeforeAfter,
} from "../aiUtils";

export default function useJobRegister({
  companyId,
  loadJobs,
  jobSearchApplied,
}) {
  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);

  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  /* =========================================================
     이미지 파일 정리
  ========================================================= */

  function normalizeFileList(files) {
    if (!files) return [];

    return Array.from(files).filter(
      (file) =>
        file &&
        typeof file.type === "string" &&
        file.type.startsWith("image/"),
    );
  }

  /* =========================================================
     시공 전 사진 선택
  ========================================================= */

  function handleBeforeFiles(event) {
    const files = normalizeFileList(
      event?.target?.files,
    );

    if (files.length === 0) return;

    setBeforeImages((current) => [
      ...current,
      ...files,
    ]);

    if (event?.target) {
      event.target.value = "";
    }
  }

  /* =========================================================
     시공 후 사진 선택
  ========================================================= */

  function handleAfterFiles(event) {
    const files = normalizeFileList(
      event?.target?.files,
    );

    if (files.length === 0) return;

    setAfterImages((current) => [
      ...current,
      ...files,
    ]);

    if (event?.target) {
      event.target.value = "";
    }
  }

  /* =========================================================
     사진 제거
  ========================================================= */

  function removeBeforeImage(index) {
    setBeforeImages((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index,
      ),
    );
  }

  function removeAfterImage(index) {
    setAfterImages((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index,
      ),
    );
  }

  /* =========================================================
     시공 등록
  ========================================================= */

  async function handleSave() {
    if (loading) return;

    if (!companyId) {
      setMessage(
        "❌ 업체 정보를 확인할 수 없습니다.",
      );
      return;
    }

    const cleanCategory =
      String(category || "").trim();

    const cleanMaterial =
      String(material || "").trim();

    const cleanMemo =
      String(memo || "").trim();

    const cost = Number(
      String(actualCost || "")
        .replace(/,/g, "")
        .trim(),
    );

    if (!cleanCategory) {
      setMessage(
        "⚠️ 시공 부위를 입력해주세요.",
      );
      return;
    }

    if (
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      setMessage(
        "⚠️ 실제 시공금액을 입력해주세요.",
      );
      return;
    }

    if (
      beforeImages.length === 0 &&
      afterImages.length === 0
    ) {
      setMessage(
        "⚠️ 시공 전 또는 시공 후 사진을 1장 이상 등록해주세요.",
      );
      return;
    }

    setLoading(true);

    setMessage(
      "사진을 분석하고 시공 데이터를 저장하고 있습니다...",
    );

    let workItemId = null;

    try {
      /* =====================================================
         1. work_items 생성
      ===================================================== */

      const {
        data: workItem,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert({
          company_id: companyId,
          project_id: PROJECT_ID,
          category: cleanCategory,
          sub_category: cleanCategory,
          actual_cost: cost,
          memo: cleanMemo || null,
        })
        .select("id")
        .single();

      if (workItemError) {
        throw workItemError;
      }

      workItemId = workItem?.id;

      if (!workItemId) {
        throw new Error(
          "시공 데이터 ID를 생성하지 못했습니다.",
        );
      }

      /* =====================================================
         2. 사진 한 장 저장 함수
      ===================================================== */

      const savePhoto = async (
        file,
        photoType,
        index,
      ) => {
        if (!file) return;

        let resizedFile = file;

        /* -----------------------------------------------------
           이미지 리사이즈
        ----------------------------------------------------- */

        try {
          resizedFile =
            await resizeImage(file);
        } catch (resizeError) {
          console.error(
            "이미지 리사이즈:",
            resizeError,
          );

          resizedFile = file;
        }

        /* -----------------------------------------------------
           이미지 해시
        ----------------------------------------------------- */

        let imageHash = null;

        try {
          imageHash =
            await getImageHash(
              resizedFile,
            );
        } catch (hashError) {
          console.error(
            "이미지 해시:",
            hashError,
          );
        }

        /* -----------------------------------------------------
           확장자
        ----------------------------------------------------- */

        const extension =
          String(
            resizedFile?.name ||
              file?.name ||
              "",
          )
            .split(".")
            .pop()
            ?.toLowerCase() ||
          "jpg";

        const safeExtension =
          extension === "jpeg"
            ? "jpg"
            : extension;

        /* -----------------------------------------------------
           Storage 경로
        ----------------------------------------------------- */

        const storagePath =
          `history/${companyId}/${Date.now()}_${workItemId}_${photoType}_${index}.${safeExtension}`;

        /* -----------------------------------------------------
           Storage 업로드
        ----------------------------------------------------- */

        const {
          error: uploadError,
        } =
          await supabase.storage
            .from("work-photos")
            .upload(
              storagePath,
              resizedFile,
              {
                cacheControl:
                  "3600",

                upsert: false,

                contentType:
                  resizedFile.type ||
                  file.type ||
                  "image/jpeg",
              },
            );

        if (uploadError) {
          throw uploadError;
        }

        /* -----------------------------------------------------
           AI 사진 분석
        ----------------------------------------------------- */

        let aiResult = null;

        try {
          aiResult =
            await analyzeImage(
              resizedFile,
              photoType,
            );
        } catch (
          analysisError
        ) {
          console.error(
            "사진 AI 분석:",
            analysisError,
          );
        }

        /* -----------------------------------------------------
           AI 설명
        ----------------------------------------------------- */

        const aiDescription =
          String(
            aiResult?.description ||
              aiResult?.ai_description ||
              "",
          ).trim();

        /* -----------------------------------------------------
           AI 태그
        ----------------------------------------------------- */

        const aiTags =
          Array.isArray(
            aiResult?.tags,
          )
            ? aiResult.tags
            : Array.isArray(
                  aiResult?.ai_tags,
                )
              ? aiResult.ai_tags
              : [];

        /* -----------------------------------------------------
           카테고리
        ----------------------------------------------------- */

        const detectedCategory =
          String(
            aiResult?.category ||
              cleanCategory,
          ).trim() ||
          cleanCategory;

        const detectedSubCategory =
          String(
            aiResult?.sub_category ||
              aiResult?.subcategory ||
              detectedCategory,
          ).trim() ||
          detectedCategory;

        /* -----------------------------------------------------
           임베딩 생성
        ----------------------------------------------------- */

        let embedding = null;

        try {
          const embeddingText = [
            detectedCategory,
            detectedSubCategory,
            aiDescription,
            ...aiTags,
          ]
            .filter(Boolean)
            .join(" ");

          if (embeddingText) {
            embedding =
              await createEmbedding(
                embeddingText,
              );
          }
        } catch (
          embeddingError
        ) {
          console.error(
            "임베딩 생성:",
            embeddingError,
          );
        }

        /* -----------------------------------------------------
           work_photos 저장
        ----------------------------------------------------- */

        const {
          error:
            photoInsertError,
        } = await supabase
          .from("work_photos")
          .insert({
            company_id:
              companyId,

            project_id:
              PROJECT_ID,

            work_item_id:
              workItemId,

            photo_type:
              photoType,

            category:
              detectedCategory,

            sub_category:
              detectedSubCategory,

            storage_path:
              storagePath,

            photo_url: null,

            ai_description:
              aiDescription ||
              null,

            ai_tags:
              aiTags.length > 0
                ? aiTags
                : null,

            embedding:
              embedding ||
              null,

            image_hash:
              imageHash ||
              null,
          });

        /* -----------------------------------------------------
           DB 저장 실패 시 Storage 사진 삭제
        ----------------------------------------------------- */

        if (
          photoInsertError
        ) {
          try {
            await supabase.storage
              .from(
                "work-photos",
              )
              .remove([
                storagePath,
              ]);
          } catch {}

          throw photoInsertError;
        }
      };

      /* =====================================================
         3. 시공 전 사진 저장
      ===================================================== */

      for (
        let index = 0;
        index <
        beforeImages.length;
        index += 1
      ) {
        setMessage(
          `시공 전 사진 ${
            index + 1
          }/${beforeImages.length} 저장 중...`,
        );

        await savePhoto(
          beforeImages[index],
          "before",
          index,
        );
      }

      /* =====================================================
         4. 시공 후 사진 저장
      ===================================================== */

      for (
        let index = 0;
        index <
        afterImages.length;
        index += 1
      ) {
        setMessage(
          `시공 후 사진 ${
            index + 1
          }/${afterImages.length} 저장 중...`,
        );

        await savePhoto(
          afterImages[index],
          "after",
          index,
        );
      }

      /* =====================================================
         5. 전 / 후 비교
      ===================================================== */

      if (
        beforeImages.length >
          0 &&
        afterImages.length >
          0
      ) {
        try {
          await compareMultipleBeforeAfter(
            beforeImages,
            afterImages,
          );
        } catch (
          compareError
        ) {
          console.error(
            "전후 비교:",
            compareError,
          );
        }
      }

      /* =====================================================
         6. 입력값 초기화
      ===================================================== */

      setBeforeImages([]);
      setAfterImages([]);

      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");

      setMessage(
        "✅ 시공 데이터가 저장되었습니다.",
      );

      /* =====================================================
         7. 시공 DB 새로고침
      ===================================================== */

      if (
        typeof loadJobs ===
        "function"
      ) {
        await loadJobs(
          1,
          jobSearchApplied,
        );
      }
    } catch (error) {
      console.error(
        "시공 등록:",
        error,
      );

      /* =====================================================
         실패 시 생성된 데이터 정리
      ===================================================== */

      if (workItemId) {
        try {
          const {
            data:
              savedPhotos,
          } =
            await supabase
              .from(
                "work_photos",
              )
              .select(
                "id, storage_path",
              )
              .eq(
                "work_item_id",
                workItemId,
              )
              .eq(
                "company_id",
                companyId,
              );

          const paths =
            (
              savedPhotos ||
              []
            )
              .map(
                (photo) =>
                  photo.storage_path,
              )
              .filter(
                Boolean,
              );

          /* ---------------------------------------------------
             Storage 정리
          --------------------------------------------------- */

          if (
            paths.length >
            0
          ) {
            await supabase.storage
              .from(
                "work-photos",
              )
              .remove(
                paths,
              );
          }

          /* ---------------------------------------------------
             work_photos 정리
          --------------------------------------------------- */

          await supabase
            .from(
              "work_photos",
            )
            .delete()
            .eq(
              "work_item_id",
              workItemId,
            )
            .eq(
              "company_id",
              companyId,
            );

          /* ---------------------------------------------------
             work_items 정리
          --------------------------------------------------- */

          await supabase
            .from(
              "work_items",
            )
            .delete()
            .eq(
              "id",
              workItemId,
            )
            .eq(
              "company_id",
              companyId,
            );
        } catch (
          cleanupError
        ) {
          console.error(
            "시공 등록 실패 후 정리:",
            cleanupError,
          );
        }
      }

      setMessage(
        `❌ 저장 오류: ${
          error?.message ||
          "시공 데이터 저장에 실패했습니다."
        }`,
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     외부에서 사용할 값
  ========================================================= */

  return {
    beforeImages,
    setBeforeImages,

    afterImages,
    setAfterImages,

    category,
    setCategory,

    actualCost,
    setActualCost,

    material,
    setMaterial,

    memo,
    setMemo,

    message,
    setMessage,

    loading,

    handleBeforeFiles,
    handleAfterFiles,

    removeBeforeImage,
    removeAfterImage,

    handleSave,
  };
      }
