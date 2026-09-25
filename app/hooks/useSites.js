"use client";

import { useCallback, useState } from "react";
import { supabase } from "../../lib/supabase";

/* =========================================================
   파일명 안전하게 만들기
========================================================= */

function makeSafeFileName(fileName = "photo.jpg") {
  const extension =
    fileName.includes(".")
      ? fileName.split(".").pop().toLowerCase()
      : "jpg";

  return `${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

/* =========================================================
   숫자 변환
========================================================= */

function toNumberOrNull(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

/* =========================================================
   Hook
========================================================= */

export default function useSites({
  companyId,
}) {
  const [sites, setSites] =
    useState([]);

  const [
    sitesLoading,
    setSitesLoading,
  ] = useState(false);

  const [
    sitesMessage,
    setSitesMessage,
  ] = useState("");

  const [
    selectedSite,
    setSelectedSite,
  ] = useState(null);

  /* =========================================================
     현장 목록 불러오기
  ========================================================= */

  const loadSites = useCallback(
    async (
      targetCompanyId = companyId,
    ) => {
      if (!targetCompanyId) {
        return;
      }

      setSitesLoading(true);
      setSitesMessage("");

      try {
        const {
          data,
          error,
        } = await supabase
          .from("sites")
          .select(`
            *,
            site_workers (
              id,
              role,
              worker_id,
              workers (
                id,
                name,
                phone,
                position
              )
            )
          `)
          .eq(
            "company_id",
            targetCompanyId,
          )
          .order(
            "schedule_start",
            {
              ascending: true,
            },
          );

        if (error) {
          throw error;
        }

        setSites(
          data || [],
        );
      } catch (error) {
        console.error(
          "현장 목록 조회 오류:",
          error,
        );

        setSites([]);

        setSitesMessage(
          `❌ 현장 목록 조회 실패: ${
            error?.message ||
            "알 수 없는 오류"
          }`,
        );
      } finally {
        setSitesLoading(false);
      }
    },
    [companyId],
  );

  /* =========================================================
     현장 요청사진 업로드
  ========================================================= */

  const uploadRequestPhotos =
    useCallback(
      async ({
        siteId,
        files = [],
      }) => {
        if (
          !companyId ||
          !siteId ||
          !files.length
        ) {
          return [];
        }

        const uploadedRows = [];

        for (
          let index = 0;
          index < files.length;
          index += 1
        ) {
          const file = files[index];

          if (!file) {
            continue;
          }

          const safeFileName =
            makeSafeFileName(
              file.name,
            );

          const storagePath =
            `sites/${companyId}/${siteId}/request/${safeFileName}`;

          const {
            error: uploadError,
          } = await supabase.storage
            .from("work-photos")
            .upload(
              storagePath,
              file,
              {
                cacheControl:
                  "3600",

                upsert: false,

                contentType:
                  file.type ||
                  undefined,
              },
            );

          if (uploadError) {
            throw new Error(
              `요청사진 업로드 실패: ${uploadError.message}`,
            );
          }

          const photoRow = {
            company_id:
              companyId,

            site_id:
              siteId,

            photo_type:
              "request",

            storage_path:
              storagePath,

            photo_url:
              null,

            description:
              "시공 요청사진",
          };

          const {
            data: insertedPhoto,
            error: photoError,
          } = await supabase
            .from("site_photos")
            .insert(photoRow)
            .select()
            .single();

          if (photoError) {
            await supabase.storage
              .from("work-photos")
              .remove([
                storagePath,
              ]);

            throw new Error(
              `요청사진 정보 저장 실패: ${photoError.message}`,
            );
          }

          uploadedRows.push(
            insertedPhoto,
          );
        }

        return uploadedRows;
      },
      [companyId],
    );

  /* =========================================================
     현장 상세에서 요청사진 추가
  ========================================================= */

  const addSiteRequestPhotos =
    useCallback(
      async ({
        siteId,
        files = [],
      }) => {
        if (
          !companyId ||
          !siteId
        ) {
          return {
            success: false,
            error:
              "회사 또는 현장 정보를 확인할 수 없습니다.",
          };
        }

        const normalizedFiles =
          Array.from(
            files || [],
          ).filter(Boolean);

        if (
          normalizedFiles.length ===
          0
        ) {
          return {
            success: false,
            error:
              "추가할 사진을 선택해주세요.",
          };
        }

        setSitesMessage("");

        try {
          const uploadedPhotos =
            await uploadRequestPhotos({
              siteId,
              files:
                normalizedFiles,
            });

          setSites((prev) =>
            prev.map(
              (site) => {
                if (
                  site.id !==
                  siteId
                ) {
                  return site;
                }

                const existingPhotos =
                  Array.isArray(
                    site.site_photos,
                  )
                    ? site.site_photos
                    : [];

                return {
                  ...site,

                  site_photos: [
                    ...existingPhotos,
                    ...uploadedPhotos,
                  ],
                };
              },
            ),
          );

          setSelectedSite(
            (prev) => {
              if (
                !prev ||
                prev.id !==
                  siteId
              ) {
                return prev;
              }

              const existingPhotos =
                Array.isArray(
                  prev.site_photos,
                )
                  ? prev.site_photos
                  : [];

              return {
                ...prev,

                site_photos: [
                  ...existingPhotos,
                  ...uploadedPhotos,
                ],
              };
            },
          );

          setSitesMessage(
            `✅ 요청사진 ${uploadedPhotos.length}장이 추가되었습니다.`,
          );

          return {
            success: true,
            photos:
              uploadedPhotos,
          };
        } catch (error) {
          console.error(
            "현장 요청사진 추가 오류:",
            error,
          );

          const message =
            error?.message ||
            "사진 추가 중 오류가 발생했습니다.";

          setSitesMessage(
            `❌ 요청사진 추가 실패: ${message}`,
          );

          return {
            success: false,
            error: message,
          };
        }
      },
      [
        companyId,
        uploadRequestPhotos,
      ],
    );

  /* =========================================================
     현장 상세에서 요청사진 삭제
  ========================================================= */

  const deleteSiteRequestPhoto =
    useCallback(
      async ({
        siteId,
        photoId,
        storagePath = null,
      }) => {
        if (
          !companyId ||
          !siteId ||
          !photoId
        ) {
          return {
            success: false,
            error:
              "삭제할 사진 정보를 확인할 수 없습니다.",
          };
        }

        setSitesMessage("");

        try {
          /*
           * 먼저 DB에서 실제 사진정보를 확인합니다.
           * 화면에서 전달된 storagePath보다
           * DB 값을 우선 사용합니다.
           */
          const {
            data: photoRow,
            error:
              photoLoadError,
          } = await supabase
            .from("site_photos")
            .select(
              "id, company_id, site_id, photo_type, storage_path",
            )
            .eq(
              "id",
              photoId,
            )
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "site_id",
              siteId,
            )
            .maybeSingle();

          if (photoLoadError) {
            throw new Error(
              `사진 정보 확인 실패: ${photoLoadError.message}`,
            );
          }

          if (!photoRow) {
            throw new Error(
              "삭제할 사진을 찾을 수 없습니다.",
            );
          }

          const targetStoragePath =
            photoRow.storage_path ||
            storagePath ||
            null;

          /*
           * DB 행을 먼저 삭제합니다.
           * 회사 ID + 현장 ID + 사진 ID를
           * 모두 확인해서 다른 업체 사진이
           * 삭제되지 않도록 합니다.
           */
          const {
            error: deleteDbError,
          } = await supabase
            .from("site_photos")
            .delete()
            .eq(
              "id",
              photoId,
            )
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "site_id",
              siteId,
            );

          if (deleteDbError) {
            throw new Error(
              `사진 정보 삭제 실패: ${deleteDbError.message}`,
            );
          }

          /*
           * Storage 파일 삭제.
           * DB 삭제는 성공했는데 Storage 삭제만
           * 실패하더라도 화면에서는 삭제 상태를
           * 유지합니다.
           */
          let storageWarning =
            null;

          if (targetStoragePath) {
            const {
              error:
                storageDeleteError,
            } =
              await supabase.storage
                .from(
                  "work-photos",
                )
                .remove([
                  targetStoragePath,
                ]);

            if (
              storageDeleteError
            ) {
              console.error(
                "현장 요청사진 Storage 삭제 오류:",
                storageDeleteError,
              );

              storageWarning =
                storageDeleteError.message;
            }
          }

          setSites((prev) =>
            prev.map(
              (site) => {
                if (
                  site.id !==
                  siteId
                ) {
                  return site;
                }

                const nextPhotos =
                  Array.isArray(
                    site.site_photos,
                  )
                    ? site.site_photos.filter(
                        (photo) =>
                          photo.id !==
                          photoId,
                      )
                    : [];

                return {
                  ...site,
                  site_photos:
                    nextPhotos,
                };
              },
            ),
          );

          setSelectedSite(
            (prev) => {
              if (
                !prev ||
                prev.id !==
                  siteId
              ) {
                return prev;
              }

              const nextPhotos =
                Array.isArray(
                  prev.site_photos,
                )
                  ? prev.site_photos.filter(
                      (photo) =>
                        photo.id !==
                        photoId,
                    )
                  : [];

              return {
                ...prev,
                site_photos:
                  nextPhotos,
              };
            },
          );

          if (storageWarning) {
            setSitesMessage(
              "✅ 사진 목록에서는 삭제되었습니다. 저장소 파일 정리는 일부 실패했습니다.",
            );
          } else {
            setSitesMessage(
              "✅ 요청사진이 삭제되었습니다.",
            );
          }

          return {
            success: true,
            storageWarning,
          };
        } catch (error) {
          console.error(
            "현장 요청사진 삭제 오류:",
            error,
          );

          const message =
            error?.message ||
            "사진 삭제 중 오류가 발생했습니다.";

          setSitesMessage(
            `❌ 요청사진 삭제 실패: ${message}`,
          );

          return {
            success: false,
            error: message,
          };
        }
      },
      [companyId],
    );

  /* =========================================================
     시공 예정 자재 저장
  ========================================================= */

  const saveSiteMaterials =
    useCallback(
      async ({
        siteId,
        materials = [],
      }) => {
        if (
          !companyId ||
          !siteId ||
          !materials.length
        ) {
          return [];
        }

        const rows =
          materials
            .filter(
              (material) =>
                material &&
                (
                  material.product_code ||
                  material.product_name
                ),
            )
            .map(
              (material) => {
                const quantity =
                  toNumberOrNull(
                    material.quantity,
                  ) ?? 0;

                const unitPrice =
                  toNumberOrNull(
                    material.unit_price,
                  );

                let totalPrice =
                  toNumberOrNull(
                    material.total_price,
                  );

                if (
                  totalPrice ===
                    null &&
                  unitPrice !==
                    null
                ) {
                  totalPrice =
                    quantity *
                    unitPrice;
                }

                return {
                  company_id:
                    companyId,

                  site_id:
                    siteId,

                  film_product_id:
                    material.film_product_id ||
                    null,

                  brand:
                    material.brand?.trim() ||
                    null,

                  product_code:
                    material.product_code?.trim() ||
                    null,

                  product_name:
                    material.product_name?.trim() ||
                    null,

                  quantity,

                  unit:
                    material.unit?.trim() ||
                    "m",

                  unit_price:
                    unitPrice,

                  total_price:
                    totalPrice,

                  memo:
                    material.memo?.trim() ||
                    null,
                };
              },
            );

        if (!rows.length) {
          return [];
        }

        const {
          data,
          error,
        } = await supabase
          .from("site_materials")
          .insert(rows)
          .select();

        if (error) {
          throw new Error(
            `시공 자재 저장 실패: ${error.message}`,
          );
        }

        return data || [];
      },
      [companyId],
    );

  /* =========================================================
     현장 등록
  ========================================================= */

  const createSite = useCallback(
    async (form) => {
      if (!companyId) {
        return {
          success: false,
          error:
            "회사 정보를 확인할 수 없습니다.",
        };
      }

      if (
        !form?.schedule_start
      ) {
        return {
          success: false,
          error:
            "시공 일정을 입력해주세요.",
        };
      }

      setSitesLoading(true);
      setSitesMessage("");

      let createdSite = null;

      try {
        const insertData = {
          company_id:
            companyId,

          customer_name:
            form.customer_name?.trim() ||
            null,

          customer_phone:
            form.customer_phone?.trim() ||
            null,

          site_name:
            form.site_name?.trim() ||
            null,

          address:
            form.address?.trim() ||
            null,

          address_detail:
            form.address_detail?.trim() ||
            null,

          region:
            form.region?.trim() ||
            null,

          schedule_start:
            form.schedule_start,

          schedule_end:
            form.schedule_end ||
            null,

          work_type:
            form.work_type?.trim() ||
            null,

          work_description:
            form.work_description?.trim() ||
            null,

          contract_amount:
            toNumberOrNull(
              form.contract_amount,
            ),

          deposit_amount:
            toNumberOrNull(
              form.deposit_amount,
            ),

          source:
            form.source ||
            "phone",

          status:
            "scheduled",

          memo:
            form.memo?.trim() ||
            null,
        };

        const {
          data,
          error,
        } = await supabase
          .from("sites")
          .insert(
            insertData,
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        createdSite = data;

        const materials =
          Array.isArray(
            form.materials,
          )
            ? form.materials
            : [];

        const savedMaterials =
          await saveSiteMaterials({
            siteId:
              createdSite.id,

            materials,
          });

        const requestPhotos =
          Array.isArray(
            form.request_photos,
          )
            ? form.request_photos
            : [];

        const savedPhotos =
          await uploadRequestPhotos({
            siteId:
              createdSite.id,

            files:
              requestPhotos,
          });

        const siteForState = {
          ...createdSite,

          site_workers:
            [],

          site_materials:
            savedMaterials,

          site_photos:
            savedPhotos,
        };

        setSites((prev) =>
          [
            ...prev,
            siteForState,
          ].sort(
            (a, b) =>
              new Date(
                a.schedule_start,
              ).getTime() -
              new Date(
                b.schedule_start,
              ).getTime(),
          ),
        );

        setSitesMessage(
          "✅ 현장 일정이 등록되었습니다.",
        );

        return {
          success: true,

          site:
            siteForState,

          materials:
            savedMaterials,

          photos:
            savedPhotos,
        };
      } catch (error) {
        console.error(
          "현장 등록 오류:",
          error,
        );

        const message =
          error?.message ||
          "현장 등록 중 오류가 발생했습니다.";

        setSitesMessage(
          `❌ ${message}`,
        );

        if (createdSite) {
          try {
            await loadSites(
              companyId,
            );
          } catch {
            // loadSites 내부에서 오류 처리
          }
        }

        return {
          success: false,

          error:
            createdSite
              ? `현장 일정은 생성되었지만 추가정보 저장 중 오류가 발생했습니다.\n${message}`
              : message,

          site:
            createdSite,
        };
      } finally {
        setSitesLoading(false);
      }
    },
    [
      companyId,
      loadSites,
      saveSiteMaterials,
      uploadRequestPhotos,
    ],
  );

  /* =========================================================
     현장 일정 변경
  ========================================================= */

  const updateSiteSchedule =
    useCallback(
      async ({
        siteId,
        scheduleStart,
        scheduleEnd = null,
      }) => {
        if (
          !companyId ||
          !siteId
        ) {
          return {
            success: false,
            error:
              "회사 또는 현장 정보를 확인할 수 없습니다.",
          };
        }

        if (!scheduleStart) {
          return {
            success: false,
            error:
              "시공 시작 일정을 입력해주세요.",
          };
        }

        const startDate =
          new Date(scheduleStart);

        if (
          Number.isNaN(
            startDate.getTime(),
          )
        ) {
          return {
            success: false,
            error:
              "시공 시작 일정이 올바르지 않습니다.",
          };
        }

        let normalizedEnd =
          scheduleEnd || null;

        if (normalizedEnd) {
          const endDate =
            new Date(normalizedEnd);

          if (
            Number.isNaN(
              endDate.getTime(),
            )
          ) {
            return {
              success: false,
              error:
                "시공 종료 일정이 올바르지 않습니다.",
            };
          }

          if (
            endDate.getTime() <
            startDate.getTime()
          ) {
            return {
              success: false,
              error:
                "종료 일정은 시작 일정보다 빠를 수 없습니다.",
            };
          }
        }

        setSitesMessage("");

        try {
          const {
            data,
            error,
          } = await supabase
            .from("sites")
            .update({
              schedule_start:
                scheduleStart,

              schedule_end:
                normalizedEnd,

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              siteId,
            )
            .eq(
              "company_id",
              companyId,
            )
            .select()
            .single();

          if (error) {
            throw error;
          }

          /*
           * sites UPDATE가 성공하면
           * DB에 설치한 일정 변경 트리거가 실행됩니다.
           *
           * 일정이 실제로 변경된 경우에만
           * 배정 시공자 notifications가 생성되고
           * 기존 Push 시스템으로 전달됩니다.
           */

          setSites((prev) =>
            prev
              .map(
                (site) =>
                  site.id === siteId
                    ? {
                        ...site,
                        ...data,
                      }
                    : site,
              )
              .sort(
                (a, b) =>
                  new Date(
                    a.schedule_start,
                  ).getTime() -
                  new Date(
                    b.schedule_start,
                  ).getTime(),
              ),
          );

          if (
            selectedSite?.id ===
            siteId
          ) {
            setSelectedSite(
              (prev) =>
                prev
                  ? {
                      ...prev,
                      ...data,
                    }
                  : prev,
            );
          }

          setSitesMessage(
            "✅ 시공 일정이 변경되었습니다.",
          );

          return {
            success: true,
            site: data,
          };
        } catch (error) {
          console.error(
            "현장 일정 변경 오류:",
            error,
          );

          const message =
            error?.message ||
            "알 수 없는 오류";

          setSitesMessage(
            `❌ 일정 변경 실패: ${message}`,
          );

          return {
            success: false,
            error: message,
          };
        }
      },
      [
        companyId,
        selectedSite,
      ],
    );

  /* =========================================================
     현장 상태 변경
  ========================================================= */

  const updateSiteStatus =
    useCallback(
      async (
        siteId,
        nextStatus,
      ) => {
        if (
          !companyId ||
          !siteId
        ) {
          return {
            success: false,
          };
        }

        try {
          const {
            data,
            error,
          } = await supabase
            .from("sites")
            .update({
              status:
                nextStatus,

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              siteId,
            )
            .eq(
              "company_id",
              companyId,
            )
            .select()
            .single();

          if (error) {
            throw error;
          }

          setSites((prev) =>
            prev.map(
              (site) =>
                site.id ===
                siteId
                  ? {
                      ...site,
                      ...data,
                    }
                  : site,
            ),
          );

          if (
            selectedSite?.id ===
            siteId
          ) {
            setSelectedSite(
              (prev) =>
                prev
                  ? {
                      ...prev,
                      ...data,
                    }
                  : prev,
            );
          }

          return {
            success: true,
            site: data,
          };
        } catch (error) {
          console.error(
            "현장 상태 변경 오류:",
            error,
          );

          setSitesMessage(
            `❌ 상태 변경 실패: ${
              error?.message ||
              "알 수 없는 오류"
            }`,
          );

          return {
            success: false,
            error:
              error?.message,
          };
        }
      },
      [
        companyId,
        selectedSite,
      ],
    );

  /* =========================================================
     현장 선택
  ========================================================= */

  function openSite(site) {
    setSelectedSite(
      site,
    );
  }

  function closeSite() {
    setSelectedSite(
      null,
    );
  }

  /* =========================================================
     메시지 초기화
  ========================================================= */

  function clearSitesMessage() {
    setSitesMessage("");
  }

  /* =========================================================
     반환
  ========================================================= */

  return {
    sites,
    sitesLoading,
    sitesMessage,

    selectedSite,

    loadSites,
    createSite,

    updateSiteSchedule,
    updateSiteStatus,

    saveSiteMaterials,
    uploadRequestPhotos,

    // 현장 상세 요청사진 관리
    addSiteRequestPhotos,
    deleteSiteRequestPhoto,

    openSite,
    closeSite,

    clearSitesMessage,
  };
             }
