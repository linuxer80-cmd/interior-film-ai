"use client";

import { useCallback, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function useSites({
  companyId,
}) {
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] =
    useState(false);
  const [sitesMessage, setSitesMessage] =
    useState("");

  const [selectedSite, setSelectedSite] =
    useState(null);

  /* =========================================================
     현장 목록 불러오기
  ========================================================= */

  const loadSites = useCallback(
    async (targetCompanyId = companyId) => {
      if (!targetCompanyId) {
        return;
      }

      setSitesLoading(true);
      setSitesMessage("");

      try {
        const { data, error } = await supabase
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

        setSites(data || []);
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

      if (!form?.schedule_start) {
        return {
          success: false,
          error:
            "시공 일정을 입력해주세요.",
        };
      }

      setSitesLoading(true);
      setSitesMessage("");

      try {
        const insertData = {
          company_id: companyId,

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
            form.contract_amount
              ? Number(
                  form.contract_amount,
                )
              : null,

          deposit_amount:
            form.deposit_amount
              ? Number(
                  form.deposit_amount,
                )
              : null,

          source:
            form.source || "phone",

          status: "scheduled",

          memo:
            form.memo?.trim() ||
            null,
        };

        const {
          data,
          error,
        } = await supabase
          .from("sites")
          .insert(insertData)
          .select()
          .single();

        if (error) {
          throw error;
        }

        setSites((prev) =>
          [...prev, data].sort(
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
          site: data,
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

        return {
          success: false,
          error: message,
        };
      } finally {
        setSitesLoading(false);
      }
    },
    [companyId],
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
            prev.map((site) =>
              site.id === siteId
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
    setSelectedSite(site);
  }

  function closeSite() {
    setSelectedSite(null);
  }

  /* =========================================================
     메시지 초기화
  ========================================================= */

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
    updateSiteStatus,

    openSite,
    closeSite,

    clearSitesMessage,
  };
}
