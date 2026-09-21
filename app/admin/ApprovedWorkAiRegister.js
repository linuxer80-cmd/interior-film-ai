"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  resizeImage,
  getImageHash,
} from "./imageUtils";
import {
  analyzeImage,
  createEmbedding,
} from "./aiUtils";
import { PROJECT_ID } from "./adminConstants";

export default function ApprovedWorkAiRegister({
  siteId,
  report,
  materials = [],
  beforePhotos = [],
  afterPhotos = [],
  onRegistered,
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!siteId || !report) {
    return null;
  }

  const reviewStatus =
    String(report?.review_status || "").trim();

  const alreadyRegistered =
    Boolean(report?.ai_registered_at) ||
    Boolean(report?.ai_work_item_id);

  if (reviewStatus !== "approved") {
    return null;
  }

  async function storagePhotoToFile(
    photo,
    photoType,
    index
  ) {
    const storagePath =
      String(photo?.storage_path || "").trim();

    if (!storagePath) {
      throw new Error(
        `${
          photoType === "before"
            ? "시공 전"
            : "시공 후"
        } 사진의 저장 경로가 없습니다.`
      );
    }

    const {
      data,
      error,
    } = await supabase.storage
      .from("work-photos")
      .download(storagePath);

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        "사진 파일을 불러오지 못했습니다."
      );
    }

    const contentType =
      data.type || "image/jpeg";

    let extension = "jpg";

    if (contentType.includes("png")) {
      extension = "png";
    } else if (contentType.includes("webp")) {
      extension = "webp";
    } else if (
      contentType.includes("jpeg") ||
      contentType.includes("jpg")
    ) {
      extension = "jpg";
    }

    return new File(
      [data],
      `${photoType}-${index}.${extension}`,
      {
        type: contentType,
      }
    );
  }

  function buildMaterialText() {
    if (
      !Array.isArray(materials) ||
      materials.length === 0
    ) {
      return "";
    }

    return materials
      .map((item) => {
        const brand =
          String(item?.brand || "").trim();

        const productCode =
          String(
            item?.product_code || ""
          ).trim();

        const productName =
          String(
            item?.product_name || ""
          ).trim();

        const quantity =
          item?.quantity !== null &&
          item?.quantity !== undefined &&
          item?.quantity !== ""
            ? String(item.quantity)
            : "";

        const unit =
          String(item?.unit || "").trim();

        const name = [
          brand,
          productCode,
          productName,
        ]
          .filter(Boolean)
          .join(" ");

        const amount = [
          quantity,
          unit,
        ]
          .filter(Boolean)
          .join("");

        return [
          name,
          amount,
        ]
          .filter(Boolean)
          .join(" / ");
      })
      .filter(Boolean)
      .join(", ");
  }

  async function registerPhoto({
    companyId,
    workItemId,
    photo,
    photoType,
    index,
    fallbackCategory,
  }) {
    const originalFile =
      await storagePhotoToFile(
        photo,
        photoType,
        index
      );

    let resizedFile = originalFile;

    try {
      resizedFile =
        await resizeImage(originalFile);
    } catch (error) {
      console.error(
        "이미지 리사이즈:",
        error
      );

      resizedFile = originalFile;
    }

    let imageHash = null;

    try {
      imageHash =
        await getImageHash(resizedFile);
    } catch (error) {
      console.error(
        "이미지 해시:",
        error
      );
    }

    if (imageHash) {
      const {
        data: duplicatePhotos,
        error: duplicateError,
      } = await supabase
        .from("work_photos")
        .select("id")
        .eq(
          "company_id",
          companyId
        )
        .eq(
          "image_hash",
          imageHash
        )
        .limit(1);

      if (duplicateError) {
        throw duplicateError;
      }

      if (
        duplicatePhotos &&
        duplicatePhotos.length > 0
      ) {
        return {
          skipped: true,
          reason: "duplicate",
        };
      }
    }

    let aiResult = null;

    try {
      aiResult =
        await analyzeImage(
          resizedFile,
          photoType
        );
    } catch (error) {
      console.error(
        "사진 AI 분석:",
        error
      );
    }

    const aiDescription =
      String(
        aiResult?.description ||
          aiResult?.ai_description ||
          ""
      ).trim();

    let aiTags =
      Array.isArray(aiResult?.tags)
        ? [...aiResult.tags]
        : Array.isArray(
              aiResult?.ai_tags
            )
          ? [...aiResult.ai_tags]
          : [];

    if (photoType === "before") {
      aiTags.push("시공전");
    }

    if (photoType === "after") {
      aiTags.push("시공후");
    }

    aiTags = [
      ...new Set(
        aiTags.filter(Boolean)
      ),
    ];

    const detectedCategory =
      String(
        aiResult?.category ||
          fallbackCategory ||
          "기타"
      ).trim() || "기타";

    const detectedSubCategory =
      String(
        aiResult?.sub_category ||
          aiResult?.subcategory ||
          detectedCategory
      ).trim() || detectedCategory;

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
            embeddingText
          );
      }
    } catch (error) {
      console.error(
        "임베딩 생성:",
        error
      );
    }

    const extension =
      String(
        resizedFile?.name ||
          originalFile?.name ||
          ""
      )
        .split(".")
        .pop()
        ?.toLowerCase() ||
      "jpg";

    const safeExtension =
      ["jpg", "jpeg", "png", "webp"].includes(
        extension
      )
        ? extension === "jpeg"
          ? "jpg"
          : extension
        : "jpg";

    const storagePath =
      `history/${companyId}/${Date.now()}_${workItemId}_${photoType}_${index}.${safeExtension}`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("work-photos")
      .upload(
        storagePath,
        resizedFile,
        {
          cacheControl: "3600",
          upsert: false,
          contentType:
            resizedFile.type ||
            "image/jpeg",
        }
      );

    if (uploadError) {
      throw uploadError;
    }

    const {
      error: insertError,
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

        photo_url:
          null,

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

    if (insertError) {
      try {
        await supabase.storage
          .from("work-photos")
          .remove([
            storagePath,
          ]);
      } catch {}

      throw insertError;
    }

    return {
      skipped: false,
    };
  }

  async function registerApprovedWork() {
    if (loading) return;

    if (alreadyRegistered) {
      setMessage(
        "✅ 이미 AI 견적자료로 등록된 완료보고입니다."
      );
      return;
    }

    const approvedAmount =
      Number(
        String(
          report?.approved_amount ??
            ""
        )
          .replace(/,/g, "")
          .trim()
      );

    if (
      !Number.isFinite(
        approvedAmount
      ) ||
      approvedAmount <= 0
    ) {
      setMessage(
        "❌ 관리자 승인금액을 확인할 수 없습니다."
      );
      return;
    }

    if (
      beforePhotos.length === 0 &&
      afterPhotos.length === 0
    ) {
      setMessage(
        "❌ AI 자료로 등록할 시공 사진이 없습니다."
      );
      return;
    }

    const confirmed =
      window.confirm(
        "관리자 승인이 완료된 시공자료를 AI 견적 DB에 등록할까요?\n\n등록 후 시공사진 분석과 임베딩 생성이 진행됩니다."
      );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setMessage(
      "AI 견적자료 등록을 준비하고 있습니다..."
    );

    let workItemId = null;
    let companyId = null;

    try {
      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const user =
        authData?.user;

      if (!user?.id) {
        throw new Error(
          "관리자 로그인이 필요합니다."
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "company_id, is_active"
        )
        .eq(
          "id",
          user.id
        )
        .single();

      if (profileError) {
        throw profileError;
      }

      if (
        !profile?.is_active ||
        !profile?.company_id
      ) {
        throw new Error(
          "관리자 업체 정보를 확인할 수 없습니다."
        );
      }

      companyId =
        profile.company_id;

      const {
        data: latestReport,
        error: reportError,
      } = await supabase
        .from("work_reports")
        .select(
          `
          id,
          company_id,
          site_id,
          review_status,
          approved_amount,
          work_region,
          work_summary,
          memo,
          ai_registered_at,
          ai_work_item_id
        `
        )
        .eq(
          "id",
          report.id
        )
        .eq(
          "company_id",
          companyId
        )
        .eq(
          "site_id",
          siteId
        )
        .single();

      if (reportError) {
        throw reportError;
      }

      if (
        latestReport?.review_status !==
        "approved"
      ) {
        throw new Error(
          "관리자 승인이 완료된 보고서만 AI 자료로 등록할 수 있습니다."
        );
      }

      if (
        latestReport?.ai_registered_at ||
        latestReport?.ai_work_item_id
      ) {
        setMessage(
          "✅ 이미 AI 견적자료로 등록된 완료보고입니다."
        );

        if (
          typeof onRegistered ===
          "function"
        ) {
          onRegistered({
            workItemId:
              latestReport
                ?.ai_work_item_id ||
              null,
          });
        }

        return;
      }

      const category =
        String(
          latestReport
            ?.work_summary ||
            "기타"
        ).trim() ||
        "기타";

      const materialText =
        buildMaterialText();

      const memoParts = [
        latestReport
          ?.work_region
          ? `시공지역: ${latestReport.work_region}`
          : "",

        materialText
          ? `사용자재: ${materialText}`
          : "",

        latestReport
          ?.memo
          ? `완료보고: ${latestReport.memo}`
          : "",

        `현장ID: ${siteId}`,

        `완료보고ID: ${latestReport.id}`,
      ].filter(Boolean);

      setMessage(
        "시공 데이터를 생성하고 있습니다..."
      );

      const {
        data: workItem,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert({
          company_id:
            companyId,

          project_id:
            PROJECT_ID,

          category:
            category,

          sub_category:
            category,

          actual_cost:
            Number(
              latestReport
                .approved_amount
            ),

          memo:
            memoParts.join(
              "\n"
            ) || null,
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
          "AI 시공 데이터 ID를 생성하지 못했습니다."
        );
      }

      let savedCount = 0;
      let duplicateCount = 0;

      for (
        let index = 0;
        index <
        beforePhotos.length;
        index += 1
      ) {
        setMessage(
          `시공 전 사진 ${
            index + 1
          }/${beforePhotos.length} AI 분석 중...`
        );

        const result =
          await registerPhoto({
            companyId,
            workItemId,
            photo:
              beforePhotos[index],
            photoType:
              "before",
            index,
            fallbackCategory:
              category,
          });

        if (
          result?.skipped
        ) {
          duplicateCount += 1;
        } else {
          savedCount += 1;
        }
      }

      for (
        let index = 0;
        index <
        afterPhotos.length;
        index += 1
      ) {
        setMessage(
          `시공 후 사진 ${
            index + 1
          }/${afterPhotos.length} AI 분석 중...`
        );

        const result =
          await registerPhoto({
            companyId,
            workItemId,
            photo:
              afterPhotos[index],
            photoType:
              "after",
            index,
            fallbackCategory:
              category,
          });

        if (
          result?.skipped
        ) {
          duplicateCount += 1;
        } else {
          savedCount += 1;
        }
      }

      if (savedCount === 0) {
        throw new Error(
          duplicateCount > 0
            ? "모든 사진이 기존 AI DB에 이미 등록되어 있습니다."
            : "AI DB에 저장된 사진이 없습니다."
        );
      }

      setMessage(
        "AI 견적자료 등록을 마무리하고 있습니다..."
      );

      const now =
        new Date().toISOString();

      const {
        data: linkedReport,
        error: linkError,
      } = await supabase
        .from("work_reports")
        .update({
          ai_work_item_id:
            workItemId,

          ai_registered_at:
            now,

          updated_at:
            now,
        })
        .eq(
          "id",
          latestReport.id
        )
        .eq(
          "company_id",
          companyId
        )
        .eq(
          "review_status",
          "approved"
        )
        .is(
          "ai_registered_at",
          null
        )
        .is(
          "ai_work_item_id",
          null
        )
        .select(
          "id, ai_work_item_id, ai_registered_at"
        );

      if (linkError) {
        throw linkError;
      }

      if (
        !linkedReport ||
        linkedReport.length !== 1
      ) {
        throw new Error(
          "다른 등록 작업이 먼저 처리되었거나 완료보고 연결에 실패했습니다."
        );
      }

      setMessage(
        `✅ AI 견적자료 등록 완료 · 사진 ${savedCount}장${
          duplicateCount > 0
            ? ` · 중복 ${duplicateCount}장 제외`
            : ""
        }`
      );

      if (
        typeof onRegistered ===
        "function"
      ) {
        onRegistered({
          workItemId,
          registeredAt:
            now,
        });
      }
    } catch (error) {
      console.error(
        "승인 시공 AI 등록:",
        error
      );

      if (
        workItemId &&
        companyId
      ) {
        try {
          const {
            data: savedPhotos,
          } = await supabase
            .from("work_photos")
            .select(
              "id, storage_path"
            )
            .eq(
              "company_id",
              companyId
            )
            .eq(
              "work_item_id",
              workItemId
            );

          const paths =
            (
              savedPhotos ||
              []
            )
              .map(
                (item) =>
                  item.storage_path
              )
              .filter(Boolean);

          if (
            paths.length > 0
          ) {
            await supabase.storage
              .from(
                "work-photos"
              )
              .remove(paths);
          }

          await supabase
            .from(
              "work_photos"
            )
            .delete()
            .eq(
              "company_id",
              companyId
            )
            .eq(
              "work_item_id",
              workItemId
            );

          await supabase
            .from(
              "work_items"
            )
            .delete()
            .eq(
              "company_id",
              companyId
            )
            .eq(
              "id",
              workItemId
            );
        } catch (
          cleanupError
        ) {
          console.error(
            "AI 등록 실패 데이터 정리:",
            cleanupError
          );
        }
      }

      setMessage(
        `❌ AI 견적자료 등록 오류: ${
          error?.message ||
          "등록 실패"
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        marginTop: "14px",
        padding: "14px",
        border:
          "1px solid #d1d5db",
        borderRadius: "12px",
        background:
          alreadyRegistered
            ? "#f0fdf4"
            : "#f8fafc",
      }}
    >
      <div
        style={{
          fontWeight: 800,
          marginBottom: "6px",
        }}
      >
        🤖 AI 견적자료
      </div>

      {alreadyRegistered ? (
        <>
          <div
            style={{
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            🟢 AI 견적자료로
            등록되었습니다.
          </div>

          {report?.ai_registered_at && (
            <div
              style={{
                marginTop: "5px",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              등록일:{" "}
              {new Date(
                report.ai_registered_at
              ).toLocaleString(
                "ko-KR",
                {
                  timeZone:
                    "Asia/Seoul",
                }
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: "14px",
              lineHeight: 1.6,
              marginBottom: "10px",
            }}
          >
            관리자 검수가 완료된
            시공자료입니다.
            시공 전·후 사진을 분석하여
            기존 AI 견적 DB에
            등록할 수 있습니다.
          </div>

          <button
            type="button"
            onClick={
              registerApprovedWork
            }
            disabled={loading}
            style={{
              width: "100%",
              minHeight: "46px",
              border: 0,
              borderRadius: "10px",
              background: loading
                ? "#94a3b8"
                : "#111827",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "15px",
              cursor: loading
                ? "default"
                : "pointer",
            }}
          >
            {loading
              ? "AI 분석 + 등록 중..."
              : "🤖 AI 견적자료 등록"}
          </button>
        </>
      )}

      {message && (
        <div
          style={{
            marginTop: "10px",
            padding: "10px",
            borderRadius: "8px",
            background: "#ffffff",
            fontSize: "13px",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
          }
