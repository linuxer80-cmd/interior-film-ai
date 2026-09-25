"use client";

import { useCallback, useState } from "react";
import { supabase } from "../../lib/supabase";

function makeSafeFileName(fileName = "photo.jpg") {
  const extension =
    fileName.includes(".")
      ? fileName.split(".").pop().toLowerCase()
      : "jpg";

  return `${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

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

/*
 * 일정이 있는 현장은 날짜순으로 먼저 표시하고
 * 일정 미정(상담중) 현장은 뒤에 표시합니다.
 */
function sortSitesBySchedule(a, b) {
  const aValue = a?.schedule_start;
  const bValue = b?.schedule_start;

  if (!aValue && !bValue) {
    return 0;
  }

  if (!aValue) {
    return 1;
  }

  if (!bValue) {
    return -1;
  }

  return (
    new Date(aValue).getTime() -
    new Date(bValue).getTime()
  );
}

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
              nullsFirst: false,
            },
          );

        if (error) {
          throw error;
        }

        setSites(
          (data || []).sort(
            sortSitesBySchedule,
          ),
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
     const createSite = useCallback(
    async (form) => {
      if (!companyId) {
        return {
          success: false,
          error:
            "회사 정보를 확인할 수 없습니다.",
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
            form.schedule_start ||
            null,

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
            form.status ||
            (form.schedule_start
              ? "scheduled"
              : "consulting"),

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
            sortSitesBySchedule,
          ),
        );

        setSitesMessage(
          createdSite.status ===
            "consulting"
            ? "✅ 상담중 현장으로 등록되었습니다."
            : "✅ 현장 일정이 등록되었습니다.",
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
              ? `현장은 생성되었지만 추가정보 저장 중 오류가 발생했습니다.\n${message}`
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

        const normalizedEnd =
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
          const updateData = {
            schedule_start:
              scheduleStart,

            schedule_end:
              normalizedEnd,

            updated_at:
              new Date().toISOString(),
          };

          /*
           * 상담중 현장에서 실제 일정이 확정되면
           * 자동으로 시공 예정 상태로 변경합니다.
           */
          if (
            selectedSite?.id ===
              siteId &&
            selectedSite?.status ===
              "consulting"
          ) {
            updateData.status =
              "scheduled";
          }

          const {
            data,
            error,
          } = await supabase
            .from("sites")
            .update(
              updateData,
            )
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
                sortSitesBySchedule,
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
            data.status ===
              "scheduled" &&
            selectedSite?.status ===
              "consulting"
              ? "✅ 일정이 확정되어 시공 예정으로 변경되었습니다."
              : "✅ 시공 일정이 변경되었습니다.",
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

  function clearSitesMessage() {
    setSitesMessage("");
  }

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

    addSiteRequestPhotos,
    deleteSiteRequestPhoto,

    openSite,
    closeSite,

    clearSitesMessage,
  };
}
