"use client";

import {
  useCallback,
  useState,
} from "react";

import {
  supabase,
} from "../../../lib/supabase";

/* =========================================================
   기본 설정
========================================================= */

const PHOTO_BUCKET =
  "work-photos";

/* =========================================================
   공용 함수
========================================================= */

function makeSafeFileName(
  fileName = "",
) {
  const extension =
    fileName.includes(".")
      ? fileName
          .split(".")
          .pop()
          .toLowerCase()
      : "jpg";

  const random =
    Math.random()
      .toString(36)
      .slice(2, 10);

  return `${Date.now()}-${random}.${extension}`;
}

function toNumberOrNull(
  value,
) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function cleanText(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
}

/* =========================================================
   Hook
========================================================= */

export default function useSiteWorkReport({
  companyId,
  reloadSites,
}) {
  const [
    reportSaving,
    setReportSaving,
  ] = useState(false);

  const [
    reportMessage,
    setReportMessage,
  ] = useState("");

  /* =========================================================
     메시지 초기화
  ========================================================= */

  const clearReportMessage =
    useCallback(() => {
      setReportMessage("");
    }, []);

  /* =========================================================
     완료보고 저장
  ========================================================= */

  const saveWorkReport =
    useCallback(
      async ({
        siteId,
        work_region,
        work_summary,
        memo,
      }) => {
        if (
          !companyId ||
          !siteId
        ) {
          throw new Error(
            "업체 또는 현장 정보가 없습니다.",
          );
        }

        const {
          data: authData,
          error: authError,
        } =
          await supabase.auth.getUser();

        if (
          authError
        ) {
          throw authError;
        }

        const userId =
          authData?.user?.id ||
          null;

        /*
         * work_reports는
         * site_id unique이므로
         * 기존 보고서가 있으면 수정,
         * 없으면 새로 생성합니다.
         */

        const {
          data: existing,
          error:
            existingError,
        } =
          await supabase
            .from(
              "work_reports",
            )
            .select("id")
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "site_id",
              siteId,
            )
            .maybeSingle();

        if (
          existingError
        ) {
          throw existingError;
        }

        const payload = {
          company_id:
            companyId,

          site_id:
            siteId,

          work_region:
            cleanText(
              work_region,
            ),

          work_summary:
            cleanText(
              work_summary,
            ),

          memo:
            cleanText(
              memo,
            ),

          completed_at:
            new Date().toISOString(),

          created_by:
            userId,
        };

        if (
          existing?.id
        ) {
          const {
            error,
          } =
            await supabase
              .from(
                "work_reports",
              )
              .update({
                work_region:
                  payload.work_region,

                work_summary:
                  payload.work_summary,

                memo:
                  payload.memo,

                completed_at:
                  payload.completed_at,
              })
              .eq(
                "id",
                existing.id,
              )
              .eq(
                "company_id",
                companyId,
              );

          if (
            error
          ) {
            throw error;
          }

          return existing.id;
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "work_reports",
            )
            .insert(
              payload,
            )
            .select("id")
            .single();

        if (
          error
        ) {
          throw error;
        }

        return data.id;
      },
      [
        companyId,
      ],
    );

  /* =========================================================
     실제 사용 자재 저장
  ========================================================= */

  const saveMaterials =
    useCallback(
      async ({
        siteId,
        materials,
      }) => {
        if (
          !Array.isArray(
            materials,
          ) ||
          materials.length ===
            0
        ) {
          return;
        }

        const {
          data: authData,
          error: authError,
        } =
          await supabase.auth.getUser();

        if (
          authError
        ) {
          throw authError;
        }

        const userId =
          authData?.user?.id ||
          null;

        const rows =
          materials
            .filter(
              (item) =>
                cleanText(
                  item.product_code,
                ) ||
                cleanText(
                  item.product_name,
                ),
            )
            .map(
              (item) => {
                const quantity =
                  toNumberOrNull(
                    item.quantity,
                  ) ?? 0;

                const unitPrice =
                  toNumberOrNull(
                    item.unit_price,
                  );

                const totalPrice =
                  unitPrice ===
                  null
                    ? null
                    : quantity *
                      unitPrice;

                return {
                  company_id:
                    companyId,

                  site_id:
                    siteId,

                  /*
                   * 현장 등록 시 자재는
                   * DB 기본값 planned,
                   * 완료보고 자재는 actual로 저장
                   */
                  material_type:
                    "actual",

                  film_product_id:
                    item.film_product_id ||
                    null,

                  brand:
                    cleanText(
                      item.brand,
                    ),

                  product_code:
                    cleanText(
                      item.product_code,
                    ),

                  product_name:
                    cleanText(
                      item.product_name,
                    ),

                  quantity,

                  unit:
                    cleanText(
                      item.unit,
                    ) || "m",

                  unit_price:
                    unitPrice,

                  total_price:
                    totalPrice,

                  memo:
                    cleanText(
                      item.memo,
                    ),

                  created_by:
                    userId,
                };
              },
            );

        if (
          rows.length ===
            0
        ) {
          return;
        }

        const {
          error,
        } =
          await supabase
            .from(
              "site_materials",
            )
            .insert(rows);

        if (
          error
        ) {
          throw error;
        }
      },
      [
        companyId,
      ],
    );

  /* =========================================================
     현장 경비 저장
  ========================================================= */

  const saveExpenses =
    useCallback(
      async ({
        siteId,
        expenses,
      }) => {
        if (
          !Array.isArray(
            expenses,
          ) ||
          expenses.length ===
            0
        ) {
          return;
        }

        const {
          data: authData,
          error: authError,
        } =
          await supabase.auth.getUser();

        if (
          authError
        ) {
          throw authError;
        }

        const userId =
          authData?.user?.id ||
          null;

        const rows =
          expenses
            .filter(
              (item) =>
                Number(
                  item.amount ||
                    0,
                ) > 0,
            )
            .map(
              (item) => ({
                company_id:
                  companyId,

                site_id:
                  siteId,

                expense_type:
                  item.expense_type ||
                  "other",

                amount:
                  Number(
                    item.amount ||
                      0,
                  ),

                description:
                  cleanText(
                    item.description,
                  ),

                expense_date:
                  item.expense_date ||
                  new Date()
                    .toISOString()
                    .slice(
                      0,
                      10,
                    ),

                created_by:
                  userId,
              }),
            );

        if (
          rows.length ===
            0
        ) {
          return;
        }

        const {
          error,
        } =
          await supabase
            .from(
              "site_expenses",
            )
            .insert(rows);

        if (
          error
        ) {
          throw error;
        }
      },
      [
        companyId,
      ],
    );

  /* =========================================================
     완료 사진 업로드
  ========================================================= */

  const uploadCompletionPhotos =
    useCallback(
      async ({
        siteId,
        photos,
      }) => {
        if (
          !Array.isArray(
            photos,
          ) ||
          photos.length ===
            0
        ) {
          return [];
        }

        const {
          data: authData,
          error: authError,
        } =
          await supabase.auth.getUser();

        if (
          authError
        ) {
          throw authError;
        }

        const userId =
          authData?.user?.id ||
          null;

        const uploadedPaths =
          [];

        try {
          for (
            const file of photos
          ) {
            if (
              !file
            ) {
              continue;
            }

            const safeFileName =
              makeSafeFileName(
                file.name,
              );

            const storagePath =
              `sites/${companyId}/${siteId}/after/${safeFileName}`;

            const {
              error:
                uploadError,
            } =
              await supabase.storage
                .from(
                  PHOTO_BUCKET,
                )
                .upload(
                  storagePath,
                  file,
                  {
                    cacheControl:
                      "3600",

                    upsert:
                      false,

                    contentType:
                      file.type ||
                      undefined,
                  },
                );

            if (
              uploadError
            ) {
              throw new Error(
                `완료사진 업로드 실패: ${uploadError.message}`,
              );
            }

            uploadedPaths.push(
              storagePath,
            );

            const {
              error:
                photoRowError,
            } =
              await supabase
                .from(
                  "site_photos",
                )
                .insert({
                  company_id:
                    companyId,

                  site_id:
                    siteId,

                  uploaded_by:
                    userId,

                  photo_type:
                    "after",

                  storage_path:
                    storagePath,

                  photo_url:
                    null,

                  description:
                    "시공 완료 보고 사진",
                });

            if (
              photoRowError
            ) {
              await supabase.storage
                .from(
                  PHOTO_BUCKET,
                )
                .remove([
                  storagePath,
                ]);

              const index =
                uploadedPaths.indexOf(
                  storagePath,
                );

              if (
                index !== -1
              ) {
                uploadedPaths.splice(
                  index,
                  1,
                );
              }

              throw new Error(
                `완료사진 정보 저장 실패: ${photoRowError.message}`,
              );
            }
          }

          return uploadedPaths;
        } catch (error) {
          /*
           * 이번 저장 시도에서
           * Storage에 올라간 사진을
           * 가능한 범위에서 정리합니다.
           *
           * site_photos DB 행은
           * 사진별 insert 직후 생성되므로
           * 이미 성공한 행까지 자동 삭제하지는 않습니다.
           * 따라서 재시도 시 중복 방지를 위해
           * 아래 메인 저장 함수에서
           * 단계별 오류 메시지를 명확히 표시합니다.
           */

          throw error;
        }
      },
      [
        companyId,
      ],
    );

  /* =========================================================
     현장 완료 상태 변경
  ========================================================= */

  const markSiteCompleted =
    useCallback(
      async (
        siteId,
      ) => {
        const {
          error,
        } =
          await supabase
            .from(
              "sites",
            )
            .update({
              status:
                "completed",
            })
            .eq(
              "id",
              siteId,
            )
            .eq(
              "company_id",
              companyId,
            );

        if (
          error
        ) {
          throw error;
        }
      },
      [
        companyId,
      ],
    );

  /* =========================================================
     전체 저장
  ========================================================= */

  const submitWorkReport =
    useCallback(
      async ({
        siteId,
        work_region,
        work_summary,
        memo,
        materials = [],
        expenses = [],
        photos = [],
      }) => {
        if (
          reportSaving
        ) {
          return false;
        }

        if (
          !companyId
        ) {
          setReportMessage(
            "업체 정보가 없습니다.",
          );

          return false;
        }

        if (
          !siteId
        ) {
          setReportMessage(
            "현장 정보가 없습니다.",
          );

          return false;
        }

        if (
          !cleanText(
            work_summary,
          )
        ) {
          setReportMessage(
            "시공 내용을 입력해주세요.",
          );

          return false;
        }

        if (
          !Array.isArray(
            photos,
          ) ||
          photos.length ===
            0
        ) {
          setReportMessage(
            "시공 완료 사진을 1장 이상 등록해주세요.",
          );

          return false;
        }

        setReportSaving(
          true,
        );

        setReportMessage(
          "시공 완료 보고를 저장하고 있습니다...",
        );

        try {
          /*
           * 1. 완료보고
           */

          await saveWorkReport({
            siteId,
            work_region,
            work_summary,
            memo,
          });

          /*
           * 2. 실제 사용 자재
           */

          await saveMaterials({
            siteId,
            materials,
          });

          /*
           * 3. 현장 경비
           */

          await saveExpenses({
            siteId,
            expenses,
          });

          /*
           * 4. 완료 사진
           */

          await uploadCompletionPhotos({
            siteId,
            photos,
          });

          /*
           * 5. 모든 저장 성공 후
           *    현장 완료 처리
           */

          await markSiteCompleted(
            siteId,
          );

          /*
           * 6. 현장 목록 새로고침
           */

          if (
            typeof reloadSites ===
            "function"
          ) {
            await reloadSites();
          }

          setReportMessage(
            "시공 완료 보고가 저장되었습니다.",
          );

          return true;
        } catch (error) {
          console.error(
            "시공 완료 보고 저장 오류:",
            error,
          );

          setReportMessage(
            `시공 완료 보고 저장 오류: ${
              error?.message ||
              "알 수 없는 오류"
            }`,
          );

          return false;
        } finally {
          setReportSaving(
            false,
          );
        }
      },
      [
        companyId,
        reportSaving,
        reloadSites,
        saveWorkReport,
        saveMaterials,
        saveExpenses,
        uploadCompletionPhotos,
        markSiteCompleted,
      ],
    );

  /* =========================================================
     반환
  ========================================================= */

  return {
    reportSaving,
    reportMessage,

    submitWorkReport,
    clearReportMessage,
  };
                  }
