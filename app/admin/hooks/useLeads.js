"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { LEAD_PAGE_SIZE, SIGNED_URL_SECONDS } from "../adminConstants";
import { getLeadPhotoPaths } from "../adminUtils";
import {
  getCachedSignedUrl,
  setCachedSignedUrl,
} from "../signedUrlCache";

export default function useLeads({
  companyId,
  companyName = "업체",
}) {
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsMessage, setLeadsMessage] = useState("");

  const [leadPage, setLeadPage] = useState(1);
  const [leadTotal, setLeadTotal] = useState(0);
  const [leadFilter, setLeadFilter] = useState("all");

  const [unreadCount, setUnreadCount] = useState(0);
  const [openLeadId, setOpenLeadId] = useState(null);

  const [leadPhotoUrls, setLeadPhotoUrls] = useState({});
  const [leadPhotoLoadingId, setLeadPhotoLoadingId] = useState(null);

  const [newLeadAlert, setNewLeadAlert] = useState(null);
  const [notificationEnabled, setNotificationEnabled] = useState(false);

  /* =========================================================
     미확인 상담 수
  ========================================================= */

  async function loadUnreadCount(
    targetCompanyId = companyId,
  ) {
    if (!targetCompanyId) return;

    try {
      const { count, error } = await supabase
        .from("customer_leads")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("company_id", targetCompanyId)
        .eq("is_read", false);

      if (error) {
        console.error("미확인 상담 수:", error);
        return;
      }

      setUnreadCount(count || 0);
    } catch (error) {
      console.error("미확인 상담 수:", error);
    }
  }

  /* =========================================================
     상담 목록
  ========================================================= */

  async function loadLeads(
    page = 1,
    filter = leadFilter,
  ) {
    if (!companyId) return;

    setLeadsLoading(true);
    setLeadsMessage("");

    try {
      const from =
        (page - 1) * LEAD_PAGE_SIZE;

      const to =
        from + LEAD_PAGE_SIZE - 1;

      let query = supabase
        .from("customer_leads")
        .select(
          `
          id,
          customer_name,
          phone,
          region,
          address,
          preferred_date,
          request_text,
          status,
          admin_memo,
          is_read,
          session_id,
          usage_id,
          customer_photo_path,
          customer_photo_paths,
          estimate_min,
          estimate_max,
          estimate_average,
          final_price,
          quote_work_details,
          quote_material,
          quote_note,
          quote_created_at,
          created_at
        `,
          {
            count: "exact",
          },
        )
        .eq("company_id", companyId);

      if (
        filter &&
        filter !== "all"
      ) {
        query = query.eq(
          "status",
          filter,
        );
      }

      const {
        data,
        error,
        count,
      } = await query
        .order("created_at", {
          ascending: false,
        })
        .range(from, to);

      if (error) throw error;

      setLeads(data || []);
      setLeadTotal(count || 0);
      setLeadPage(page);
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 상담 목록 오류: ${
          error?.message ||
          "불러오기 실패"
        }`,
      );
    } finally {
      setLeadsLoading(false);
    }
  }

  /* =========================================================
     읽음 처리
  ========================================================= */

  async function markLeadRead(
    lead,
  ) {
    if (!lead?.id) return;

    if (
      lead.is_read === true
    ) {
      return;
    }

    try {
      const { error } =
        await supabase
          .from("customer_leads")
          .update({
            is_read: true,
          })
          .eq("id", lead.id)
          .eq(
            "company_id",
            companyId,
          );

      if (error) throw error;

      setLeads((current) =>
        current.map((item) =>
          item.id === lead.id
            ? {
                ...item,
                is_read: true,
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
        "읽음 처리:",
        error,
      );
    }
  }

  /* =========================================================
     상담 상세 열기
  ========================================================= */

  async function toggleLeadDetail(
    lead,
  ) {
    if (!lead?.id) return;

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

    await markLeadRead(
      lead,
    );
  }

  /* =========================================================
     고객 사진
  ========================================================= */

  async function loadLeadPhotos(
    lead,
  ) {
    if (!lead?.id) return;

    const paths =
      getLeadPhotoPaths(
        lead,
      );

    if (
      paths.length === 0
    ) {
      setLeadsMessage(
        "⚠️ 저장된 고객 사진이 없습니다.",
      );

      return;
    }

    if (
      Array.isArray(
        leadPhotoUrls[
          lead.id
        ],
      ) &&
      leadPhotoUrls[
        lead.id
      ].length > 0
    ) {
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
        } =
          await supabase.storage
            .from(
              "work-photos",
            )
            .createSignedUrl(
              path,
              SIGNED_URL_SECONDS,
            );

        if (error) {
          console.error(
            "고객 사진 Signed URL:",
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
          "고객 사진을 불러올 수 없습니다.",
        );
      }

      setLeadPhotoUrls(
        (current) => ({
          ...current,
          [lead.id]:
            urls,
        }),
      );

      if (
        urls.length <
        paths.length
      ) {
        setLeadsMessage(
          `⚠️ 고객 사진 ${paths.length}장 중 ${urls.length}장만 불러왔습니다.`,
        );
      }
    } catch (error) {
      console.error(
        "고객 사진:",
        error,
      );

      setLeadsMessage(
        `❌ 고객 사진 오류: ${
          error?.message ||
          "불러오기 실패"
        }`,
      );
    } finally {
      setLeadPhotoLoadingId(
        null,
      );
    }
  }

  /* =========================================================
     상담 상태 변경
  ========================================================= */

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
      const { error } =
        await supabase
          .from("customer_leads")
          .update({
            status,
          })
          .eq("id", leadId)
          .eq(
            "company_id",
            companyId,
          );

      if (error) throw error;

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                status,
              }
            : lead,
        ),
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 상태 변경 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    }
  }

  /* =========================================================
     상담 메모
  ========================================================= */

  async function saveLeadMemo(
    leadId,
    memo,
  ) {
    if (
      !leadId ||
      !companyId
    ) {
      return;
    }

    try {
      const { error } =
        await supabase
          .from("customer_leads")
          .update({
            admin_memo:
              memo || null,
          })
          .eq("id", leadId)
          .eq(
            "company_id",
            companyId,
          );

      if (error) throw error;

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

  /* =========================================================
     상담 화면 로컬값 수정
  ========================================================= */

  function updateLeadLocal(
    leadId,
    field,
    value,
  ) {
    setLeads((current) =>
      current.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              [field]:
                value,
            }
          : lead,
      ),
    );
  }

  /* =========================================================
     최종 견적 저장
  ========================================================= */

  async function saveFinalQuote(
    lead,
  ) {
    if (!lead?.id) {
      return;
    }

    const price = Number(
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

      const { error } =
        await supabase
          .from("customer_leads")
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
          .eq("id", lead.id)
          .eq(
            "company_id",
            companyId,
          );

      if (error) throw error;

      setLeads((current) =>
        current.map((item) =>
          item.id === lead.id
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

  /* =========================================================
     브라우저 알림 활성화
  ========================================================= */

  async function enableNotifications() {
    try {
      if (
        !(
          "Notification" in
          window
        )
      ) {
        alert(
          "이 브라우저는 알림 기능을 지원하지 않습니다.",
        );

        return;
      }

      const permission =
        await Notification.requestPermission();

      if (
        permission !==
        "granted"
      ) {
        setNotificationEnabled(
          false,
        );

        alert(
          "알림 권한을 허용해주세요.",
        );

        return;
      }

      setNotificationEnabled(
        true,
      );

      new Notification(
        companyName,
        {
          body:
            "신규 상담 알림이 활성화되었습니다.",
        },
      );
    } catch (error) {
      console.error(error);

      alert(
        `알림 설정 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    }
  }

  /* =========================================================
     신규 상담 실시간 처리
  ========================================================= */

  function handleRealtimeLead(
    lead,
    isLeadsTabOpen = false,
  ) {
    if (!lead) return;

    setUnreadCount(
      (current) =>
        current + 1,
    );

    setNewLeadAlert({
      id: lead.id,
      customer_name:
        lead.customer_name,
      phone: lead.phone,
      region: lead.region,
      created_at:
        lead.created_at,
    });

    if (
      typeof document !==
      "undefined"
    ) {
      document.title =
        `🔴 신규 상담 | ${companyName}`;
    }

    try {
      navigator.vibrate?.([
        250,
        120,
        250,
      ]);
    } catch {}

    try {
      if (
        typeof Notification !==
          "undefined" &&
        Notification.permission ===
          "granted"
      ) {
        new Notification(
          "🔔 신규 상담이 들어왔습니다.",
          {
            body: `${
              lead.customer_name ||
              "고객"
            } ${
              lead.phone ||
              ""
            }`,
          },
        );
      }
    } catch {}

    if (
      isLeadsTabOpen
    ) {
      loadLeads(
        1,
        leadFilter,
      );
    }
  }

  /* =========================================================
     이미 허용된 브라우저 알림 상태 반영
  ========================================================= */

  function syncNotificationPermission() {
    if (
      typeof Notification !==
        "undefined" &&
      Notification.permission ===
        "granted"
    ) {
      setNotificationEnabled(
        true,
      );
    }
  }

  /* =========================================================
     페이지 수
  ========================================================= */

  const totalLeadPages =
    Math.max(
      1,
      Math.ceil(
        leadTotal /
          LEAD_PAGE_SIZE,
      ),
    );

  /* =========================================================
     외부 사용
  ========================================================= */

  return {
    leads,
    leadsLoading,

    leadsMessage,
    setLeadsMessage,

    leadPage,
    leadTotal,
    totalLeadPages,

    leadFilter,
    setLeadFilter,

    unreadCount,

    openLeadId,

    leadPhotoUrls,
    leadPhotoLoadingId,

    newLeadAlert,
    setNewLeadAlert,

    notificationEnabled,

    loadUnreadCount,
    loadLeads,

    markLeadRead,
    toggleLeadDetail,

    loadLeadPhotos,

    updateLeadStatus,

    saveLeadMemo,
    updateLeadLocal,
    saveFinalQuote,

    enableNotifications,

    handleRealtimeLead,
    syncNotificationPermission,
  };
          }
