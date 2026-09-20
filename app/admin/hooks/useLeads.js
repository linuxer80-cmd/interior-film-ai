"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { getLeadPhotoPaths } from "../adminUtils";
import {
  LEAD_PAGE_SIZE,
  SIGNED_URL_SECONDS,
} from "../adminConstants";
import {
  getCachedSignedUrl,
  setCachedSignedUrl,
} from "../signedUrlCache";

export default function useLeads({
  companyId,
}) {
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] =
    useState(false);
  const [leadsMessage, setLeadsMessage] =
    useState("");

  const [leadPage, setLeadPage] =
    useState(1);
  const [leadTotal, setLeadTotal] =
    useState(0);

  const [leadFilter, setLeadFilter] =
    useState("all");

  const [unreadCount, setUnreadCount] =
    useState(0);

  const [openLeadId, setOpenLeadId] =
    useState(null);

  const [leadPhotoUrls, setLeadPhotoUrls] =
    useState({});

  const [
    leadPhotoLoadingId,
    setLeadPhotoLoadingId,
  ] = useState(null);

  const [newLeadAlert, setNewLeadAlert] =
    useState(null);

  const [
    notificationEnabled,
    setNotificationEnabled,
  ] = useState(false);

  async function loadUnreadCount(
    scopedCompanyId = companyId,
  ) {
    if (!scopedCompanyId) {
      return;
    }

    try {
      const {
        count,
        error,
      } = await supabase
        .from("customer_leads")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "company_id",
          scopedCompanyId,
        )
        .eq(
          "is_read",
          false,
        );

      if (error) {
        throw error;
      }

      setUnreadCount(
        count || 0,
      );
    } catch (error) {
      console.error(
        "읽지 않은 상담:",
        error,
      );
    }
  }

  async function loadLeads(
    page = 1,
    filter = leadFilter,
    scopedCompanyId = companyId,
  ) {
    if (!scopedCompanyId) {
      return;
    }

    setLeadsLoading(true);
    setLeadsMessage("");

    try {
      const from =
        (page - 1) *
        LEAD_PAGE_SIZE;

      const to =
        from +
        LEAD_PAGE_SIZE -
        1;

      let query = supabase
        .from("customer_leads")
        .select(
          "*",
          {
            count: "exact",
          },
        )
        .eq(
          "company_id",
          scopedCompanyId,
        );

      if (
        filter &&
        filter !== "all"
      ) {
        query =
          query.eq(
            "status",
            filter,
          );
      }

      const {
        data,
        error,
        count,
      } = await query
        .order(
          "created_at",
          {
            ascending: false,
          },
        )
        .range(
          from,
          to,
        );

      if (error) {
        throw error;
      }

      setLeads(
        data || [],
      );

      setLeadTotal(
        count || 0,
      );

      setLeadPage(page);

      await loadUnreadCount(
        scopedCompanyId,
      );
    } catch (error) {
      console.error(
        "상담 조회:",
        error,
      );

      setLeadsMessage(
        `❌ 상담 조회 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    } finally {
      setLeadsLoading(false);
    }
  }

  async function toggleLeadDetail(
    lead,
  ) {
    if (!lead?.id) {
      return;
    }

    if (
      openLeadId ===
      lead.id
    ) {
      setOpenLeadId(null);
      return;
    }

    setOpenLeadId(
      lead.id,
    );

    if (!lead.is_read) {
      try {
        const {
          error,
        } = await supabase
          .from(
            "customer_leads",
          )
          .update({
            is_read: true,
          })
          .eq(
            "id",
            lead.id,
          )
          .eq(
            "company_id",
            companyId,
          );

        if (error) {
          throw error;
        }

        setLeads(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                lead.id
                  ? {
                      ...item,
                      is_read:
                        true,
                    }
                  : item,
            ),
        );

        setUnreadCount(
          (current) =>
            Math.max(
              0,
              current - 1,
            ),
        );
      } catch (error) {
        console.error(
          "상담 읽음 처리:",
          error,
        );
      }
    }
  }

  async function loadLeadPhotos(
    lead,
  ) {
    if (!lead?.id) {
      return;
    }

    const paths =
      getLeadPhotoPaths(
        lead,
      );

    if (
      paths.length === 0
    ) {
      setLeadsMessage(
        "⚠️ 이 상담에는 저장된 사진이 없습니다.",
      );
      return;
    }

    setLeadPhotoLoadingId(
      lead.id,
    );

    try {
      const urls = [];

      for (
        const path of paths
      ) {
        const cachedUrl =
          getCachedSignedUrl(
            path,
          );

        if (cachedUrl) {
          urls.push({
            path,
            url: cachedUrl,
          });
          continue;
        }

        const {
          data,
          error,
        } = await supabase.storage
          .from(
            "work-photos",
          )
          .createSignedUrl(
            path,
            SIGNED_URL_SECONDS,
          );

        if (error) {
          console.error(
            "상담 사진 Signed URL:",
            path,
            error,
          );
          continue;
        }

        if (
          data?.signedUrl
        ) {
          setCachedSignedUrl(
            path,
            data.signedUrl,
            SIGNED_URL_SECONDS,
          );

          urls.push({
            path,
            url:
              data.signedUrl,
          });
        }
      }

      if (
        urls.length === 0
      ) {
        throw new Error(
          "사진을 불러올 수 없습니다.",
        );
      }

      setLeadPhotoUrls(
        (current) => ({
          ...current,
          [lead.id]:
            urls,
        }),
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 상담 사진 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    } finally {
      setLeadPhotoLoadingId(
        null,
      );
    }
  }

  async function updateLeadStatus(
    leadId,
    status,
  ) {
    if (
      !leadId ||
      !companyId
    ) {
      return;
    }

    try {
      const {
        error,
      } = await supabase
        .from(
          "customer_leads",
        )
        .update({
          status,
        })
        .eq(
          "id",
          leadId,
        )
        .eq(
          "company_id",
          companyId,
        );

      if (error) {
        throw error;
      }

      setLeads(
        (current) =>
          current.map(
            (lead) =>
              lead.id ===
              leadId
                ? {
                    ...lead,
                    status,
                  }
                : lead,
          ),
      );

      setLeadsMessage(
        "✅ 상담 상태가 변경되었습니다.",
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 상담 상태 변경 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    }
  }

  async function saveLeadMemo(
    lead,
  ) {
    if (
      !lead?.id ||
      !companyId
    ) {
      return;
    }

    try {
      const {
        error,
      } = await supabase
        .from(
          "customer_leads",
        )
        .update({
          admin_memo:
            lead.admin_memo ||
            null,
        })
        .eq(
          "id",
          lead.id,
        )
        .eq(
          "company_id",
          companyId,
        );

      if (error) {
        throw error;
      }

      setLeadsMessage(
        "✅ 상담 메모가 저장되었습니다.",
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 메모 저장 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    }
  }

  function updateLeadLocal(
    leadId,
    field,
    value,
  ) {
    setLeads(
      (current) =>
        current.map(
          (lead) =>
            lead.id ===
            leadId
              ? {
                  ...lead,
                  [field]:
                    value,
                }
              : lead,
        ),
    );
  }

  async function saveFinalQuote(
    lead,
  ) {
    if (
      !lead?.id ||
      !companyId
    ) {
      return;
    }

    const price =
      Number(
        String(
          lead.final_price ||
            "",
        ).replace(
          /,/g,
          "",
        ),
      );

    if (
      !Number.isFinite(
        price,
      ) ||
      price <= 0
    ) {
      setLeadsMessage(
        "⚠️ 최종 견적금액을 입력해주세요.",
      );
      return;
    }

    try {
      const quoteCreatedAt =
        new Date().toISOString();

      const {
        error,
      } = await supabase
        .from(
          "customer_leads",
        )
        .update({
          final_price:
            price,

          quote_work_details:
            lead.quote_work_details ||
            null,

          quote_material:
            lead.quote_material ||
            null,

          quote_note:
            lead.quote_note ||
            null,

          quote_created_at:
            quoteCreatedAt,
        })
        .eq(
          "id",
          lead.id,
        )
        .eq(
          "company_id",
          companyId,
        );

      if (error) {
        throw error;
      }

      setLeads(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              lead.id
                ? {
                    ...item,
                    final_price:
                      price,
                    quote_created_at:
                      quoteCreatedAt,
                  }
                : item,
          ),
      );

      setLeadsMessage(
        "✅ 최종 견적이 저장되었습니다.",
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 최종 견적 저장 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    }
  }

  function handleRealtimeLead(
    lead,
  ) {
    if (
      !lead ||
      !companyId ||
      lead.company_id !==
        companyId
    ) {
      return;
    }

    setUnreadCount(
      (current) =>
        current + 1,
    );

    setNewLeadAlert({
      id: lead.id,
      customer_name:
        lead.customer_name,
      phone:
        lead.phone,
      region:
        lead.region,
      created_at:
        lead.created_at,
    });
  }

  const totalLeadPages =
    Math.max(
      1,
      Math.ceil(
        leadTotal /
          LEAD_PAGE_SIZE,
      ),
    );

  return {
    leads,
    setLeads,

    leadsLoading,

    leadsMessage,
    setLeadsMessage,

    leadPage,
    leadTotal,
    totalLeadPages,

    leadFilter,
    setLeadFilter,

    unreadCount,
    setUnreadCount,

    openLeadId,
    setOpenLeadId,

    leadPhotoUrls,
    leadPhotoLoadingId,

    newLeadAlert,
    setNewLeadAlert,

    notificationEnabled,
    setNotificationEnabled,

    loadUnreadCount,
    loadLeads,
    toggleLeadDetail,
    loadLeadPhotos,

    updateLeadStatus,
    saveLeadMemo,
    updateLeadLocal,
    saveFinalQuote,

    handleRealtimeLead,
  };
          }
