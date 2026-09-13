"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const JOB_PAGE_SIZE = 10;
const LEAD_PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  "신규문의",
  "상담중",
  "방문견적",
  "계약완료",
  "미계약",
];

export default function AdminPage() {
  // ============================================================
  // 탭
  // ============================================================

  const [activeTab, setActiveTab] = useState("jobs");
  const activeTabRef = useRef("jobs");

  function changeTab(tab) {
    activeTabRef.current = tab;
    setActiveTab(tab);
  }

  // ============================================================
  // AI 유사도 설정
  // ============================================================

  const [similarityThreshold, setSimilarityThreshold] =
    useState(0.65);

  const [settingMessage, setSettingMessage] = useState("");
  const [settingLoading, setSettingLoading] = useState(false);

  // ============================================================
  // 시공 등록
  // ============================================================

  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);

  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // ============================================================
  // 시공 DB
  // ============================================================

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsMessage, setJobsMessage] = useState("");

  const [jobSearch, setJobSearch] = useState("");
  const [jobSearchApplied, setJobSearchApplied] = useState("");

  const [jobPage, setJobPage] = useState(1);
  const [jobTotal, setJobTotal] = useState(0);

  // ============================================================
  // 시공 상세
  // ============================================================

  const [openJobId, setOpenJobId] = useState(null);
  const [jobPhotos, setJobPhotos] = useState({});
  const [jobPhotoLoadingId, setJobPhotoLoadingId] =
    useState(null);

  // ============================================================
  // 시공정보 수정
  // ============================================================

  const [editingId, setEditingId] = useState(null);

  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editMemo, setEditMemo] = useState("");

  // ============================================================
  // 사진 수정
  // ============================================================

  const [previewPhoto, setPreviewPhoto] = useState(null);

  const [editingPhotoId, setEditingPhotoId] = useState(null);

  const [editPhotoType, setEditPhotoType] =
    useState("before");

  const [editPhotoCategory, setEditPhotoCategory] =
    useState("");

  const [
    editPhotoSubCategory,
    setEditPhotoSubCategory,
  ] = useState("");

  const [
    editPhotoDescription,
    setEditPhotoDescription,
  ] = useState("");

  const [photoEditLoading, setPhotoEditLoading] =
    useState(false);

  // ============================================================
  // 고객 상담
  // ============================================================

  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsMessage, setLeadsMessage] = useState("");

  const [leadPage, setLeadPage] = useState(1);
  const [leadTotal, setLeadTotal] = useState(0);

  const [leadFilter, setLeadFilter] = useState("all");

  const [unreadCount, setUnreadCount] = useState(0);

  const [openLeadId, setOpenLeadId] = useState(null);

  const [leadPhotoUrls, setLeadPhotoUrls] = useState({});

  const [leadPhotoLoadingId, setLeadPhotoLoadingId] =
    useState(null);

  const [newLeadAlert, setNewLeadAlert] = useState(null);

  const [
    notificationEnabled,
    setNotificationEnabled,
  ] = useState(false);

  // ============================================================
  // 스타일
  // ============================================================

  const inputStyle = {
    width: "100%",
    padding: "14px",
    fontSize: "16px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#111827",
  };

  const sectionStyle = {
    padding: "18px",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    background: "#ffffff",
    marginBottom: "18px",
  };

  const primaryButtonStyle = {
    width: "100%",
    padding: "14px",
    border: "none",
    borderRadius: "10px",
    background: "#111827",
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: "16px",
    cursor: "pointer",
  };

  const secondaryButtonStyle = {
    width: "100%",
    padding: "12px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: "bold",
    cursor: "pointer",
  };

  // ============================================================
  // 초기 실행
  // ============================================================

  useEffect(() => {
    loadSettings();
    loadJobs(1, "");
    loadUnreadCount();

    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      setNotificationEnabled(true);
    }

    const channel = supabase
      .channel("customer-leads-admin-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_leads",
        },
        (payload) => {
          handleRealtimeLead(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "leads") {
      loadLeads(1, leadFilter);
    }
  }, [leadFilter]);

  // ============================================================
  // 공통 함수
  // ============================================================

  function formatWon(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "-";
    }

    return `${Number(value).toLocaleString(
      "ko-KR"
    )}원`;
  }

  function formatDate(value) {
    if (!value) return "-";

    try {
      return new Date(value).toLocaleString("ko-KR");
    } catch {
      return value;
    }
  }

  function getTotalPages(total, pageSize) {
    return Math.max(1, Math.ceil(total / pageSize));
  }

  function sanitizeSearchKeyword(value) {
    return String(value || "")
      .replace(/,/g, " ")
      .replace(/\(/g, " ")
      .replace(/\)/g, " ")
      .trim();
  }

  // ============================================================
  // 브라우저 알림
  // ============================================================

  async function enableNotifications() {
  if (!("serviceWorker" in navigator)) {
    alert("이 브라우저는 푸시 알림을 지원하지 않습니다.");
    return;
  }

  if (!("Notification" in window)) {
    alert("이 브라우저는 알림 기능을 지원하지 않습니다.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");

    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      setNotificationEnabled(false);
      alert("알림 권한을 허용해주세요.");
      return;
    }

    setNotificationEnabled(true);

    await registration.showNotification("기분좋은공간", {
      body: "신규 상담 알림이 정상적으로 연결되었습니다.",
      tag: "notification-test",
      data: {
        url: "/admin",
      },
    });
  } catch (error) {
    console.error("알림 설정 오류:", error);

    setNotificationEnabled(false);

    alert(
      `알림 설정 오류: ${
        error?.message || "알 수 없는 오류"
      }`
    );
  }
  }

  function handleRealtimeLead(lead) {
    setUnreadCount((current) => current + 1);

    setNewLeadAlert({
      id: lead.id,
      customer_name: lead.customer_name,
      phone: lead.phone,
      region: lead.region,
      created_at: lead.created_at,
    });

    document.title = "🔴 신규 상담 | 기분좋은공간";

    try {
      if (navigator.vibrate) {
        navigator.vibrate([250, 120, 250]);
      }
    } catch {}

    try {
      if (
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("🔴 신규 견적 상담", {
          body: `${
            lead.customer_name || "고객"
          } · ${lead.region || "지역 미입력"}`,
        });
      }
    } catch {}

    if (activeTabRef.current === "leads") {
      loadLeads(1, leadFilter);
    }
  }

  // ============================================================
  // 유사도 설정
  // ============================================================

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("similarity_threshold")
        .eq("id", 1)
        .single();

      if (error) throw error;

      if (
        data &&
        data.similarity_threshold !== null &&
        data.similarity_threshold !== undefined
      ) {
        setSimilarityThreshold(
          Number(data.similarity_threshold)
        );
      }
    } catch (error) {
      console.error(error);

      setSettingMessage(
        "⚠️ 현재 유사도 설정을 불러오지 못했습니다."
      );
    }
  }

  async function saveSimilaritySetting() {
    setSettingLoading(true);
    setSettingMessage("저장 중...");

    try {
      const { error } = await supabase
        .from("app_settings")
        .update({
          similarity_threshold:
            Number(similarityThreshold),

          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;

      setSettingMessage(
        `✅ 유사도 기준 ${Math.round(
          Number(similarityThreshold) * 100
        )}% 저장 완료`
      );
    } catch (error) {
      setSettingMessage(
        `❌ 저장 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setSettingLoading(false);
    }
  }

  // ============================================================
  // 시공 DB 목록
  // 사진을 불러오지 않음
  // ============================================================

  async function loadJobs(
    page = 1,
    keyword = ""
  ) {
    setJobsLoading(true);
    setJobsMessage("");

    try {
      const from =
        (page - 1) * JOB_PAGE_SIZE;

      const to =
        from + JOB_PAGE_SIZE - 1;

      let query = supabase
        .from("work_items")
        .select(
          `
          id,
          project_id,
          category,
          sub_category,
          actual_cost,
          memo,
          created_at
        `,
          {
            count: "exact",
          }
        )
        .order("created_at", {
          ascending: false,
        });

      const cleanedKeyword =
        sanitizeSearchKeyword(keyword);

      if (cleanedKeyword) {
        query = query.or(
          `category.ilike.%${cleanedKeyword}%,sub_category.ilike.%${cleanedKeyword}%,memo.ilike.%${cleanedKeyword}%`
        );
      }

      const {
        data,
        error,
        count,
      } = await query.range(from, to);

      if (error) throw error;

      setJobs(data || []);
      setJobTotal(count || 0);
      setJobPage(page);
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 시공 DB 오류: ${
          error?.message ||
          "데이터를 불러오지 못했습니다."
        }`
      );
    } finally {
      setJobsLoading(false);
    }
  }

  function searchJobs() {
    const keyword = jobSearch.trim();

    setJobSearchApplied(keyword);
    setOpenJobId(null);
    setJobPhotos({});

    loadJobs(1, keyword);
  }

  function clearJobSearch() {
    setJobSearch("");
    setJobSearchApplied("");
    setOpenJobId(null);
    setJobPhotos({});

    loadJobs(1, "");
  }

  // ============================================================
  // 시공 상세
  // 상세보기 눌렀을 때만 사진 다운로드
  // ============================================================

  async function loadJobPhotos(jobId) {
    setJobPhotoLoadingId(jobId);

    try {
      const { data, error } = await supabase
        .from("work_photos")
        .select(
          `
          id,
          work_item_id,
          project_id,
          photo_type,
          category,
          sub_category,
          storage_path,
          photo_url,
          ai_description,
          ai_tags,
          created_at
        `
        )
        .eq("work_item_id", jobId)
        .order("created_at", {
          ascending: true,
        });

      if (error) throw error;

      const photos = data || [];

      const photosWithUrls =
        await Promise.all(
          photos.map(async (photo) => {
            if (!photo.storage_path) {
              return {
                ...photo,
                signedUrl:
                  photo.photo_url || null,
              };
            }

            const {
              data: signedData,
              error: signedError,
            } = await supabase.storage
              .from("work-photos")
              .createSignedUrl(
                photo.storage_path,
                60 * 60
              );

            return {
              ...photo,

              signedUrl: signedError
                ? null
                : signedData?.signedUrl ||
                  null,
            };
          })
        );

      setJobPhotos((current) => ({
        ...current,
        [jobId]: photosWithUrls,
      }));
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 사진 로딩 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setJobPhotoLoadingId(null);
    }
  }

  async function toggleJobDetail(job) {
    if (openJobId === job.id) {
      setOpenJobId(null);
      setEditingId(null);
      return;
    }

    setOpenJobId(job.id);
    setEditingId(null);

    if (!jobPhotos[job.id]) {
      await loadJobPhotos(job.id);
    }
  }

  // ============================================================
  // 시공정보 수정
  // ============================================================

  function startEdit(job) {
    setEditingId(job.id);

    setEditCategory(
      job.category || ""
    );

    setEditSubCategory(
      job.sub_category || ""
    );

    setEditCost(
      job.actual_cost !== null &&
        job.actual_cost !== undefined
        ? String(job.actual_cost)
        : ""
    );

    setEditMemo(
      job.memo || ""
    );
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveJobEdit(jobId) {
    const costNumber = Number(
      String(editCost).replace(/,/g, "")
    );

    if (!editCategory.trim()) {
      setJobsMessage(
        "⚠️ 시공 부위를 입력해주세요."
      );
      return;
    }

    if (
      !Number.isFinite(costNumber) ||
      costNumber <= 0
    ) {
      setJobsMessage(
        "⚠️ 실제 시공금액을 입력해주세요."
      );
      return;
    }

    try {
      const { error } = await supabase
        .from("work_items")
        .update({
          category:
            editCategory.trim(),

          sub_category:
            editSubCategory.trim() ||
            editCategory.trim(),

          actual_cost: costNumber,

          memo:
            editMemo.trim() || null,

          updated_at:
            new Date().toISOString(),
        })
        .eq("id", jobId);

      if (error) throw error;

      setEditingId(null);

      setJobsMessage(
        "✅ 시공 데이터가 수정되었습니다."
      );

      await loadJobs(
        jobPage,
        jobSearchApplied
      );
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 수정 오류: ${
          error?.message || "수정 실패"
        }`
      );
    }
  }

  // ============================================================
  // 사진정보 수정
  // ============================================================

  function startPhotoEdit(photo) {
    setEditingPhotoId(photo.id);

    setEditPhotoType(
      photo.photo_type || "before"
    );

    setEditPhotoCategory(
      photo.category || ""
    );

    setEditPhotoSubCategory(
      photo.sub_category ||
        photo.category ||
        ""
    );

    setEditPhotoDescription(
      photo.ai_description || ""
    );
  }

  function cancelPhotoEdit() {
    setEditingPhotoId(null);
  }

  async function savePhotoEdit(photo) {
    if (
      !editPhotoCategory.trim()
    ) {
      setJobsMessage(
        "⚠️ 사진 카테고리를 입력해주세요."
      );
      return;
    }

    setPhotoEditLoading(true);

    try {
      let tags = Array.isArray(
        photo.ai_tags
      )
        ? [...photo.ai_tags]
        : [];

      tags = tags.filter(
        (tag) =>
          tag !== "시공전" &&
          tag !== "시공후" &&
          tag !== "전후비교"
      );

      if (
        editPhotoType === "before"
      ) {
        tags.push("시공전");
      }

      if (
        editPhotoType === "after"
      ) {
        tags.push("시공후");
      }

      tags = [...new Set(tags)];

      const searchTextValue = [
        `시공 부위: ${editPhotoCategory.trim()}`,

        `세부 부위: ${
          editPhotoSubCategory.trim() ||
          editPhotoCategory.trim()
        }`,

        `사진 상태: ${
          editPhotoType === "before"
            ? "시공 전"
            : editPhotoType === "after"
            ? "시공 후"
            : "기존 사진"
        }`,

        `사진 설명: ${editPhotoDescription.trim()}`,

        `특징: ${tags.join(", ")}`,
      ].join("\n");

      const embedding =
        await createEmbedding(
          searchTextValue
        );

      const { error } = await supabase
        .from("work_photos")
        .update({
          photo_type:
            editPhotoType,

          category:
            editPhotoCategory.trim(),

          sub_category:
            editPhotoSubCategory.trim() ||
            editPhotoCategory.trim(),

          ai_description:
            editPhotoDescription.trim(),

          ai_tags: tags,

          embedding,
        })
        .eq("id", photo.id);

      if (error) throw error;

      setEditingPhotoId(null);

      setJobsMessage(
        "✅ 사진 정보가 수정되었습니다."
      );

      await loadJobPhotos(
        photo.work_item_id
      );
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 사진 수정 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setPhotoEditLoading(false);
    }
  }

  // ============================================================
  // 사진 삭제
  // ============================================================

  async function deletePhoto(photo) {
    const ok = window.confirm(
      "이 사진을 완전히 삭제하시겠습니까?"
    );

    if (!ok) return;

    try {
      if (photo.storage_path) {
        const {
          error: storageError,
        } = await supabase.storage
          .from("work-photos")
          .remove([
            photo.storage_path,
          ]);

        if (storageError) {
          console.error(
            storageError
          );
        }
      }

      const { error } = await supabase
        .from("work_photos")
        .delete()
        .eq("id", photo.id);

      if (error) throw error;

      setJobPhotos((current) => ({
        ...current,

        [photo.work_item_id]: (
          current[
            photo.work_item_id
          ] || []
        ).filter(
          (item) =>
            item.id !== photo.id
        ),
      }));

      setJobsMessage(
        "✅ 사진이 삭제되었습니다."
      );
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 사진 삭제 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  // ============================================================
  // 시공건 전체 삭제
  // ============================================================

  async function deleteJob(job) {
    const ok = window.confirm(
      "이 시공건과 연결된 모든 사진까지 완전히 삭제하시겠습니까?"
    );

    if (!ok) return;

    try {
      const {
        data: photos,
        error: photosError,
      } = await supabase
        .from("work_photos")
        .select(
          "id, storage_path"
        )
        .eq(
          "work_item_id",
          job.id
        );

      if (photosError) {
        throw photosError;
      }

      const paths = (
        photos || []
      )
        .map(
          (photo) =>
            photo.storage_path
        )
        .filter(Boolean);

      if (paths.length > 0) {
        const {
          error: storageError,
        } = await supabase.storage
          .from("work-photos")
          .remove(paths);

        if (storageError) {
          console.error(
            storageError
          );
        }
      }

      const {
        error: photoDeleteError,
      } = await supabase
        .from("work_photos")
        .delete()
        .eq(
          "work_item_id",
          job.id
        );

      if (photoDeleteError) {
        throw photoDeleteError;
      }

      const { error } = await supabase
        .from("work_items")
        .delete()
        .eq("id", job.id);

      if (error) throw error;

      setOpenJobId(null);

      setJobPhotos((current) => {
        const copy = {
          ...current,
        };

        delete copy[job.id];

        return copy;
      });

      setJobsMessage(
        "✅ 시공건이 삭제되었습니다."
      );

      const remainingOnPage =
        jobs.length - 1;

      if (
        remainingOnPage === 0 &&
        jobPage > 1
      ) {
        await loadJobs(
          jobPage - 1,
          jobSearchApplied
        );
      } else {
        await loadJobs(
          jobPage,
          jobSearchApplied
        );
      }
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 삭제 오류: ${
          error?.message ||
          "삭제 실패"
        }`
      );
    }
  }

  // ============================================================
  // 미확인 상담 개수
  // ============================================================

  async function loadUnreadCount() {
    try {
      const {
        count,
        error,
      } = await supabase
        .from("customer_leads")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq(
          "is_read",
          false
        );

      if (error) throw error;

      setUnreadCount(
        count || 0
      );
    } catch (error) {
      console.error(error);
    }
  }

  // ============================================================
  // 상담 목록
  // 20건씩만 로딩
  // ============================================================

  async function loadLeads(
    page = 1,
    filter = "all"
  ) {
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
          `
          id,
          customer_name,
          phone,
          region,
          category,
          sub_category,
          ai_description,
          estimate_min,
          estimate_max,
          estimate_average,
          customer_photo_path,
          status,
          memo,
          is_read,
          read_at,
          created_at
        `,
          {
            count: "exact",
          }
        );

      if (
        filter === "unread"
      ) {
        query = query.eq(
          "is_read",
          false
        );
      }

      if (
        filter === "read"
      ) {
        query = query.eq(
          "is_read",
          true
        );
      }

      const {
        data,
        error,
        count,
      } = await query
        .order("is_read", {
          ascending: true,
        })
        .order("created_at", {
          ascending: false,
        })
        .range(from, to);

      if (error) throw error;

      setLeads(data || []);
      setLeadTotal(count || 0);
      setLeadPage(page);

      await loadUnreadCount();
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 상담 문의 오류: ${
          error?.message ||
          "불러오지 못했습니다."
        }`
      );
    } finally {
      setLeadsLoading(false);
    }
  }

  // ============================================================
  // 상담 상세
  // 고객사진도 상세보기 시에만 다운로드
  // ============================================================

  async function toggleLeadDetail(
    lead
  ) {
    if (
      openLeadId === lead.id
    ) {
      setOpenLeadId(null);
      return;
    }

    setOpenLeadId(lead.id);

    if (
      !lead.customer_photo_path
    ) {
      return;
    }

    if (
      leadPhotoUrls[lead.id]
    ) {
      return;
    }

    setLeadPhotoLoadingId(
      lead.id
    );

    try {
      const {
        data,
        error,
      } = await supabase.storage
        .from("work-photos")
        .createSignedUrl(
          lead.customer_photo_path,
          60 * 30
        );

      if (error) throw error;

      setLeadPhotoUrls(
        (current) => ({
          ...current,

          [lead.id]:
            data?.signedUrl ||
            null,
        })
      );
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 고객사진 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setLeadPhotoLoadingId(
        null
      );
    }
  }

  // ============================================================
  // 상담 확인
  // ============================================================

  async function markLeadRead(
    lead
  ) {
    try {
      const readAt =
        new Date().toISOString();

      const { error } = await supabase
        .from("customer_leads")
        .update({
          is_read: true,
          read_at: readAt,
        })
        .eq("id", lead.id);

      if (error) throw error;

      setLeads((current) =>
        current.map((item) =>
          item.id === lead.id
            ? {
                ...item,
                is_read: true,
                read_at: readAt,
              }
            : item
        )
      );

      setUnreadCount(
        (current) =>
          Math.max(
            0,
            current - 1
          )
      );

      setLeadsMessage(
        "✅ 상담 확인 처리했습니다."
      );

      if (
        unreadCount <= 1
      ) {
        document.title =
          "관리자 | 기분좋은공간";
      }

      if (
        leadFilter ===
        "unread"
      ) {
        setTimeout(
          () =>
            loadLeads(
              1,
              "unread"
            ),
          150
        );
      }
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 확인 처리 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  async function markLeadUnread(
    lead
  ) {
    try {
      const { error } = await supabase
        .from("customer_leads")
        .update({
          is_read: false,
          read_at: null,
        })
        .eq("id", lead.id);

      if (error) throw error;

      setLeadsMessage(
        "🔴 미확인 상담으로 변경했습니다."
      );

      await loadLeads(
        leadPage,
        leadFilter
      );

      await loadUnreadCount();
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 변경 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  // ============================================================
  // 상담 진행상태
  // ============================================================

  async function updateLeadStatus(
    leadId,
    status
  ) {
    try {
      const { error } = await supabase
        .from("customer_leads")
        .update({
          status,
        })
        .eq("id", leadId);

      if (error) throw error;

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                status,
              }
            : lead
        )
      );

      setLeadsMessage(
        `✅ 상담 상태를 '${status}'로 변경했습니다.`
      );
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 상태 변경 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  // ============================================================
  // 상담 삭제
  // ============================================================

  async function deleteLead(
    lead
  ) {
    const ok =
      window.confirm(
        `${
          lead.customer_name ||
          "고객"
        }님의 상담 문의를 삭제하시겠습니까?`
      );

    if (!ok) return;

    try {
      if (
        lead.customer_photo_path
      ) {
        const {
          error: storageError,
        } = await supabase.storage
          .from("work-photos")
          .remove([
            lead.customer_photo_path,
          ]);

        if (storageError) {
          console.error(
            storageError
          );
        }
      }

      const { error } = await supabase
        .from("customer_leads")
        .delete()
        .eq("id", lead.id);

      if (error) throw error;

      setOpenLeadId(null);

      setLeadPhotoUrls(
        (current) => {
          const copy = {
            ...current,
          };

          delete copy[
            lead.id
          ];

          return copy;
        }
      );

      setLeadsMessage(
        "✅ 상담 문의가 삭제되었습니다."
      );

      const remaining =
        leads.length - 1;

      if (
        remaining === 0 &&
        leadPage > 1
      ) {
        await loadLeads(
          leadPage - 1,
          leadFilter
        );
      } else {
        await loadLeads(
          leadPage,
          leadFilter
        );
      }

      await loadUnreadCount();
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 삭제 오류: ${
          error?.message ||
          "삭제 실패"
        }`
      );
    }
  }

  // ============================================================
  // 이미지 SHA-256
  // ============================================================

  async function getImageHash(
    file
  ) {
    const buffer =
      await file.arrayBuffer();

    const hashBuffer =
      await crypto.subtle.digest(
        "SHA-256",
        buffer
      );

    return Array.from(
      new Uint8Array(hashBuffer)
    )
      .map((byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
      )
      .join("");
  }

  async function removeDuplicateImages(
    newFiles,
    otherFiles = []
  ) {
    const otherHashes =
      new Set();

    for (
      const file of otherFiles
    ) {
      otherHashes.add(
        await getImageHash(file)
      );
    }

    const selectedHashes =
      new Set();

    const uniqueFiles = [];

    let duplicateCount = 0;

    for (
      const file of newFiles
    ) {
      const hash =
        await getImageHash(file);

      if (
        selectedHashes.has(
          hash
        ) ||
        otherHashes.has(hash)
      ) {
        duplicateCount++;
        continue;
      }

      selectedHashes.add(
        hash
      );

      uniqueFiles.push(file);
    }

    if (
      duplicateCount > 0
    ) {
      setMessage(
        `⚠️ 동일한 사진 ${duplicateCount}장을 제외했습니다.`
      );
    }

    return uniqueFiles;
  }

  // ============================================================
  // 이미지 리사이즈
  // ============================================================

  async function resizeImage(
    file,
    maxSize = 1600
  ) {
    return new Promise(
      (resolve, reject) => {
        const img =
          new Image();

        const objectUrl =
          URL.createObjectURL(
            file
          );

        img.onload = () => {
          let width =
            img.width;

          let height =
            img.height;

          if (
            width > maxSize ||
            height > maxSize
          ) {
            if (
              width >= height
            ) {
              height =
                Math.round(
                  (height *
                    maxSize) /
                    width
                );

              width =
                maxSize;
            } else {
              width =
                Math.round(
                  (width *
                    maxSize) /
                    height
                );

              height =
                maxSize;
            }
          }

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            width;

          canvas.height =
            height;

          const ctx =
            canvas.getContext(
              "2d"
            );

          if (!ctx) {
            URL.revokeObjectURL(
              objectUrl
            );

            reject(
              new Error(
                "이미지 처리 실패"
              )
            );

            return;
          }

          ctx.drawImage(
            img,
            0,
            0,
            width,
            height
          );

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(
                objectUrl
              );

              if (!blob) {
                reject(
                  new Error(
                    "이미지 변환 실패"
                  )
                );

                return;
              }

              resolve(
                new File(
                  [blob],
                  "ai-analysis.jpg",
                  {
                    type:
                      "image/jpeg",
                  }
                )
              );
            },
            "image/jpeg",
            0.82
          );
        };

        img.onerror = () => {
          URL.revokeObjectURL(
            objectUrl
          );

          reject(
            new Error(
              "이미지 로드 실패"
            )
          );
        };

        img.src =
          objectUrl;
      }
    );
  }

  async function readJsonSafely(
    response
  ) {
    const text =
      await response.text();

    try {
      return JSON.parse(
        text
      );
    } catch {
      throw new Error(
        "서버 응답 오류"
      );
    }
  }

  // ============================================================
  // AI 사진 분석
  // ============================================================

  async function analyzeImage(
    file,
    photoType
  ) {
    const resized =
      await resizeImage(file);

    const formData =
      new FormData();

    formData.append(
      "image",
      resized
    );

    formData.append(
      "photoType",
      photoType
    );

    const response =
      await fetch(
        "/api/analyze",
        {
          method: "POST",
          body: formData,
        }
      );

    const result =
      await readJsonSafely(
        response
      );

    if (
      !response.ok
    ) {
      throw new Error(
        result?.error ||
          "AI 분석 실패"
      );
    }

    return (
      result.analysis || {}
    );
  }

  // ============================================================
  // AI 전후 비교
  // ============================================================

  async function compareMultipleBeforeAfter(
    beforeFiles,
    afterFiles
  ) {
    const formData =
      new FormData();

    setMessage(
      "시공 전·후 사진을 AI가 비교 분석 중..."
    );

    for (
      const file of beforeFiles
    ) {
      const resized =
        await resizeImage(
          file
        );

      formData.append(
        "beforeImages",
        resized
      );
    }

    for (
      const file of afterFiles
    ) {
      const resized =
        await resizeImage(
          file
        );

      formData.append(
        "afterImages",
        resized
      );
    }

    formData.append(
      "photoType",
      "compare"
    );

    const response =
      await fetch(
        "/api/analyze",
        {
          method: "POST",
          body: formData,
        }
      );

    const result =
      await readJsonSafely(
        response
      );

    if (
      !response.ok
    ) {
      throw new Error(
        result?.error ||
          "전후 비교 분석 실패"
      );
    }

    return (
      result.analysis || {}
    );
  }

  // ============================================================
  // 임베딩
  // ============================================================

  async function createEmbedding(
    text
  ) {
    const response =
      await fetch(
        "/api/embedding",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              text,
            }),
        }
      );

    const result =
      await readJsonSafely(
        response
      );

    if (
      !response.ok ||
      !result?.embedding
    ) {
      throw new Error(
        result?.error ||
          "임베딩 생성 실패"
      );
    }

    return result.embedding;
  }

  // ============================================================
  // 사진 1장 저장
  // ============================================================

  async function savePhoto({
    image,
    photoType,
    workItemId,
    projectId,
    analysisOverride,
    index,
  }) {
    let aiAnalysis =
      analysisOverride;

    if (!aiAnalysis) {
      aiAnalysis =
        await analyzeImage(
          image,
          photoType
        );
    }

    let tags =
      Array.isArray(
        aiAnalysis?.tags
      )
        ? [
            ...aiAnalysis.tags,
          ]
        : [];

    if (
      photoType ===
      "before"
    ) {
      tags.push("시공전");
    }

    if (
      photoType ===
      "after"
    ) {
      tags.push("시공후");
    }

    if (
      material.trim()
    ) {
      tags.push(
        material.trim()
      );
    }

    tags = [
      ...new Set(tags),
    ];

    const finalSubCategory =
      aiAnalysis?.sub_category ||
      category.trim();

    const description =
      aiAnalysis?.description ||
      "";

    const searchTextValue = [
      `시공 부위: ${category.trim()}`,

      `세부 부위: ${finalSubCategory}`,

      `사진 상태: ${
        photoType ===
        "before"
          ? "시공 전"
          : "시공 후"
      }`,

      `사진 설명: ${description}`,

      `특징: ${tags.join(
        ", "
      )}`,
    ].join("\n");

    const embedding =
      await createEmbedding(
        searchTextValue
      );

    const resized =
      await resizeImage(
        image
      );

    const filePath =
      `history/${workItemId}/${photoType}/${Date.now()}-${index}.jpg`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("work-photos")
      .upload(
        filePath,
        resized,
        {
          cacheControl:
            "3600",
          upsert: false,
          contentType:
            "image/jpeg",
        }
      );

    if (uploadError) {
      throw uploadError;
    }

    const {
      data: publicUrlData,
    } = supabase.storage
      .from("work-photos")
      .getPublicUrl(
        filePath
      );

    const {
      error: photoError,
    } = await supabase
      .from("work_photos")
      .insert([
        {
          project_id:
            projectId,

          work_item_id:
            workItemId,

          photo_url:
            publicUrlData
              .publicUrl,

          storage_path:
            filePath,

          photo_type:
            photoType,

          category:
            category.trim(),

          sub_category:
            finalSubCategory,

          ai_description:
            description,

          ai_tags:
            tags,

          embedding,
        },
      ]);

    if (photoError) {
      throw photoError;
    }
  }

  // ============================================================
  // 시공 데이터 등록
  // ============================================================

  async function handleSave() {
    if (
      beforeImages.length +
        afterImages.length ===
      0
    ) {
      setMessage(
        "⚠️ 시공 전 또는 시공 후 사진을 선택해주세요."
      );

      return;
    }

    if (
      !category.trim()
    ) {
      setMessage(
        "⚠️ 시공 부위를 입력해주세요."
      );

      return;
    }

    const costNumber =
      Number(
        String(
          actualCost
        ).replace(/,/g, "")
      );

    if (
      !Number.isFinite(
        costNumber
      ) ||
      costNumber <= 0
    ) {
      setMessage(
        "⚠️ 실제 시공금액을 입력해주세요."
      );

      return;
    }

    setLoading(true);
    setMessage(
      "시공 데이터를 준비 중..."
    );

    let createdWorkItemId =
      null;

    try {
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      const {
        data: workItemData,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert([
          {
            project_id:
              projectId,

            category:
              category.trim(),

            sub_category:
              category.trim(),

            actual_cost:
              costNumber,

            memo:
              [
                material.trim()
                  ? `자재: ${material.trim()}`
                  : "",
                memo.trim(),
              ]
                .filter(
                  Boolean
                )
                .join(
                  " / "
                ) ||
              null,
          },
        ])
        .select("id")
        .single();

      if (
        workItemError
      ) {
        throw workItemError;
      }

      const workItemId =
        workItemData.id;

      createdWorkItemId =
        workItemId;

      let comparisonAnalysis =
        null;

      if (
        beforeImages.length >
          0 &&
        afterImages.length >
          0
      ) {
        try {
          comparisonAnalysis =
            await compareMultipleBeforeAfter(
              beforeImages,
              afterImages
            );
        } catch (
          compareError
        ) {
          console.error(
            compareError
          );

          comparisonAnalysis =
            null;
        }
      }

      for (
        let i = 0;
        i <
        beforeImages.length;
        i++
      ) {
        setMessage(
          `시공 전 사진 ${
            i + 1
          }/${
            beforeImages.length
          } AI 분석 및 저장 중...`
        );

        await savePhoto({
          image:
            beforeImages[i],

          photoType:
            "before",

          workItemId,

          projectId,

          analysisOverride:
            null,

          index: i,
        });
      }

      for (
        let i = 0;
        i <
        afterImages.length;
        i++
      ) {
        setMessage(
          `시공 후 사진 ${
            i + 1
          }/${
            afterImages.length
          } AI 분석 및 저장 중...`
        );

        await savePhoto({
          image:
            afterImages[i],

          photoType:
            "after",

          workItemId,

          projectId,

          analysisOverride:
            comparisonAnalysis,

          index: i,
        });
      }

      setMessage(
        `✅ 저장 완료! 시공 전 ${beforeImages.length}장 · 시공 후 ${afterImages.length}장`
      );

      setBeforeImages([]);
      setAfterImages([]);

      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");

      setJobPhotos({});

      await loadJobs(
        1,
        jobSearchApplied
      );
    } catch (error) {
      console.error(error);

      setMessage(
        `❌ 오류: ${
          error?.message ||
          "저장 실패"
        }`
      );

      if (
        createdWorkItemId
      ) {
        console.log(
          "부분 저장된 work_item:",
          createdWorkItemId
        );
      }
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // 사진 카드
  // ============================================================

  function PhotoCard({
    photo,
  }) {
    const isEditing =
      editingPhotoId ===
      photo.id;

    const typeLabel =
      photo.photo_type ===
      "after"
        ? "시공 후"
        : photo.photo_type ===
          "before"
        ? "시공 전"
        : "기존 사진";

    return (
      <div
        style={{
          marginTop: "12px",
          padding: "12px",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "12px",
          background:
            "#ffffff",
        }}
      >
        {photo.signedUrl ? (
          <img
            src={
              photo.signedUrl
            }
            alt={typeLabel}
            onClick={() =>
              setPreviewPhoto(
                photo
              )
            }
            style={{
              width: "100%",
              maxHeight:
                "420px",
              objectFit:
                "cover",
              borderRadius:
                "10px",
              cursor:
                "pointer",
            }}
          />
        ) : (
          <div
            style={{
              padding:
                "40px 10px",
              textAlign:
                "center",
              background:
                "#f3f4f6",
              borderRadius:
                "10px",
              color:
                "#6b7280",
            }}
          >
            사진을 불러올 수
            없습니다.
          </div>
        )}

        {!isEditing ? (
          <>
            <div
              style={{
                marginTop:
                  "10px",
                lineHeight:
                  "1.65",
              }}
            >
              <strong>
                {typeLabel}
              </strong>

              <br />

              {photo.category ||
                "-"}

              {photo.sub_category
                ? ` · ${photo.sub_category}`
                : ""}

              {photo.ai_description && (
                <div
                  style={{
                    marginTop:
                      "7px",
                    color:
                      "#6b7280",
                    fontSize:
                      "14px",
                    whiteSpace:
                      "pre-wrap",
                  }}
                >
                  {
                    photo.ai_description
                  }
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                startPhotoEdit(
                  photo
                )
              }
              style={{
                ...secondaryButtonStyle,
                marginTop:
                  "10px",
              }}
            >
              ✏️ 사진정보 수정
            </button>

            <button
              type="button"
              onClick={() =>
                deletePhoto(
                  photo
                )
              }
              style={{
                ...secondaryButtonStyle,
                marginTop:
                  "7px",
                color:
                  "#b91c1c",
              }}
            >
              🗑️ 사진 삭제
            </button>
          </>
        ) : (
          <div
            style={{
              marginTop:
                "12px",
              padding:
                "12px",
              background:
                "#f9fafb",
              borderRadius:
                "10px",
            }}
          >
            <select
              value={
                editPhotoType
              }
              onChange={(
                e
              ) =>
                setEditPhotoType(
                  e.target
                    .value
                )
              }
              style={
                inputStyle
              }
            >
              <option value="before">
                시공 전
              </option>

              <option value="after">
                시공 후
              </option>

              <option value="history">
                기존 사진
              </option>
            </select>

            <input
              value={
                editPhotoCategory
              }
              onChange={(
                e
              ) =>
                setEditPhotoCategory(
                  e.target
                    .value
                )
              }
              placeholder="카테고리"
              style={{
                ...inputStyle,
                marginTop:
                  "8px",
              }}
            />

            <input
              value={
                editPhotoSubCategory
              }
              onChange={(
                e
              ) =>
                setEditPhotoSubCategory(
                  e.target
                    .value
                )
              }
              placeholder="세부 부위"
              style={{
                ...inputStyle,
                marginTop:
                  "8px",
              }}
            />

            <textarea
              value={
                editPhotoDescription
              }
              onChange={(
                e
              ) =>
                setEditPhotoDescription(
                  e.target
                    .value
                )
              }
              rows={6}
              placeholder="AI 사진 설명"
              style={{
                ...inputStyle,
                marginTop:
                  "8px",
                resize:
                  "vertical",
              }}
            />

            <button
              type="button"
              onClick={() =>
                savePhotoEdit(
                  photo
                )
              }
              disabled={
                photoEditLoading
              }
              style={{
                ...primaryButtonStyle,
                marginTop:
                  "10px",
                opacity:
                  photoEditLoading
                    ? 0.6
                    : 1,
              }}
            >
              {photoEditLoading
                ? "저장 중..."
                : "수정 저장"}
            </button>

            <button
              type="button"
              onClick={
                cancelPhotoEdit
              }
              style={{
                ...secondaryButtonStyle,
                marginTop:
                  "7px",
              }}
            >
              취소
            </button>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // 페이지 계산
  // ============================================================

  const jobTotalPages =
    getTotalPages(
      jobTotal,
      JOB_PAGE_SIZE
    );

  const leadTotalPages =
    getTotalPages(
      leadTotal,
      LEAD_PAGE_SIZE
    );

  // ============================================================
  // 화면
  // ============================================================

  return (
    <main
      style={{
        maxWidth: "780px",
        margin: "0 auto",
        padding:
          "22px 14px 90px",
        fontFamily:
          "Arial, sans-serif",
        background:
          "#f8fafc",
        minHeight:
          "100vh",
        color: "#111827",
        boxSizing:
          "border-box",
      }}
    >
      {/* 신규상담 실시간 알림 */}

      {newLeadAlert && (
        <div
          style={{
            position:
              "sticky",
            top: "8px",
            zIndex: 100,
            padding:
              "16px",
            marginBottom:
              "14px",
            background:
              "#fee2e2",
            border:
              "2px solid #ef4444",
            borderRadius:
              "14px",
            boxShadow:
              "0 8px 28px rgba(0,0,0,0.18)",
          }}
        >
          <div
            style={{
              fontSize:
                "19px",
              fontWeight:
                "bold",
              color:
                "#991b1b",
            }}
          >
            🔴 신규 상담이
            들어왔습니다
          </div>

          <div
            style={{
              marginTop:
                "7px",
              lineHeight:
                "1.7",
            }}
          >
            <strong>
              {newLeadAlert.customer_name ||
                "고객"}
            </strong>

            {newLeadAlert.region
              ? ` · ${newLeadAlert.region}`
              : ""}

            <br />

            {newLeadAlert.phone ||
              ""}
          </div>

          <button
            type="button"
            onClick={() => {
              changeTab(
                "leads"
              );

              setLeadFilter(
                "unread"
              );

              setNewLeadAlert(
                null
              );

              loadLeads(
                1,
                "unread"
              );
            }}
            style={{
              ...primaryButtonStyle,
              marginTop:
                "10px",
              background:
                "#dc2626",
            }}
          >
            상담 확인하기
          </button>

          <button
            type="button"
            onClick={() =>
              setNewLeadAlert(
                null
              )
            }
            style={{
              ...secondaryButtonStyle,
              marginTop:
                "7px",
            }}
          >
            닫기
          </button>
        </div>
      )}

      <div
        style={{
          display:
            "inline-block",
          padding:
            "8px 14px",
          borderRadius:
            "22px",
          background:
            "#111827",
          color:
            "#ffffff",
          fontWeight:
            "bold",
        }}
      >
        기분좋은공간
      </div>

      <h1
        style={{
          marginTop:
            "25px",
          marginBottom:
            "18px",
          fontSize:
            "34px",
        }}
      >
        관리자 페이지
      </h1>

      {/* ===================================================== */}
      {/* 핵심 상단 탭 */}
      {/* ===================================================== */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: "8px",
          marginBottom:
            "20px",
          position:
            "sticky",
          top: "0",
          zIndex: 20,
          padding:
            "8px 0",
          background:
            "#f8fafc",
        }}
      >
        <button
          type="button"
          onClick={() => {
            changeTab(
              "jobs"
            );
          }}
          style={{
            padding:
              "15px 8px",
            borderRadius:
              "12px",

            border:
              activeTab ===
              "jobs"
                ? "2px solid #111827"
                : "1px solid #d1d5db",

            background:
              activeTab ===
              "jobs"
                ? "#111827"
                : "#ffffff",

            color:
              activeTab ===
              "jobs"
                ? "#ffffff"
                : "#111827",

            fontWeight:
              "bold",

            fontSize:
              "15px",
          }}
        >
          🛠️ 시공 DB
        </button>

        <button
          type="button"
          onClick={() => {
            changeTab(
              "leads"
            );

            loadLeads(
              1,
              leadFilter
            );
          }}
          style={{
            position:
              "relative",
            padding:
              "15px 8px",
            borderRadius:
              "12px",

            border:
              activeTab ===
              "leads"
                ? "2px solid #111827"
                : "1px solid #d1d5db",

            background:
              activeTab ===
              "leads"
                ? "#111827"
                : "#ffffff",

            color:
              activeTab ===
              "leads"
                ? "#ffffff"
                : "#111827",

            fontWeight:
              "bold",

            fontSize:
              "15px",
          }}
        >
          📞 고객 상담

          {unreadCount >
            0 && (
            <span
              style={{
                display:
                  "inline-block",
                minWidth:
                  "22px",
                marginLeft:
                  "6px",
                padding:
                  "3px 7px",
                borderRadius:
                  "999px",
                background:
                  "#ef4444",
                color:
                  "#ffffff",
                fontSize:
                  "12px",
                lineHeight:
                  "18px",
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* ===================================================== */}
      {/* 시공 DB TAB */}
      {/* ===================================================== */}

      {activeTab ===
        "jobs" && (
        <>
          {/* AI 설정 */}

          <section
            style={
              sectionStyle
            }
          >
            <h2
              style={{
                marginTop:
                  0,
              }}
            >
              AI 유사도 기준
            </h2>

            <p
              style={{
                color:
                  "#6b7280",
                lineHeight:
                  "1.6",
              }}
            >
              고객사진과 과거
              시공사진을 비교할 때
              사용할 최소 유사도
              기준입니다.
            </p>

            <select
              value={
                similarityThreshold
              }
              onChange={(
                e
              ) =>
                setSimilarityThreshold(
                  Number(
                    e.target
                      .value
                  )
                )
              }
              style={
                inputStyle
              }
            >
              <option value={0.5}>
                50%
              </option>

              <option value={0.55}>
                55%
              </option>

              <option value={0.6}>
                60%
              </option>

              <option value={0.65}>
                65%
              </option>

              <option value={0.7}>
                70%
              </option>

              <option value={0.75}>
                75%
              </option>
            </select>

            <button
              type="button"
              onClick={
                saveSimilaritySetting
              }
              disabled={
                settingLoading
              }
              style={{
                ...primaryButtonStyle,
                marginTop:
                  "10px",
              }}
            >
              {settingLoading
                ? "저장 중..."
                : "유사도 기준 저장"}
            </button>

            {settingMessage && (
              <div
                style={{
                  marginTop:
                    "10px",
                }}
              >
                {
                  settingMessage
                }
              </div>
            )}
          </section>

          {/* 시공등록 */}

          <section
            style={
              sectionStyle
            }
          >
            <h2
              style={{
                marginTop:
                  0,
              }}
            >
              과거 시공 데이터
              등록
            </h2>

            <div
              style={{
                padding:
                  "14px",
                background:
                  "#eff6ff",
                borderRadius:
                  "12px",
                lineHeight:
                  "1.7",
                marginBottom:
                  "18px",
              }}
            >
              시공 전·후 사진은
              여러 장 선택할 수
              있습니다.
              <br />
              사진 장수와 순서는
              서로 달라도 됩니다.
              <br />
              AI가 사진을 분석하고
              검색용 데이터까지
              자동으로 저장합니다.
            </div>

            <label
              style={{
                fontWeight:
                  "bold",
                display:
                  "block",
              }}
            >
              📷 시공 전 사진
            </label>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={async (
                e
              ) => {
                const files =
                  Array.from(
                    e.target
                      .files ||
                      []
                  );

                const unique =
                  await removeDuplicateImages(
                    files,
                    afterImages
                  );

                setBeforeImages(
                  unique
                );
              }}
              style={{
                display:
                  "block",
                marginTop:
                  "10px",
                width:
                  "100%",
              }}
            />

            {beforeImages.length >
              0 && (
              <div
                style={{
                  marginTop:
                    "8px",
                  fontWeight:
                    "bold",
                }}
              >
                선택{" "}
                {
                  beforeImages.length
                }
                장
              </div>
            )}

            <div
              style={{
                height:
                  "20px",
              }}
            />

            <label
              style={{
                fontWeight:
                  "bold",
                display:
                  "block",
              }}
            >
              ✨ 시공 후 사진
            </label>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={async (
                e
              ) => {
                const files =
                  Array.from(
                    e.target
                      .files ||
                      []
                  );

                const unique =
                  await removeDuplicateImages(
                    files,
                    beforeImages
                  );

                setAfterImages(
                  unique
                );
              }}
              style={{
                display:
                  "block",
                marginTop:
                  "10px",
                width:
                  "100%",
              }}
            />

            {afterImages.length >
              0 && (
              <div
                style={{
                  marginTop:
                    "8px",
                  fontWeight:
                    "bold",
                }}
              >
                선택{" "}
                {
                  afterImages.length
                }
                장
              </div>
            )}

            <input
              value={
                category
              }
              onChange={(
                e
              ) =>
                setCategory(
                  e.target
                    .value
                )
              }
              placeholder="시공 부위 예: 붙박이장, 싱크대, 방문"
              style={{
                ...inputStyle,
                marginTop:
                  "20px",
              }}
            />

            <input
              type="number"
              inputMode="numeric"
              value={
                actualCost
              }
              onChange={(
                e
              ) =>
                setActualCost(
                  e.target
                    .value
                )
              }
              placeholder="실제 시공금액"
              style={{
                ...inputStyle,
                marginTop:
                  "9px",
              }}
            />

            <input
              value={
                material
              }
              onChange={(
                e
              ) =>
                setMaterial(
                  e.target
                    .value
                )
              }
              placeholder="사용 자재 예: GS115 밀키화이트"
              style={{
                ...inputStyle,
                marginTop:
                  "9px",
              }}
            />

            <textarea
              value={
                memo
              }
              onChange={(
                e
              ) =>
                setMemo(
                  e.target
                    .value
                )
              }
              placeholder="메모"
              rows={4}
              style={{
                ...inputStyle,
                marginTop:
                  "9px",
                resize:
                  "vertical",
              }}
            />

            <button
              type="button"
              onClick={
                handleSave
              }
              disabled={
                loading
              }
              style={{
                ...primaryButtonStyle,
                marginTop:
                  "12px",
                opacity:
                  loading
                    ? 0.6
                    : 1,
              }}
            >
              {loading
                ? "AI 분석 및 저장 중..."
                : "시공 데이터 저장"}
            </button>

            {message && (
              <div
                style={{
                  marginTop:
                    "13px",
                  lineHeight:
                    "1.7",
                  whiteSpace:
                    "pre-wrap",
                }}
              >
                {message}
              </div>
            )}
          </section>

          {/* DB관리 */}

          <section
            style={
              sectionStyle
            }
          >
            <h2
              style={{
                marginTop:
                  0,
              }}
            >
              데이터베이스 관리
            </h2>

            <div
              style={{
                padding:
                  "12px",
                background:
                  "#f3f4f6",
                borderRadius:
                  "10px",
                marginBottom:
                  "12px",
                lineHeight:
                  "1.6",
              }}
            >
              목록에서는 사진을
              불러오지 않습니다.
              <br />
              <strong>
                상세보기
              </strong>
              를 눌렀을 때만 해당
              시공사진을
              불러옵니다.
            </div>

            <input
              value={
                jobSearch
              }
              onChange={(
                e
              ) =>
                setJobSearch(
                  e.target
                    .value
                )
              }
              onKeyDown={(
                e
              ) => {
                if (
                  e.key ===
                  "Enter"
                ) {
                  searchJobs();
                }
              }}
              placeholder="시공 부위 또는 메모 검색"
              style={
                inputStyle
              }
            />

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "8px",
                marginTop:
                  "8px",
              }}
            >
              <button
                type="button"
                onClick={
                  searchJobs
                }
                style={
                  primaryButtonStyle
                }
              >
                🔍 검색
              </button>

              <button
                type="button"
                onClick={
                  clearJobSearch
                }
                style={
                  secondaryButtonStyle
                }
              >
                전체보기
              </button>
            </div>

            <div
              style={{
                marginTop:
                  "16px",
                padding:
                  "11px",
                background:
                  "#f3f4f6",
                borderRadius:
                  "10px",
              }}
            >
              전체{" "}
              <strong>
                {jobTotal}
              </strong>
              건 ·{" "}
              {jobPage}/
              {
                jobTotalPages
              }
              페이지
            </div>

            {jobsLoading && (
              <div
                style={{
                  padding:
                    "25px 0",
                  textAlign:
                    "center",
                }}
              >
                불러오는 중...
              </div>
            )}

            {jobsMessage && (
              <div
                style={{
                  marginTop:
                    "12px",
                  lineHeight:
                    "1.6",
                }}
              >
                {
                  jobsMessage
                }
              </div>
            )}

            {!jobsLoading &&
              jobs.length ===
                0 && (
                <div
                  style={{
                    padding:
                      "30px 10px",
                    textAlign:
                      "center",
                    color:
                      "#6b7280",
                  }}
                >
                  등록된 시공
                  데이터가 없습니다.
                </div>
              )}

            {!jobsLoading &&
              jobs.map(
                (job) => {
                  const isOpen =
                    openJobId ===
                    job.id;

                  const isEditing =
                    editingId ===
                    job.id;

                  const detailPhotos =
                    jobPhotos[
                      job.id
                    ] || [];

                  const photoLoading =
                    jobPhotoLoadingId ===
                    job.id;

                  return (
                    <div
                      key={
                        job.id
                      }
                      style={{
                        marginTop:
                          "12px",
                        padding:
                          "16px",
                        border:
                          "1px solid #e5e7eb",
                        borderRadius:
                          "14px",
                        background:
                          "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          fontSize:
                            "19px",
                          fontWeight:
                            "bold",
                        }}
                      >
                        {job.category ||
                          "시공건"}
                      </div>

                      {job.sub_category &&
                        job.sub_category !==
                          job.category && (
                          <div
                            style={{
                              marginTop:
                                "4px",
                              color:
                                "#6b7280",
                            }}
                          >
                            {
                              job.sub_category
                            }
                          </div>
                        )}

                      <div
                        style={{
                          marginTop:
                            "9px",
                          lineHeight:
                            "1.8",
                        }}
                      >
                        💰{" "}
                        {formatWon(
                          job.actual_cost
                        )}
                        <br />
                        📅{" "}
                        {formatDate(
                          job.created_at
                        )}
                      </div>

                      {job.memo && (
                        <div
                          style={{
                            marginTop:
                              "8px",
                            padding:
                              "9px",
                            background:
                              "#f9fafb",
                            borderRadius:
                              "8px",
                            color:
                              "#4b5563",
                          }}
                        >
                          📝{" "}
                          {
                            job.memo
                          }
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          toggleJobDetail(
                            job
                          )
                        }
                        style={{
                          ...primaryButtonStyle,
                          marginTop:
                            "12px",
                        }}
                      >
                        {isOpen
                          ? "상세 닫기"
                          : "사진 · 상세보기"}
                      </button>

                      {isOpen && (
                        <div
                          style={{
                            marginTop:
                              "14px",
                            paddingTop:
                              "14px",
                            borderTop:
                              "1px solid #e5e7eb",
                          }}
                        >
                          {photoLoading && (
                            <div
                              style={{
                                textAlign:
                                  "center",
                                padding:
                                  "20px",
                              }}
                            >
                              사진
                              불러오는
                              중...
                            </div>
                          )}

                          {!photoLoading &&
                            detailPhotos.length ===
                              0 && (
                              <div
                                style={{
                                  padding:
                                    "15px",
                                  textAlign:
                                    "center",
                                  color:
                                    "#6b7280",
                                }}
                              >
                                등록된 사진이
                                없습니다.
                              </div>
                            )}

                          {!photoLoading &&
                            detailPhotos.map(
                              (
                                photo
                              ) => (
                                <PhotoCard
                                  key={
                                    photo.id
                                  }
                                  photo={
                                    photo
                                  }
                                />
                              )
                            )}

                          {!isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  startEdit(
                                    job
                                  )
                                }
                                style={{
                                  ...secondaryButtonStyle,
                                  marginTop:
                                    "14px",
                                }}
                              >
                                ✏️ 시공정보
                                수정
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  deleteJob(
                                    job
                                  )
                                }
                                style={{
                                  ...secondaryButtonStyle,
                                  marginTop:
                                    "7px",
                                  color:
                                    "#b91c1c",
                                }}
                              >
                                🗑️ 시공건
                                전체 삭제
                              </button>
                            </>
                          ) : (
                            <div
                              style={{
                                marginTop:
                                  "14px",
                                padding:
                                  "12px",
                                background:
                                  "#f9fafb",
                                borderRadius:
                                  "10px",
                              }}
                            >
                              <input
                                value={
                                  editCategory
                                }
                                onChange={(
                                  e
                                ) =>
                                  setEditCategory(
                                    e
                                      .target
                                      .value
                                  )
                                }
                                placeholder="시공 부위"
                                style={
                                  inputStyle
                                }
                              />

                              <input
                                value={
                                  editSubCategory
                                }
                                onChange={(
                                  e
                                ) =>
                                  setEditSubCategory(
                                    e
                                      .target
                                      .value
                                  )
                                }
                                placeholder="세부 부위"
                                style={{
                                  ...inputStyle,
                                  marginTop:
                                    "8px",
                                }}
                              />

                              <input
                                type="number"
                                inputMode="numeric"
                                value={
                                  editCost
                                }
                                onChange={(
                                  e
                                ) =>
                                  setEditCost(
                                    e
                                      .target
                                      .value
                                  )
                                }
                                placeholder="실제 시공금액"
                                style={{
                                  ...inputStyle,
                                  marginTop:
                                    "8px",
                                }}
                              />

                              <textarea
                                value={
                                  editMemo
                                }
                                onChange={(
                                  e
                                ) =>
                                  setEditMemo(
                                    e
                                      .target
                                      .value
                                  )
                                }
                                placeholder="메모"
                                rows={
                                  4
                                }
                                style={{
                                  ...inputStyle,
                                  marginTop:
                                    "8px",
                                }}
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  saveJobEdit(
                                    job.id
                                  )
                                }
                                style={{
                                  ...primaryButtonStyle,
                                  marginTop:
                                    "10px",
                                }}
                              >
                                수정 저장
                              </button>

                              <button
                                type="button"
                                onClick={
                                  cancelEdit
                                }
                                style={{
                                  ...secondaryButtonStyle,
                                  marginTop:
                                    "7px",
                                }}
                              >
                                취소
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
              )}

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "1fr auto 1fr",
                gap: "8px",
                alignItems:
                  "center",
                marginTop:
                  "18px",
              }}
            >
              <button
                type="button"
                disabled={
                  jobPage <= 1 ||
                  jobsLoading
                }
                onClick={() =>
                  loadJobs(
                    jobPage -
                      1,
                    jobSearchApplied
                  )
                }
                style={{
                  ...secondaryButtonStyle,
                  opacity:
                    jobPage <= 1
                      ? 0.4
                      : 1,
                }}
              >
                ← 이전
              </button>

              <strong
                style={{
                  whiteSpace:
                    "nowrap",
                }}
              >
                {jobPage} /{" "}
                {
                  jobTotalPages
                }
              </strong>

              <button
                type="button"
                disabled={
                  jobPage >=
                    jobTotalPages ||
                  jobsLoading
                }
                onClick={() =>
                  loadJobs(
                    jobPage +
                      1,
                    jobSearchApplied
                  )
                }
                style={{
                  ...secondaryButtonStyle,

                  opacity:
                    jobPage >=
                    jobTotalPages
                      ? 0.4
                      : 1,
                }}
              >
                다음 →
              </button>
            </div>
          </section>
        </>
      )}

      {/* ===================================================== */}
      {/* 고객상담 TAB */}
      {/* ===================================================== */}

      {activeTab ===
        "leads" && (
        <section
          style={
            sectionStyle
          }
        >
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            고객 상담 문의
          </h2>

          <div
            style={{
              padding:
                "14px",
              borderRadius:
                "12px",
              background:
                unreadCount >
                0
                  ? "#fee2e2"
                  : "#dcfce7",

              color:
                unreadCount >
                0
                  ? "#991b1b"
                  : "#166534",

              fontWeight:
                "bold",

              fontSize:
                "17px",
            }}
          >
            {unreadCount >
            0
              ? `🔴 확인하지 않은 상담 ${unreadCount}건`
              : "✅ 확인하지 않은 상담이 없습니다."}
          </div>

          <p
            style={{
              color:
                "#6b7280",
              lineHeight:
                "1.7",
            }}
          >
            상담을 열어보기만
            해도 자동으로
            확인처리하지 않습니다.
            <br />
            반드시{" "}
            <strong>
              상담 확인 처리
            </strong>
            를 눌러야 확인된
            상담으로 변경됩니다.
          </p>

          <button
            type="button"
            onClick={
              enableNotifications
            }
            style={
              secondaryButtonStyle
            }
          >
            {notificationEnabled
              ? "🔔 브라우저 알림 켜짐"
              : "🔔 신규 상담 알림 켜기"}
          </button>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "1fr 1fr 1fr",
              gap: "6px",
              marginTop:
                "14px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setLeadFilter(
                  "all"
                );

                loadLeads(
                  1,
                  "all"
                );
              }}
              style={{
                padding:
                  "11px 3px",

                borderRadius:
                  "9px",

                border:
                  leadFilter ===
                  "all"
                    ? "2px solid #111827"
                    : "1px solid #d1d5db",

                background:
                  leadFilter ===
                  "all"
                    ? "#111827"
                    : "#ffffff",

                color:
                  leadFilter ===
                  "all"
                    ? "#ffffff"
                    : "#111827",

                fontWeight:
                  "bold",
              }}
            >
              전체
            </button>

            <button
              type="button"
              onClick={() => {
                setLeadFilter(
                  "unread"
                );

                loadLeads(
                  1,
                  "unread"
                );
              }}
              style={{
                padding:
                  "11px 3px",

                borderRadius:
                  "9px",

                border:
                  leadFilter ===
                  "unread"
                    ? "2px solid #ef4444"
                    : "1px solid #d1d5db",

                background:
                  leadFilter ===
                  "unread"
                    ? "#fee2e2"
                    : "#ffffff",

                color:
                  "#b91c1c",

                fontWeight:
                  "bold",
              }}
            >
              🔴 미확인
            </button>

            <button
              type="button"
              onClick={() => {
                setLeadFilter(
                  "read"
                );

                loadLeads(
                  1,
                  "read"
                );
              }}
              style={{
                padding:
                  "11px 3px",

                borderRadius:
                  "9px",

                border:
                  leadFilter ===
                  "read"
                    ? "2px solid #16a34a"
                    : "1px solid #d1d5db",

                background:
                  leadFilter ===
                  "read"
                    ? "#dcfce7"
                    : "#ffffff",

                color:
                  "#166534",

                fontWeight:
                  "bold",
              }}
            >
              ✅ 확인
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              loadLeads(
                1,
                leadFilter
              )
            }
            style={{
              ...secondaryButtonStyle,
              marginTop:
                "9px",
            }}
          >
            🔄 새로고침
          </button>

          <div
            style={{
              marginTop:
                "14px",
              padding:
                "10px",
              background:
                "#f3f4f6",
              borderRadius:
                "10px",
            }}
          >
            검색 결과{" "}
            <strong>
              {leadTotal}
            </strong>
            건 ·{" "}
            {leadPage}/
            {
              leadTotalPages
            }
            페이지
          </div>

          {leadsLoading && (
            <div
              style={{
                padding:
                  "25px",
                textAlign:
                  "center",
              }}
            >
              상담 문의
              불러오는 중...
            </div>
          )}

          {leadsMessage && (
            <div
              style={{
                marginTop:
                  "12px",
                lineHeight:
                  "1.6",
              }}
            >
              {
                leadsMessage
              }
            </div>
          )}

          {!leadsLoading &&
            leads.length ===
              0 && (
              <div
                style={{
                  marginTop:
                    "15px",
                  padding:
                    "35px 10px",
                  textAlign:
                    "center",
                  color:
                    "#6b7280",
                }}
              >
                해당 상담 문의가
                없습니다.
              </div>
            )}

          {!leadsLoading &&
            leads.map(
              (lead) => {
                const isOpen =
                  openLeadId ===
                  lead.id;

                const customerPhotoUrl =
                  leadPhotoUrls[
                    lead.id
                  ];

                const photoLoading =
                  leadPhotoLoadingId ===
                  lead.id;

                return (
                  <div
                    key={
                      lead.id
                    }
                    style={{
                      marginTop:
                        "12px",

                      padding:
                        "16px",

                      border:
                        lead.is_read
                          ? "1px solid #d1d5db"
                          : "2px solid #ef4444",

                      borderRadius:
                        "14px",

                      background:
                        lead.is_read
                          ? "#ffffff"
                          : "#fff7f7",
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",

                        justifyContent:
                          "space-between",

                        gap:
                          "10px",

                        alignItems:
                          "flex-start",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize:
                              "20px",
                            fontWeight:
                              "bold",
                          }}
                        >
                          {lead.customer_name ||
                            "고객"}
                        </div>

                        <div
                          style={{
                            marginTop:
                              "5px",

                            fontWeight:
                              "bold",

                            color:
                              lead.is_read
                                ? "#166534"
                                : "#dc2626",
                          }}
                        >
                          {lead.is_read
                            ? "✅ 확인됨"
                            : "🔴 미확인 상담"}
                        </div>
                      </div>

                      <div
                        style={{
                          padding:
                            "6px 9px",

                          borderRadius:
                            "999px",

                          background:
                            "#f3f4f6",

                          fontSize:
                            "13px",

                          fontWeight:
                            "bold",

                          whiteSpace:
                            "nowrap",
                        }}
                      >
                        {lead.status ||
                          "신규문의"}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop:
                          "11px",

                        lineHeight:
                          "1.9",
                      }}
                    >
                      📞{" "}
                      <a
                        href={`tel:${lead.phone}`}
                        style={{
                          color:
                            "#2563eb",

                          fontWeight:
                            "bold",

                          textDecoration:
                            "none",
                        }}
                      >
                        {lead.phone ||
                          "-"}
                      </a>

                      <br />

                      📍{" "}
                      {lead.region ||
                        "-"}

                      <br />

                      🛠️{" "}
                      {lead.category ||
                        "-"}

                      {lead.sub_category
                        ? ` · ${lead.sub_category}`
                        : ""}

                      <br />

                      📅{" "}
                      {formatDate(
                        lead.created_at
                      )}
                    </div>

                    {lead.estimate_min !==
                      null &&
                      lead.estimate_min !==
                        undefined &&
                      lead.estimate_max !==
                        null &&
                      lead.estimate_max !==
                        undefined && (
                        <div
                          style={{
                            marginTop:
                              "10px",

                            padding:
                              "11px",

                            background:
                              "#f3f4f6",

                            borderRadius:
                              "9px",

                            lineHeight:
                              "1.7",
                          }}
                        >
                          AI 예상견적
                          <br />

                          <strong>
                            {formatWon(
                              lead.estimate_min
                            )}{" "}
                            ~{" "}
                            {formatWon(
                              lead.estimate_max
                            )}
                          </strong>

                          {lead.estimate_average !==
                            null &&
                            lead.estimate_average !==
                              undefined && (
                              <>
                                <br />
                                평균{" "}
                                {formatWon(
                                  lead.estimate_average
                                )}
                              </>
                            )}
                        </div>
                      )}

                    {!lead.is_read && (
                      <button
                        type="button"
                        onClick={() =>
                          markLeadRead(
                            lead
                          )
                        }
                        style={{
                          ...primaryButtonStyle,

                          marginTop:
                            "12px",

                          background:
                            "#dc2626",
                        }}
                      >
                        ✅ 이 상담 확인
                        처리
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        toggleLeadDetail(
                          lead
                        )
                      }
                      style={{
                        ...secondaryButtonStyle,
                        marginTop:
                          "7px",
                      }}
                    >
                      {isOpen
                        ? "상세 닫기"
                        : "상담 상세보기"}
                    </button>

                    {isOpen && (
                      <div
                        style={{
                          marginTop:
                            "14px",

                          paddingTop:
                            "14px",

                          borderTop:
                            "1px solid #e5e7eb",
                        }}
                      >
                        {photoLoading && (
                          <div
                            style={{
                              padding:
                                "20px",
                              textAlign:
                                "center",
                            }}
                          >
                            고객사진
                            불러오는 중...
                          </div>
                        )}

                        {!photoLoading &&
                          customerPhotoUrl && (
                            <img
                              src={
                                customerPhotoUrl
                              }
                              alt="고객 상담 사진"
                              style={{
                                width:
                                  "100%",

                                maxHeight:
                                  "500px",

                                objectFit:
                                  "contain",

                                background:
                                  "#f3f4f6",

                                borderRadius:
                                  "12px",
                              }}
                            />
                          )}

                        {!lead.customer_photo_path && (
                          <div
                            style={{
                              padding:
                                "15px",

                              textAlign:
                                "center",

                              color:
                                "#6b7280",

                              background:
                                "#f9fafb",

                              borderRadius:
                                "9px",
                            }}
                          >
                            저장된
                            고객사진이
                            없습니다.
                          </div>
                        )}

                        <div
                          style={{
                            marginTop:
                              "14px",

                            lineHeight:
                              "1.7",
                          }}
                        >
                          <strong>
                            AI 사진 분석
                          </strong>

                          {lead.ai_description ? (
                            <div
                              style={{
                                marginTop:
                                  "7px",

                                whiteSpace:
                                  "pre-wrap",

                                color:
                                  "#4b5563",
                              }}
                            >
                              {
                                lead.ai_description
                              }
                            </div>
                          ) : (
                            <div
                              style={{
                                marginTop:
                                  "7px",

                                color:
                                  "#6b7280",
                              }}
                            >
                              분석 내용이
                              없습니다.
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            marginTop:
                              "16px",
                          }}
                        >
                          <strong>
                            상담 진행상태
                          </strong>

                          <select
                            value={
                              lead.status ||
                              "신규문의"
                            }
                            onChange={(
                              e
                            ) =>
                              updateLeadStatus(
                                lead.id,
                                e
                                  .target
                                  .value
                              )
                            }
                            style={{
                              ...inputStyle,
                              marginTop:
                                "8px",
                            }}
                          >
                            {STATUS_OPTIONS.map(
                              (
                                status
                              ) => (
                                <option
                                  key={
                                    status
                                  }
                                  value={
                                    status
                                  }
                                >
                                  {
                                    status
                                  }
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        {lead.memo && (
                          <div
                            style={{
                              marginTop:
                                "12px",

                              padding:
                                "11px",

                              background:
                                "#f9fafb",

                              borderRadius:
                                "9px",

                              whiteSpace:
                                "pre-wrap",
                            }}
                          >
                            📝{" "}
                            {
                              lead.memo
                            }
                          </div>
                        )}

                        {lead.is_read && (
                          <div
                            style={{
                              marginTop:
                                "12px",
                            }}
                          >
                            <div
                              style={{
                                fontSize:
                                  "13px",
                                color:
                                  "#6b7280",
                                marginBottom:
                                  "7px",
                              }}
                            >
                              확인시간:{" "}
                              {formatDate(
                                lead.read_at
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                markLeadUnread(
                                  lead
                                )
                              }
                              style={
                                secondaryButtonStyle
                              }
                            >
                              🔴 다시 미확인으로
                              표시
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            deleteLead(
                              lead
                            )
                          }
                          style={{
                            ...secondaryButtonStyle,

                            marginTop:
                              "7px",

                            color:
                              "#b91c1c",
                          }}
                        >
                          🗑️ 상담 삭제
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
            )}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "1fr auto 1fr",

              alignItems:
                "center",

              gap: "8px",

              marginTop:
                "18px",
            }}
          >
            <button
              type="button"
              disabled={
                leadPage <= 1 ||
                leadsLoading
              }
              onClick={() =>
                loadLeads(
                  leadPage -
                    1,
                  leadFilter
                )
              }
              style={{
                ...secondaryButtonStyle,

                opacity:
                  leadPage <=
                  1
                    ? 0.4
                    : 1,
              }}
            >
              ← 이전
            </button>

            <strong
              style={{
                whiteSpace:
                  "nowrap",
              }}
            >
              {leadPage} /{" "}
              {
                leadTotalPages
              }
            </strong>

            <button
              type="button"
              disabled={
                leadPage >=
                  leadTotalPages ||
                leadsLoading
              }
              onClick={() =>
                loadLeads(
                  leadPage +
                    1,
                  leadFilter
                )
              }
              style={{
                ...secondaryButtonStyle,

                opacity:
                  leadPage >=
                  leadTotalPages
                    ? 0.4
                    : 1,
              }}
            >
              다음 →
            </button>
          </div>
        </section>
      )}

      {/* ===================================================== */}
      {/* 사진 전체화면 */}
      {/* ===================================================== */}

      {previewPhoto?.signedUrl && (
        <div
          onClick={() =>
            setPreviewPhoto(
              null
            )
          }
          style={{
            position:
              "fixed",
            inset: 0,
            zIndex: 1000,
            background:
              "rgba(0,0,0,0.92)",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            padding:
              "15px",
          }}
        >
          <img
            src={
              previewPhoto.signedUrl
            }
            alt="사진 확대"
            onClick={(
              e
            ) =>
              e.stopPropagation()
            }
            style={{
              maxWidth:
                "100%",
              maxHeight:
                "90vh",
              objectFit:
                "contain",
            }}
          />

          <button
            type="button"
            onClick={() =>
              setPreviewPhoto(
                null
              )
            }
            style={{
              position:
                "absolute",
              top: "20px",
              right: "20px",
              width: "48px",
              height:
                "48px",
              borderRadius:
                "50%",
              border:
                "none",
              background:
                "#ffffff",
              fontSize:
                "24px",
              fontWeight:
                "bold",
            }}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
              }
