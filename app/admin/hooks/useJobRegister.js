"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";
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
  onSaved,
}) {
  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);

  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function normalizeFileList(files) {
    if (!files) return [];

    return Array.from(files).filter(
      (file) =>
        file &&
        typeof file.type === "string" &&
        file.type.startsWith("image/"),
    );
  }

  function handleBeforeFiles(event) {
    const files = normalizeFileList(
      event?.target?.files,
    );

    if (files.length === 0) {
      return;
    }

    setBeforeImages((current) => [
      ...current,
      ...files,
    ]);

    if (event?.target) {
      event.target.value = "";
    }
  }

  function handleAfterFiles(event) {
    const files = normalizeFileList(
      event?.target?.files,
    );

    if (files.length === 0) {
      return;
    }

    setAfterImages((current) => [
      ...current,
      ...files,
    ]);

    if (event?.target) {
      event.target.value = "";
    }
  }

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

  async function handleSave() {
    if (loading) return;

    if (!companyId) {
      setMessage(
        "❌ 회사 정보를 확인할 수 없습니다.",
      );
      return;
    }

    const cleanCategory =
      category.trim();

    const cleanMaterial =
      material.trim();

    const cleanMemo =
      memo.trim();

    const cost = Number(
      String(actualCost).replace(
        /,/g,
        "",
      ),
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
      "시공 데이터를 저장하고 있습니다...",
    );

    let workItemId = null;

    try {
      /*
       * 로그인한 업체의 프로젝트를 사용한다.
       * 기존 프로젝트가 없으면 현재 업체의 프로젝트를 생성한다.
       */
      let companyProjectId = null;

      const {
        data: existingProject,
        error: projectFindError,
      } = await supabase
        .from("projects")
        .select("id")
        .eq(
          "company_id",
          companyId,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        )
        .limit(1)
        .maybeSingle();

      if (projectFindError) {
        throw projectFindError;
      }

      if (existingProject?.id) {
        companyProjectId =
          existingProject.id;
      } else {
        const {
          data: newProject,
          error: projectCreateError,
        } = await supabase
          .from("projects")
          .insert({
            company_id:
              companyId,
          })
          .select("id")
          .single();

        if (projectCreateError) {
          throw projectCreateError;
        }

        companyProjectId =
          newProject?.id || null;
      }

      if (!companyProjectId) {
        throw new Error(
          "업체 프로젝트를 확인하지 못했습니다.",
        );
      }

      /*
       * 시공 데이터 생성
       */
      const {
        data: workItem,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert({
          company_id:
            companyId,

          project_id:
            companyProjectId,

          category:
            cleanCategory,

          sub_category:
            cleanCategory,

          actual_cost:
            cost,

          memo:
            cleanMemo || null,
        })
        .select("id")
        .single();

      if (workItemError) {
        throw workItemError;
      }

      workItemId =
        workItem?.id;

      if (!workItemId) {
        throw new Error(
          "시공 데이터 ID를 만들지 못했습니다.",
        );
      }

      /*
       * 사진 1장 저장
       */
      async function savePhoto(
        file,
        photoType,
        index,
      ) {
        const resizedFile =
          await resizeImage(file);

        /*
         * AI 사진 분석
         */
        let analysis = null;

        try {
          analysis =
            await analyzeImage(
              resizedFile,
            );
        } catch (analysisError) {
          console.error(
            "사진 AI 분석:",
            analysisError,
          );
        }

        /*
         * 이미지 해시
         */
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

        const description =
          analysis?.description ||
          analysis?.ai_description ||
          "";

        const tags =
          Array.isArray(
            analysis?.tags,
          )
            ? analysis.tags
            : Array.isArray(
                  analysis?.ai_tags,
                )
              ? analysis.ai_tags
              : [];

        /*
         * 임베딩 생성
         */
        let embedding = null;

        try {
          const embeddingText = [
            cleanCategory,
            cleanMaterial,
            description,
            ...tags,
          ]
            .filter(Boolean)
            .join(" ");

          if (embeddingText) {
            embedding =
              await createEmbedding(
                embeddingText,
              );
          }
        } catch (embeddingError) {
          console.error(
            "임베딩 생성:",
            embeddingError,
          );
        }

        /*
         * 확장자 정리
         */
        const originalName =
          String(
            resizedFile?.name ||
              file?.name ||
              "",
          );

        const extensionMatch =
          originalName.match(
            /\.([a-zA-Z0-9]+)$/,
          );

        let safeExtension =
          extensionMatch?.[1]
            ?.toLowerCase() ||
          "jpg";

        if (
          ![
            "jpg",
            "jpeg",
            "png",
            "webp",
          ].includes(
            safeExtension,
          )
        ) {
          safeExtension =
            "jpg";
        }

        /*
         * 신규 SaaS Storage 구조
         *
         * history/{companyId}/...
         */
        const storagePath =
          `history/${companyId}/${Date.now()}_${workItemId}_${photoType}_${index}.${safeExtension}`;

        /*
         * Storage 업로드
         */
        const {
          error: uploadError,
        } = await supabase.storage
          .from("work-photos")
          .upload(
            storagePath,
            resizedFile,
            {
              cacheControl:
                "3600",
              upsert:
                false,
            },
          );

        if (uploadError) {
          throw uploadError;
        }

        /*
         * 사진 DB 저장
         */
        const {
          error: photoInsertError,
        } = await supabase
          .from("work_photos")
          .insert({
            company_id:
              companyId,

            project_id:
              companyProjectId,

            work_item_id:
              workItemId,

            photo_url:
              storagePath,

            storage_path:
              storagePath,

            photo_type:
              photoType,

            category:
              analysis?.category ||
              cleanCategory,

            sub_category:
              analysis?.sub_category ||
              cleanCategory,

            material_id:
              cleanMaterial || null,

            ai_description:
              description || null,

            ai_tags:
              tags,

            embedding:
              embedding,

            image_hash:
              imageHash || null,
          });

        /*
         * DB 저장 실패 시
         * 업로드한 Storage 파일 제거
         */
        if (photoInsertError) {
          try {
            await supabase.storage
              .from("work-photos")
              .remove([
                storagePath,
              ]);
          } catch {}

          throw photoInsertError;
        }
      }

      /*
       * 시공 전 사진
       */
      for (
        let index = 0;
        index <
        beforeImages.length;
        index += 1
      ) {
        await savePhoto(
          beforeImages[index],
          "before",
          index,
        );
      }

      /*
       * 시공 후 사진
       */
      for (
        let index = 0;
        index <
        afterImages.length;
        index += 1
      ) {
        await savePhoto(
          afterImages[index],
          "after",
          index,
        );
      }

      /*
       * 전/후 사진이 모두 있으면
       * AI 비교 실행
       */
      if (
        beforeImages.length > 0 &&
        afterImages.length > 0
      ) {
        try {
          const comparison =
            await compareMultipleBeforeAfter(
              beforeImages,
              afterImages,
            );

          if (comparison) {
            const comparisonText =
              typeof comparison ===
              "string"
                ? comparison
                : comparison
                    ?.description ||
                  comparison
                    ?.summary ||
                  "";

            if (comparisonText) {
              const mergedMemo = [
                cleanMemo,
                comparisonText,
              ]
                .filter(Boolean)
                .join("\n");

              const {
                error: updateError,
              } = await supabase
                .from(
                  "work_items",
                )
                .update({
                  memo:
                    mergedMemo ||
                    null,
                })
                .eq(
                  "id",
                  workItemId,
                )
                .eq(
                  "company_id",
                  companyId,
                );

              if (updateError) {
                console.error(
                  "전후 비교 저장:",
                  updateError,
                );
              }
            }
          }
        } catch (compareError) {
          console.error(
            "전후 사진 비교:",
            compareError,
          );
        }
      }

      /*
       * 등록 완료
       */
      setMessage(
        "✅ 시공 데이터와 사진이 저장되었습니다.",
      );

      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");

      setBeforeImages([]);
      setAfterImages([]);

      /*
       * 시공 DB 새로고침
       */
      if (
        typeof loadJobs ===
        "function"
      ) {
        await loadJobs(
          1,
          jobSearchApplied || "",
        );
      }

      /*
       * page.js가 화면 전환을 담당
       */
      if (
        typeof onSaved ===
        "function"
      ) {
        onSaved();
      }
    } catch (error) {
      console.error(
        "시공 등록:",
        error,
      );

      /*
       * 사진 저장 도중 실패했다면
       * 만들어진 시공 데이터 정리
       */
      if (workItemId) {
        try {
          const {
            data: savedPhotos,
          } = await supabase
            .from(
              "work_photos",
            )
            .select(
              "storage_path",
            )
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "work_item_id",
              workItemId,
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
              .filter(Boolean);

          /*
           * Storage 정리
           */
          if (
            paths.length > 0
          ) {
            await supabase.storage
              .from(
                "work-photos",
              )
              .remove(paths);
          }

          /*
           * work_photos 정리
           */
          await supabase
            .from(
              "work_photos",
            )
            .delete()
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "work_item_id",
              workItemId,
            );

          /*
           * work_items 정리
           */
          await supabase
            .from(
              "work_items",
            )
            .delete()
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "id",
              workItemId,
            );
        } catch (cleanupError) {
          console.error(
            "시공 등록 실패 후 정리:",
            cleanupError,
          );
        }
      }

      setMessage(
        `❌ 오류: ${
          error?.message ||
          "저장에 실패했습니다."
        }`,
      );
    } finally {
      setLoading(false);
    }
  }

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
