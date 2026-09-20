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

          /* ---------------------------------------------
             Storage 업로드
          --------------------------------------------- */

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

          /* ---------------------------------------------
             site_photos DB 등록
          --------------------------------------------- */

          const photoRow = {
            company_id:
              companyId,

            site_id:
              siteId,

            photo_type:
              "before",

            storage_path:
              storagePath,

            photo_url:
              null,

            description:
              "현장 등록 시 첨부한 시공 요청사진",
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
            /*
             * Storage에는 올라갔는데
             * DB 등록이 실패한 경우
             * 고아 파일을 남기지 않도록 제거
             */
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
     sites
       ↓
     site_materials
       ↓
     Storage + site_photos
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
        /* =================================================
           1. 현장 기본정보 저장
        ================================================= */

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

        /* =================================================
           2. 시공 예정 자재 저장
        ================================================= */

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

        /* =================================================
           3. 시공 요청사진 저장
        ================================================= */

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

        /* =================================================
           4. 화면 목록 즉시 갱신
        ================================================= */

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

        /*
         * 현장 생성 후 자재/사진 저장 단계에서
         * 실패한 경우 현장 자체는 유지합니다.
         *
         * 실제 현장 일정이 사라지는 것보다
         * 관리자에게 실패 내용을 보여주고
         * 추가정보를 다시 입력하는 편이 안전합니다.
         */

        const message =
          error?.message ||
          "현장 등록 중 오류가 발생했습니다.";

        setSitesMessage(
          `❌ ${message}`,
        );

        /*
         * 기본 현장까지 생성된 상태라면
         * 목록에서 현장이 사라지지 않도록 다시 조회
         */
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
    updateSiteStatus,

    saveSiteMaterials,
    uploadRequestPhotos,

    openSite,
    closeSite,

    clearSitesMessage,
  };
          }
