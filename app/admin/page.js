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

  const [editPhotoType, setEditPhotoType] = useState("before");

  const [editPhotoCategory, setEditPhotoCategory] =
    useState("");

  const [editPhotoSubCategory, setEditPhotoSubCategory] =
    useState("");

  const [editPhotoDescription, setEditPhotoDescription] =
    useState("");

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

  const [notificationEnabled, setNotificationEnabled] =
    useState(false);

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

    return `${Number(value).toLocaleString("ko-KR")}원`;
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
  // 브라우저 / 휴대폰 푸시 알림
  // ============================================================

  async function enableNotifications() {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      alert("이 브라우저는 푸시 알림을 지원하지 않습니다.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setNotificationEnabled(false);
        alert("알림 권한을 허용해주세요.");
        return;
      }

      const registration =
        await navigator.serviceWorker.register("/sw.js");

      await navigator.serviceWorker.ready;

      const publicKey =
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!publicKey) {
        throw new Error(
          "VAPID 공개키가 설정되지 않았습니다."
        );
      }

      const padding = "=".repeat(
        (4 - (publicKey.length % 4)) % 4
      );

      const base64 = (publicKey + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      const rawData = window.atob(base64);

      const applicationServerKey =
        new Uint8Array(rawData.length);

      for (let i = 0; i < rawData.length; i++) {
        applicationServerKey[i] =
          rawData.charCodeAt(i);
      }

      let subscription =
        await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription =
          await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
      }

      const subscriptionJson =
        subscription.toJSON();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "관리자 로그인 정보를 확인할 수 없습니다."
        );
      }

      const { error: saveError } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint: subscriptionJson.endpoint,
            p256dh: subscriptionJson.keys?.p256dh,
            auth: subscriptionJson.keys?.auth,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "endpoint",
          }
        );

      if (saveError) throw saveError;

      setNotificationEnabled(true);

      await registration.showNotification(
        "기분좋은공간",
        {
          body: "이 휴대폰에 신규 상담 푸시 알림이 등록되었습니다.",
          tag: "push-registration",
          data: {
            url: "/admin",
          },
        }
      );
    } catch (error) {
      console.error("푸시 알림 등록 오류:", error);

      setNotificationEnabled(false);

      alert(
        `푸시 알림 등록 오류: ${
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
        new Notification("🔔 신규 상담이 들어왔습니다.", {
          body: `${lead.customer_name || "고객"} ${
            lead.phone || ""
          }`,
        });
      }
    } catch {}

    if (activeTabRef.current === "leads") {
      loadLeads(1, leadFilter);
    }
  }

  // ============================================================
  // AI 유사도 설정
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
        data?.similarity_threshold !== null &&
        data?.similarity_threshold !== undefined
      ) {
        setSimilarityThreshold(
          Number(data.similarity_threshold)
        );
      }
    } catch (error) {
      console.error("설정 불러오기 오류:", error);
    }
  }

  async function saveSimilaritySetting() {
    setSettingLoading(true);
    setSettingMessage("");

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
        `✅ AI 유사도 기준을 ${Math.round(
          Number(similarityThreshold) * 100
        )}%로 저장했습니다.`
      );
    } catch (error) {
      console.error(error);

      setSettingMessage(
        `❌ 설정 저장 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setSettingLoading(false);
    }
  }

  // ============================================================
  // 시공 DB 목록
  // ============================================================

  async function loadJobs(page = 1, keyword = "") {
    setJobsLoading(true);
    setJobsMessage("");

    try {
      const from = (page - 1) * JOB_PAGE_SIZE;
      const to = from + JOB_PAGE_SIZE - 1;

      const safeKeyword =
        sanitizeSearchKeyword(keyword);

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
        );

      if (safeKeyword) {
        query = query.or(
          `category.ilike.%${safeKeyword}%,sub_category.ilike.%${safeKeyword}%,memo.ilike.%${safeKeyword}%`
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

      setJobs(data || []);
      setJobTotal(count || 0);
      setJobPage(page);
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 시공 DB 오류: ${
          error?.message || "불러오기 실패"
        }`
      );
    } finally {
      setJobsLoading(false);
    }
  }

  function searchJobs() {
    const safeKeyword =
      sanitizeSearchKeyword(jobSearch);

    setJobSearchApplied(safeKeyword);
    loadJobs(1, safeKeyword);
  }

  function clearJobSearch() {
    setJobSearch("");
    setJobSearchApplied("");
    loadJobs(1, "");
  }

  // ============================================================
  // 시공 사진
  // ============================================================

  async function loadJobPhotos(workItemId) {
    setJobPhotoLoadingId(workItemId);

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
        .eq("work_item_id", workItemId)
        .order("created_at", {
          ascending: true,
        });

      if (error) throw error;

      const photosWithUrls = await Promise.all(
        (data || []).map(async (photo) => {
          if (!photo.storage_path) {
            return {
              ...photo,
              signedUrl: photo.photo_url || null,
            };
          }

          const {
            data: signedData,
            error: signedError,
          } = await supabase.storage
            .from("work-photos")
            .createSignedUrl(
              photo.storage_path,
              60 * 30
            );

          if (signedError) {
            console.error(signedError);

            return {
              ...photo,
              signedUrl: photo.photo_url || null,
            };
          }

          return {
            ...photo,
            signedUrl:
              signedData?.signedUrl ||
              photo.photo_url ||
              null,
          };
        })
      );

      setJobPhotos((current) => ({
        ...current,
        [workItemId]: photosWithUrls,
      }));
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 사진 불러오기 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setJobPhotoLoadingId(null);
    }
  }

  async function toggleJobDetail(jobId) {
    if (openJobId === jobId) {
      setOpenJobId(null);
      return;
    }

    setOpenJobId(jobId);

    if (!jobPhotos[jobId]) {
      await loadJobPhotos(jobId);
    }
  }

  // ============================================================
  // 시공정보 수정
  // ============================================================

  function startEdit(job) {
    setEditingId(job.id);
    setEditCategory(job.category || "");
    setEditSubCategory(job.sub_category || "");

    setEditCost(
      job.actual_cost !== null &&
        job.actual_cost !== undefined
        ? String(job.actual_cost)
        : ""
    );

    setEditMemo(job.memo || "");
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
          category: editCategory.trim(),

          sub_category:
            editSubCategory.trim() ||
            editCategory.trim(),

          actual_cost: costNumber,

          memo: editMemo.trim() || null,

          updated_at: new Date().toISOString(),
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
    if (!editPhotoCategory.trim()) {
      setJobsMessage(
        "⚠️ 사진 카테고리를 입력해주세요."
      );
      return;
    }

    setPhotoEditLoading(true);

    try {
      let tags = Array.isArray(photo.ai_tags)
        ? [...photo.ai_tags]
        : [];

      tags = tags.filter(
        (tag) =>
          tag !== "시공전" &&
          tag !== "시공후" &&
          tag !== "전후비교"
      );

      if (editPhotoType === "before") {
        tags.push("시공전");
      }

      if (editPhotoType === "after") {
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
        await createEmbedding(searchTextValue);

      const { error } = await supabase
        .from("work_photos")
        .update({
          photo_type: editPhotoType,

          category: editPhotoCategory.trim(),

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
          .remove([photo.storage_path]);

        if (storageError) {
          console.error(storageError);
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
          current[photo.work_item_id] || []
        ).filter(
          (item) => item.id !== photo.id
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
        .select("id, storage_path")
        .eq("work_item_id", job.id);

      if (photosError) {
        throw photosError;
      }

      const paths = (photos || [])
        .map(
          (photo) => photo.storage_path
        )
        .filter(Boolean);

      if (paths.length > 0) {
        const {
          error: storageError,
        } = await supabase.storage
          .from("work-photos")
          .remove(paths);

        if (storageError) {
          console.error(storageError);
        }
      }

      const {
        error: photoDeleteError,
      } = await supabase
        .from("work_photos")
        .delete()
        .eq("work_item_id", job.id);

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
          error?.message || "삭제 실패"
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
        .eq("is_read", false);

      if (error) throw error;

      setUnreadCount(count || 0);
    } catch (error) {
      console.error(error);
    }
  }

  // ============================================================
  // 상담 목록
  // 여러 고객사진 지원
  // ============================================================

  async function loadLeads(
    page = 1,
    filter = "all"
  ) {
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
          category,
          sub_category,
          ai_description,
          estimate_min,
          estimate_max,
          estimate_average,
          customer_photo_path,
          customer_photo_paths,
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

      if (filter === "unread") {
        query = query.eq(
          "is_read",
          false
        );
      }

      if (filter === "read") {
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
        `❌ 상담목록 오류: ${
          error?.message || "불러오기 실패"
        }`
      );
    } finally {
      setLeadsLoading(false);
    }
  }

  // ============================================================
  // 고객 상담 사진 여러 장 불러오기
  // ============================================================

  async function toggleLeadDetail(lead) {
    if (openLeadId === lead.id) {
      setOpenLeadId(null);
      return;
    }

    setOpenLeadId(lead.id);

    const paths = [
      ...new Set(
        (
          Array.isArray(
            lead.customer_photo_paths
          ) &&
          lead.customer_photo_paths.length > 0
            ? lead.customer_photo_paths
            : lead.customer_photo_path
            ? [lead.customer_photo_path]
            : []
        ).filter(Boolean)
      ),
    ];

    if (paths.length === 0) {
      return;
    }

    if (
      Array.isArray(
        leadPhotoUrls[lead.id]
      )
    ) {
      return;
    }

    setLeadPhotoLoadingId(lead.id);

    try {
      const urls = await Promise.all(
        paths.map(async (path) => {
          const {
            data,
            error,
          } = await supabase.storage
            .from("work-photos")
            .createSignedUrl(
              path,
              60 * 30
            );

          if (error) {
            console.error(
              "고객사진 signed URL 오류:",
              path,
              error
            );

            return null;
          }

          return data?.signedUrl || null;
        })
      );

      setLeadPhotoUrls((current) => ({
        ...current,
        [lead.id]:
          urls.filter(Boolean),
      }));
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 고객사진 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setLeadPhotoLoadingId(null);
    }
  }

  // ============================================================
  // 상담 읽음 처리
  // ============================================================

  async function markLeadRead(leadId) {
    try {
      const now =
        new Date().toISOString();

      const { error } = await supabase
        .from("customer_leads")
        .update({
          is_read: true,
          read_at: now,
        })
        .eq("id", leadId);

      if (error) throw error;

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                is_read: true,
                read_at: now,
              }
            : lead
        )
      );

      setUnreadCount((current) =>
        Math.max(0, current - 1)
      );

      document.title =
        "기분좋은공간 관리자";
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 읽음 처리 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  async function markLeadUnread(leadId) {
    try {
      const { error } = await supabase
        .from("customer_leads")
        .update({
          is_read: false,
          read_at: null,
        })
        .eq("id", leadId);

      if (error) throw error;

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                is_read: false,
                read_at: null,
              }
            : lead
        )
      );

      setUnreadCount(
        (current) => current + 1
      );
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 미확인 처리 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  // ============================================================
  // 상담 상태 변경
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
        "✅ 상담 상태가 변경되었습니다."
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
  // 상담 삭제 + 고객사진 여러 장 삭제
  // ============================================================

  async function deleteLead(lead) {
    const ok = window.confirm(
      `${lead.customer_name || "고객"} 상담을 완전히 삭제하시겠습니까?\n연결된 고객사진도 함께 삭제됩니다.`
    );

    if (!ok) return;

    try {
      const photoPaths = [
        ...new Set(
          (
            Array.isArray(
              lead.customer_photo_paths
            ) &&
            lead.customer_photo_paths.length > 0
              ? lead.customer_photo_paths
              : lead.customer_photo_path
              ? [lead.customer_photo_path]
              : []
          ).filter(Boolean)
        ),
      ];

      if (photoPaths.length > 0) {
        const {
          error: storageError,
        } = await supabase.storage
          .from("work-photos")
          .remove(photoPaths);

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

          delete copy[lead.id];

          return copy;
        }
      );

      setLeadsMessage(
        "✅ 상담이 삭제되었습니다."
      );

      if (!lead.is_read) {
        setUnreadCount((current) =>
          Math.max(0, current - 1)
        );
      }

      const remainingOnPage =
        leads.length - 1;

      if (
        remainingOnPage === 0 &&
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
    } catch (error) {
      console.error(error);

      setLeadsMessage(
        `❌ 상담 삭제 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  // ============================================================
  // 이미지 SHA-256
  // ============================================================

  async function getImageHash(file) {
    const buffer =
      await file.arrayBuffer();

    const hashBuffer =
      await crypto.subtle.digest(
        "SHA-256",
        buffer
      );

    const hashArray = Array.from(
      new Uint8Array(hashBuffer)
    );

    return hashArray
      .map((b) =>
        b
          .toString(16)
          .padStart(2, "0")
      )
      .join("");
  }

  async function removeDuplicateImages(
    files
  ) {
    const unique = [];
    const hashes = new Set();

    for (const file of files) {
      const hash =
        await getImageHash(file);

      if (!hashes.has(hash)) {
        hashes.add(hash);
        unique.push(file);
      }
    }

    return unique;
  }

  // ============================================================
  // 이미지 리사이즈
  // ============================================================

  async function resizeImage(
    file,
    maxSize = 1600,
    quality = 0.82
  ) {
    return new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload = () => {
          const img = new Image();

          img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (
              width > maxSize ||
              height > maxSize
            ) {
              const ratio = Math.min(
                maxSize / width,
                maxSize / height
              );

              width =
                Math.round(
                  width * ratio
                );

              height =
                Math.round(
                  height * ratio
                );
            }

            const canvas =
              document.createElement(
                "canvas"
              );

            canvas.width = width;
            canvas.height = height;

            const ctx =
              canvas.getContext("2d");

            ctx.drawImage(
              img,
              0,
              0,
              width,
              height
            );

            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(
                    new Error(
                      "이미지 압축 실패"
                    )
                  );
                  return;
                }

                const resizedFile =
                  new File(
                    [blob],
                    file.name.replace(
                      /\.[^.]+$/,
                      ".jpg"
                    ),
                    {
                      type: "image/jpeg",
                    }
                  );

                resolve(resizedFile);
              },
              "image/jpeg",
              quality
            );
          };

          img.onerror = () =>
            reject(
              new Error(
                "이미지 로드 실패"
              )
            );

          img.src =
            reader.result;
        };

        reader.onerror = () =>
          reject(
            new Error(
              "파일 읽기 실패"
            )
          );

        reader.readAsDataURL(file);
      }
    );
  }

  // ============================================================
  // API JSON 안전 읽기
  // ============================================================

  async function readJsonSafely(
    response
  ) {
    const text =
      await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `서버 응답 형식 오류: ${text.slice(
          0,
          200
        )}`
      );
    }
  }

  // ============================================================
  // AI 이미지 분석
  // ============================================================

  async function analyzeImage(
    file,
    photoType
  ) {
    const formData =
      new FormData();

    formData.append(
      "image",
      file
    );

    formData.append(
      "photoType",
      photoType
    );

    const response = await fetch(
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

    if (!response.ok) {
      throw new Error(
        result?.error ||
          "AI 분석 실패"
      );
    }

    return result;
  }

  // ============================================================
  // 시공 전/후 비교
  // ============================================================

  async function compareMultipleBeforeAfter(
    beforeFiles,
    afterFiles
  ) {
    if (
      beforeFiles.length === 0 ||
      afterFiles.length === 0
    ) {
      return null;
    }

    try {
      const formData =
        new FormData();

      beforeFiles.forEach(
        (file) => {
          formData.append(
            "beforeImages",
            file
          );
        }
      );

      afterFiles.forEach(
        (file) => {
          formData.append(
            "afterImages",
            file
          );
        }
      );

      formData.append(
        "mode",
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

      if (!response.ok) {
        console.error(
          "전후 비교 실패:",
          result
        );

        return null;
      }

      return result;
    } catch (error) {
      console.error(
        "전후 비교 오류:",
        error
      );

      return null;
    }
  }

  // ============================================================
  // 임베딩
  // ============================================================

  async function createEmbedding(
    text
  ) {
    const response = await fetch(
      "/api/embedding",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          text,
        }),
      }
    );

    const result =
      await readJsonSafely(
        response
      );

    if (!response.ok) {
      throw new Error(
        result?.error ||
          "임베딩 생성 실패"
      );
    }

    return result.embedding;
  }
      // ============================================================
  // 시공사진 저장
  // ============================================================

  async function savePhoto({
    file,
    workItemId,
    projectId,
    photoType,
    categoryValue,
    subCategoryValue,
    analysis,
    comparison,
  }) {
    const resized =
      await resizeImage(file);

    const extension = "jpg";

    const safeName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

    const storagePath =
      `history/${projectId}/${workItemId}/${photoType}/${safeName}`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("work-photos")
      .upload(
        storagePath,
        resized,
        {
          contentType: "image/jpeg",
          upsert: false,
        }
      );

    if (uploadError) {
      throw uploadError;
    }

    const {
      data: publicData,
    } = supabase.storage
      .from("work-photos")
      .getPublicUrl(storagePath);

    const photoUrl =
      publicData?.publicUrl || "";

    const description =
      analysis?.description ||
      analysis?.ai_description ||
      "";

    let tags =
      analysis?.tags ||
      analysis?.ai_tags ||
      [];

    if (!Array.isArray(tags)) {
      tags = [];
    }

    if (photoType === "before") {
      tags.push("시공전");
    }

    if (photoType === "after") {
      tags.push("시공후");
    }

    if (comparison) {
      tags.push("전후비교");
    }

    tags = [...new Set(tags)];

    const searchText = [
      `시공 부위: ${categoryValue}`,
      `세부 부위: ${subCategoryValue}`,
      `사진 상태: ${
        photoType === "before"
          ? "시공 전"
          : "시공 후"
      }`,
      `사진 설명: ${description}`,
      `특징: ${tags.join(", ")}`,
      comparison?.description
        ? `전후 비교: ${comparison.description}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const embedding =
      await createEmbedding(
        searchText
      );

    const {
      error: insertError,
    } = await supabase
      .from("work_photos")
      .insert({
        work_item_id: workItemId,
        project_id: projectId,
        photo_type: photoType,
        category: categoryValue,
        sub_category:
          subCategoryValue,
        storage_path:
          storagePath,

        // photo_url 컬럼이 NOT NULL이므로
        // private bucket이어도 값을 채워둔다.
        photo_url: photoUrl,

        ai_description:
          description,
        ai_tags: tags,
        embedding,
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

    return storagePath;
  }

  // ============================================================
  // 과거 시공 등록
  // ============================================================

  async function handleSave() {
    if (
      beforeImages.length === 0 &&
      afterImages.length === 0
    ) {
      setMessage(
        "⚠️ 시공 전 또는 시공 후 사진을 한 장 이상 선택해주세요."
      );
      return;
    }

    if (!category.trim()) {
      setMessage(
        "⚠️ 시공 부위를 입력해주세요."
      );
      return;
    }

    const costNumber = Number(
      String(actualCost)
        .replace(/,/g, "")
    );

    if (
      !Number.isFinite(
        costNumber
      ) ||
      costNumber <= 0
    ) {
      setMessage(
        "⚠️ 실제 시공금액을 정확히 입력해주세요."
      );
      return;
    }

    setLoading(true);
    setMessage(
      "사진 중복 확인 중..."
    );

    let createdWorkItemId =
      null;

    try {
      const uniqueBefore =
        await removeDuplicateImages(
          beforeImages
        );

      const uniqueAfter =
        await removeDuplicateImages(
          afterImages
        );

      if (
        uniqueBefore.length === 0 &&
        uniqueAfter.length === 0
      ) {
        throw new Error(
          "저장할 사진이 없습니다."
        );
      }

      setMessage(
        "시공 데이터를 생성하고 있습니다..."
      );

      // 현재 사용 중인 프로젝트 ID
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      const {
        data: workItem,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert({
          project_id: projectId,
          category:
            category.trim(),
          sub_category:
            category.trim(),
          actual_cost:
            costNumber,
          memo: [
            material.trim()
              ? `자재: ${material.trim()}`
              : "",
            memo.trim(),
          ]
            .filter(Boolean)
            .join("\n") || null,
        })
        .select()
        .single();

      if (workItemError) {
        throw workItemError;
      }

      createdWorkItemId =
        workItem.id;

      setMessage(
        "AI가 시공 전/후 사진을 비교하고 있습니다..."
      );

      const comparison =
        await compareMultipleBeforeAfter(
          uniqueBefore,
          uniqueAfter
        );

      let completed = 0;

      const total =
        uniqueBefore.length +
        uniqueAfter.length;

      for (
        let index = 0;
        index <
        uniqueBefore.length;
        index++
      ) {
        setMessage(
          `시공 전 사진 AI 분석 중... ${
            completed + 1
          }/${total}`
        );

        const file =
          uniqueBefore[index];

        const analysis =
          await analyzeImage(
            file,
            "before"
          );

        await savePhoto({
          file,
          workItemId:
            workItem.id,
          projectId,
          photoType:
            "before",
          categoryValue:
            category.trim(),
          subCategoryValue:
            category.trim(),
          analysis,
          comparison,
        });

        completed++;
      }

      for (
        let index = 0;
        index <
        uniqueAfter.length;
        index++
      ) {
        setMessage(
          `시공 후 사진 AI 분석 중... ${
            completed + 1
          }/${total}`
        );

        const file =
          uniqueAfter[index];

        const analysis =
          await analyzeImage(
            file,
            "after"
          );

        await savePhoto({
          file,
          workItemId:
            workItem.id,
          projectId,
          photoType:
            "after",
          categoryValue:
            category.trim(),
          subCategoryValue:
            category.trim(),
          analysis,
          comparison,
        });

        completed++;
      }

      setBeforeImages([]);
      setAfterImages([]);
      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");

      const beforeInput =
        document.getElementById(
          "before-images"
        );

      const afterInput =
        document.getElementById(
          "after-images"
        );

      if (beforeInput) {
        beforeInput.value = "";
      }

      if (afterInput) {
        afterInput.value = "";
      }

      setMessage(
        `✅ 저장 완료! 총 ${total}장의 사진이 AI 분석과 함께 저장되었습니다.`
      );

      await loadJobs(
        1,
        jobSearchApplied
      );
    } catch (error) {
      console.error(error);

      // 시공건만 생성되고
      // 사진 저장 중 오류가 발생한 경우
      // 생성된 데이터를 정리한다.
      if (createdWorkItemId) {
        try {
          const {
            data: savedPhotos,
          } = await supabase
            .from("work_photos")
            .select(
              "storage_path"
            )
            .eq(
              "work_item_id",
              createdWorkItemId
            );

          const paths =
            (
              savedPhotos || []
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
            .from("work_photos")
            .delete()
            .eq(
              "work_item_id",
              createdWorkItemId
            );

          await supabase
            .from("work_items")
            .delete()
            .eq(
              "id",
              createdWorkItemId
            );
        } catch (
          cleanupError
        ) {
          console.error(
            "저장 실패 후 정리 오류:",
            cleanupError
          );
        }
      }

      setMessage(
        `❌ 오류: ${
          error?.message ||
          "저장 실패"
        }`
      );
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

    return (
      <div
        style={{
          border:
            "1px solid #e5e7eb",
          borderRadius: "14px",
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        {photo.signedUrl ? (
          <img
            src={
              photo.signedUrl
            }
            alt={
              photo.ai_description ||
              "시공 사진"
            }
            onClick={() =>
              setPreviewPhoto(
                photo
              )
            }
            style={{
              display: "block",
              width: "100%",
              height: "180px",
              objectFit: "cover",
              background:
                "#f3f4f6",
              cursor: "pointer",
            }}
          />
        ) : (
          <div
            style={{
              height: "180px",
              display: "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              background:
                "#f3f4f6",
              color: "#6b7280",
            }}
          >
            사진 없음
          </div>
        )}

        <div
          style={{
            padding: "12px",
          }}
        >
          {!isEditing ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  gap: "8px",
                  marginBottom:
                    "8px",
                }}
              >
                <strong>
                  {photo.photo_type ===
                  "before"
                    ? "시공 전"
                    : photo.photo_type ===
                      "after"
                    ? "시공 후"
                    : photo.photo_type ||
                      "사진"}
                </strong>

                <span
                  style={{
                    fontSize:
                      "12px",
                    padding:
                      "4px 8px",
                    borderRadius:
                      "999px",
                    background:
                      photo.photo_type ===
                      "after"
                        ? "#dcfce7"
                        : "#f3f4f6",
                    color:
                      "#374151",
                  }}
                >
                  {photo.category ||
                    "-"}
                </span>
              </div>

              {photo.ai_description && (
                <div
                  style={{
                    fontSize:
                      "13px",
                    lineHeight: 1.5,
                    color:
                      "#4b5563",
                    marginBottom:
                      "8px",
                  }}
                >
                  {
                    photo.ai_description
                  }
                </div>
              )}

              {Array.isArray(
                photo.ai_tags
              ) &&
                photo.ai_tags
                  .length >
                  0 && (
                  <div
                    style={{
                      display:
                        "flex",
                      flexWrap:
                        "wrap",
                      gap: "5px",
                      marginBottom:
                        "10px",
                    }}
                  >
                    {photo.ai_tags.map(
                      (
                        tag,
                        index
                      ) => (
                        <span
                          key={`${tag}-${index}`}
                          style={{
                            padding:
                              "3px 7px",
                            fontSize:
                              "11px",
                            borderRadius:
                              "999px",
                            background:
                              "#eff6ff",
                            color:
                              "#1d4ed8",
                          }}
                        >
                          {tag}
                        </span>
                      )
                    )}
                  </div>
                )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: "7px",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    startPhotoEdit(
                      photo
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    padding:
                      "9px",
                  }}
                >
                  수정
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
                    padding:
                      "9px",
                    borderColor:
                      "#fecaca",
                    color:
                      "#b91c1c",
                  }}
                >
                  삭제
                </button>
              </div>
            </>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "8px",
              }}
            >
              <select
                value={
                  editPhotoType
                }
                onChange={(e) =>
                  setEditPhotoType(
                    e.target.value
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
              </select>

              <input
                value={
                  editPhotoCategory
                }
                onChange={(e) =>
                  setEditPhotoCategory(
                    e.target.value
                  )
                }
                placeholder="시공 부위"
                style={
                  inputStyle
                }
              />

              <input
                value={
                  editPhotoSubCategory
                }
                onChange={(e) =>
                  setEditPhotoSubCategory(
                    e.target.value
                  )
                }
                placeholder="세부 부위"
                style={
                  inputStyle
                }
              />

              <textarea
                value={
                  editPhotoDescription
                }
                onChange={(e) =>
                  setEditPhotoDescription(
                    e.target.value
                  )
                }
                rows={4}
                placeholder="AI 설명"
                style={{
                  ...inputStyle,
                  resize:
                    "vertical",
                }}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: "7px",
                }}
              >
                <button
                  type="button"
                  disabled={
                    photoEditLoading
                  }
                  onClick={() =>
                    savePhotoEdit(
                      photo
                    )
                  }
                  style={{
                    ...primaryButtonStyle,
                    padding:
                      "10px",
                  }}
                >
                  {photoEditLoading
                    ? "저장 중..."
                    : "저장"}
                </button>

                <button
                  type="button"
                  onClick={
                    cancelPhotoEdit
                  }
                  style={{
                    ...secondaryButtonStyle,
                    padding:
                      "10px",
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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
          "18px 14px 80px",
        fontFamily:
          "Arial, sans-serif",
        color: "#111827",
        background:
          "#f9fafb",
        minHeight: "100vh",
      }}
    >
      {/* 신규 상담 실시간 알림 */}

      {newLeadAlert && (
        <div
          style={{
            position: "sticky",
            top: "8px",
            zIndex: 50,
            padding: "14px",
            marginBottom:
              "14px",
            borderRadius:
              "14px",
            background:
              "#fef2f2",
            border:
              "2px solid #ef4444",
            boxShadow:
              "0 8px 25px rgba(0,0,0,0.12)",
          }}
        >
          <div
            style={{
              fontWeight:
                "bold",
              fontSize: "17px",
              marginBottom:
                "5px",
              color:
                "#991b1b",
            }}
          >
            🔔 신규 상담이
            들어왔습니다.
          </div>

          <div
            style={{
              fontSize: "14px",
              color:
                "#7f1d1d",
            }}
          >
            {newLeadAlert.customer_name ||
              "고객"}{" "}
            ·{" "}
            {newLeadAlert.phone ||
              ""}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: "8px",
              marginTop:
                "10px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                changeTab(
                  "leads"
                );

                setLeadFilter(
                  "unread"
                );

                loadLeads(
                  1,
                  "unread"
                );

                setNewLeadAlert(
                  null
                );
              }}
              style={{
                ...primaryButtonStyle,
                padding:
                  "10px",
                background:
                  "#dc2626",
              }}
            >
              상담 확인
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
                padding:
                  "10px",
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          display:
            "inline-block",
          padding: "6px 10px",
          borderRadius:
            "999px",
          background:
            "#e0f2fe",
          color: "#0369a1",
          fontWeight: "bold",
          fontSize: "13px",
          marginBottom:
            "8px",
        }}
      >
        관리자
      </div>

      <h1
        style={{
          margin:
            "0 0 18px",
          fontSize: "25px",
        }}
      >
        기분좋은공간 AI
        견적앱
      </h1>

      {/* 탭 */}

      <div
        style={{
          position: "sticky",
          top: "0",
          zIndex: 30,
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: "8px",
          padding:
            "8px 0 12px",
          background:
            "#f9fafb",
          marginBottom:
            "12px",
        }}
      >
        <button
          type="button"
          onClick={() =>
            changeTab(
              "jobs"
            )
          }
          style={{
            padding: "13px",
            borderRadius:
              "11px",
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
          }}
        >
          🛠 시공 DB
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
            padding: "13px",
            borderRadius:
              "11px",
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
          }}
        >
          📞 고객 상담
          {unreadCount >
            0 && (
            <span
              style={{
                position:
                  "absolute",
                top: "-8px",
                right: "-5px",
                minWidth:
                  "22px",
                height:
                  "22px",
                padding:
                  "0 5px",
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                borderRadius:
                  "999px",
                background:
                  "#dc2626",
                color:
                  "#ffffff",
                fontSize:
                  "12px",
                border:
                  "2px solid #ffffff",
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* ======================================================
          시공 DB
          ====================================================== */}

      {activeTab ===
        "jobs" && (
        <>
          {/* AI 유사도 */}

          <section
            style={
              sectionStyle
            }
          >
            <h2
              style={{
                margin:
                  "0 0 8px",
                fontSize:
                  "18px",
              }}
            >
              🤖 AI 유사도
              기준
            </h2>

            <div
              style={{
                fontSize:
                  "13px",
                lineHeight:
                  1.5,
                color:
                  "#6b7280",
                marginBottom:
                  "12px",
              }}
            >
              고객사진과 과거
              시공 데이터를
              비교할 때 사용할
              최소 유사도입니다.
            </div>

            <select
              value={
                similarityThreshold
              }
              onChange={(e) =>
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
              disabled={
                settingLoading
              }
              onClick={
                saveSimilaritySetting
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
                  fontSize:
                    "14px",
                  lineHeight:
                    1.5,
                }}
              >
                {settingMessage}
              </div>
            )}
          </section>

          {/* 과거 시공 등록 */}

          <section
            style={
              sectionStyle
            }
          >
            <h2
              style={{
                margin:
                  "0 0 6px",
                fontSize:
                  "19px",
              }}
            >
              📷 과거 시공
              등록
            </h2>

            <div
              style={{
                color:
                  "#6b7280",
                fontSize:
                  "13px",
                lineHeight:
                  1.5,
                marginBottom:
                  "15px",
              }}
            >
              기존 시공사진과
              실제 시공금액을
              등록하면 AI 견적
              데이터로 활용됩니다.
            </div>

            <label
              style={{
                display:
                  "block",
                fontWeight:
                  "bold",
                marginBottom:
                  "6px",
              }}
            >
              시공 전 사진
            </label>

            <input
              id="before-images"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) =>
                setBeforeImages(
                  Array.from(
                    e.target
                      .files || []
                  )
                )
              }
              style={{
                ...inputStyle,
                marginBottom:
                  "6px",
              }}
            />

            <div
              style={{
                fontSize:
                  "12px",
                color:
                  "#6b7280",
                marginBottom:
                  "15px",
              }}
            >
              선택된 사진:{" "}
              {
                beforeImages.length
              }
              장
            </div>

            <label
              style={{
                display:
                  "block",
                fontWeight:
                  "bold",
                marginBottom:
                  "6px",
              }}
            >
              시공 후 사진
            </label>

            <input
              id="after-images"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) =>
                setAfterImages(
                  Array.from(
                    e.target
                      .files || []
                  )
                )
              }
              style={{
                ...inputStyle,
                marginBottom:
                  "6px",
              }}
            />

            <div
              style={{
                fontSize:
                  "12px",
                color:
                  "#6b7280",
                marginBottom:
                  "15px",
              }}
            >
              선택된 사진:{" "}
              {
                afterImages.length
              }
              장
            </div>

            <input
              value={category}
              onChange={(e) =>
                setCategory(
                  e.target.value
                )
              }
              placeholder="시공 부위 예: 방문, 싱크대, 붙박이장"
              style={{
                ...inputStyle,
                marginBottom:
                  "10px",
              }}
            />

            <input
              value={actualCost}
              inputMode="numeric"
              onChange={(e) =>
                setActualCost(
                  e.target.value
                )
              }
              placeholder="실제 시공금액 예: 450000"
              style={{
                ...inputStyle,
                marginBottom:
                  "10px",
              }}
            />

            <input
              value={material}
              onChange={(e) =>
                setMaterial(
                  e.target.value
                )
              }
              placeholder="사용 자재 예: 현대 L&C GS115"
              style={{
                ...inputStyle,
                marginBottom:
                  "10px",
              }}
            />

            <textarea
              value={memo}
              onChange={(e) =>
                setMemo(
                  e.target.value
                )
              }
              placeholder="메모"
              rows={4}
              style={{
                ...inputStyle,
                resize:
                  "vertical",
                marginBottom:
                  "10px",
              }}
            />

            <button
              type="button"
              disabled={loading}
              onClick={
                handleSave
              }
              style={
                primaryButtonStyle
              }
            >
              {loading
                ? "AI 분석 및 저장 중..."
                : "과거 시공 저장"}
            </button>

            {message && (
              <div
                style={{
                  marginTop:
                    "12px",
                  padding:
                    "11px",
                  borderRadius:
                    "9px",
                  background:
                    "#f3f4f6",
                  fontSize:
                    "14px",
                  lineHeight:
                    1.5,
                  whiteSpace:
                    "pre-wrap",
                }}
              >
                {message}
              </div>
            )}
          </section>

          {/* 시공 DB 관리 */}

          <section
            style={
              sectionStyle
            }
          >
            <h2
              style={{
                margin:
                  "0 0 12px",
                fontSize:
                  "19px",
              }}
            >
              🗂 시공 DB 관리
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr auto",
                gap: "7px",
              }}
            >
              <input
                value={
                  jobSearch
                }
                onChange={(e) =>
                  setJobSearch(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (
                    e.key ===
                    "Enter"
                  ) {
                    searchJobs();
                  }
                }}
                placeholder="부위 또는 메모 검색"
                style={
                  inputStyle
                }
              />

              <button
                type="button"
                onClick={
                  searchJobs
                }
                style={{
                  padding:
                    "0 16px",
                  border:
                    "none",
                  borderRadius:
                    "10px",
                  background:
                    "#111827",
                  color:
                    "#ffffff",
                  fontWeight:
                    "bold",
                }}
              >
                검색
              </button>
            </div>

            {jobSearchApplied && (
              <button
                type="button"
                onClick={
                  clearJobSearch
                }
                style={{
                  marginTop:
                    "7px",
                  border:
                    "none",
                  background:
                    "transparent",
                  color:
                    "#2563eb",
                  cursor:
                    "pointer",
                }}
              >
                검색 초기화
              </button>
            )}

            <div
              style={{
                margin:
                  "14px 0 8px",
                color:
                  "#6b7280",
                fontSize:
                  "13px",
              }}
            >
              총{" "}
              {jobTotal.toLocaleString(
                "ko-KR"
              )}
              건
            </div>

            {jobsMessage && (
              <div
                style={{
                  padding:
                    "10px",
                  marginBottom:
                    "10px",
                  borderRadius:
                    "9px",
                  background:
                    "#f3f4f6",
                  fontSize:
                    "14px",
                }}
              >
                {jobsMessage}
              </div>
            )}

            {jobsLoading ? (
              <div
                style={{
                  padding:
                    "25px",
                  textAlign:
                    "center",
                }}
              >
                불러오는 중...
              </div>
            ) : jobs.length ===
              0 ? (
              <div
                style={{
                  padding:
                    "25px",
                  textAlign:
                    "center",
                  color:
                    "#6b7280",
                }}
              >
                등록된 시공
                데이터가 없습니다.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                }}
              >
                {jobs.map(
                  (job) => {
                    const isOpen =
                      openJobId ===
                      job.id;

                    const isEditing =
                      editingId ===
                      job.id;

                    const photos =
                      jobPhotos[
                        job.id
                      ] || [];

                    return (
                      <div
                        key={
                          job.id
                        }
                        style={{
                          border:
                            "1px solid #e5e7eb",
                          borderRadius:
                            "13px",
                          background:
                            "#ffffff",
                          overflow:
                            "hidden",
                        }}
                      >
                        <div
                          style={{
                            padding:
                              "14px",
                          }}
                        >
                          {!isEditing ? (
                            <>
                              <div
                                style={{
                                  display:
                                    "flex",
                                  justifyContent:
                                    "space-between",
                                  alignItems:
                                    "flex-start",
                                  gap:
                                    "10px",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontWeight:
                                        "bold",
                                      fontSize:
                                        "17px",
                                    }}
                                  >
                                    {job.category ||
                                      "미분류"}
                                  </div>

                                  <div
                                    style={{
                                      color:
                                        "#6b7280",
                                      fontSize:
                                        "12px",
                                      marginTop:
                                        "3px",
                                    }}
                                  >
                                    {formatDate(
                                      job.created_at
                                    )}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    fontWeight:
                                      "bold",
                                    color:
                                      "#1d4ed8",
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  {formatWon(
                                    job.actual_cost
                                  )}
                                </div>
                              </div>

                              {job.memo && (
                                <div
                                  style={{
                                    marginTop:
                                      "8px",
                                    fontSize:
                                      "13px",
                                    color:
                                      "#4b5563",
                                    whiteSpace:
                                      "pre-wrap",
                                  }}
                                >
                                  {job.memo}
                                </div>
                              )}

                              <div
                                style={{
                                  display:
                                    "grid",
                                  gridTemplateColumns:
                                    "1fr 1fr 1fr",
                                  gap:
                                    "6px",
                                  marginTop:
                                    "12px",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleJobDetail(
                                      job.id
                                    )
                                  }
                                  style={{
                                    ...secondaryButtonStyle,
                                    padding:
                                      "9px 5px",
                                  }}
                                >
                                  {isOpen
                                    ? "사진 닫기"
                                    : "사진 보기"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    startEdit(
                                      job
                                    )
                                  }
                                  style={{
                                    ...secondaryButtonStyle,
                                    padding:
                                      "9px 5px",
                                  }}
                                >
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
                                    padding:
                                      "9px 5px",
                                    color:
                                      "#b91c1c",
                                    borderColor:
                                      "#fecaca",
                                  }}
                                >
                                  삭제
                                </button>
                              </div>
                            </>
                          ) : (
                            <div
                              style={{
                                display:
                                  "grid",
                                gap:
                                  "8px",
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
                                style={
                                  inputStyle
                                }
                              />

                              <input
                                value={
                                  editCost
                                }
                                inputMode="numeric"
                                onChange={(
                                  e
                                ) =>
                                  setEditCost(
                                    e
                                      .target
                                      .value
                                  )
                                }
                                placeholder="시공금액"
                                style={
                                  inputStyle
                                }
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
                                rows={
                                  4
                                }
                                placeholder="메모"
                                style={{
                                  ...inputStyle,
                                  resize:
                                    "vertical",
                                }}
                              />

                              <div
                                style={{
                                  display:
                                    "grid",
                                  gridTemplateColumns:
                                    "1fr 1fr",
                                  gap:
                                    "7px",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    saveJobEdit(
                                      job.id
                                    )
                                  }
                                  style={{
                                    ...primaryButtonStyle,
                                    padding:
                                      "10px",
                                  }}
                                >
                                  저장
                                </button>

                                <button
                                  type="button"
                                  onClick={
                                    cancelEdit
                                  }
                                  style={{
                                    ...secondaryButtonStyle,
                                    padding:
                                      "10px",
                                  }}
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {isOpen && (
                          <div
                            style={{
                              borderTop:
                                "1px solid #e5e7eb",
                              padding:
                                "12px",
                              background:
                                "#f9fafb",
                            }}
                          >
                            {jobPhotoLoadingId ===
                            job.id ? (
                              <div
                                style={{
                                  padding:
                                    "20px",
                                  textAlign:
                                    "center",
                                }}
                              >
                                사진 불러오는
                                중...
                              </div>
                            ) : photos.length ===
                              0 ? (
                              <div
                                style={{
                                  padding:
                                    "20px",
                                  textAlign:
                                    "center",
                                  color:
                                    "#6b7280",
                                }}
                              >
                                저장된 사진이
                                없습니다.
                              </div>
                            ) : (
                              <div
                                style={{
                                  display:
                                    "grid",
                                  gridTemplateColumns:
                                    "repeat(2, minmax(0, 1fr))",
                                  gap:
                                    "9px",
                                }}
                              >
                                {photos.map(
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
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            )}

            {jobTotalPages >
              1 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr auto 1fr",
                  alignItems:
                    "center",
                  gap: "8px",
                  marginTop:
                    "14px",
                }}
              >
                <button
                  type="button"
                  disabled={
                    jobPage <= 1
                  }
                  onClick={() =>
                    loadJobs(
                      jobPage - 1,
                      jobSearchApplied
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    opacity:
                      jobPage <=
                      1
                        ? 0.5
                        : 1,
                  }}
                >
                  이전
                </button>

                <div
                  style={{
                    fontSize:
                      "13px",
                    color:
                      "#4b5563",
                  }}
                >
                  {jobPage} /{" "}
                  {jobTotalPages}
                </div>

                <button
                  type="button"
                  disabled={
                    jobPage >=
                    jobTotalPages
                  }
                  onClick={() =>
                    loadJobs(
                      jobPage + 1,
                      jobSearchApplied
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    opacity:
                      jobPage >=
                      jobTotalPages
                        ? 0.5
                        : 1,
                  }}
                >
                  다음
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* ======================================================
          고객 상담
          ====================================================== */}

      {activeTab ===
        "leads" && (
        <>
          <section
            style={
              sectionStyle
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                gap: "10px",
              }}
            >
              <div>
                <h2
                  style={{
                    margin:
                      "0 0 4px",
                    fontSize:
                      "19px",
                  }}
                >
                  📞 고객 상담
                </h2>

                <div
                  style={{
                    color:
                      "#6b7280",
                    fontSize:
                      "13px",
                  }}
                >
                  미확인 상담{" "}
                  <strong
                    style={{
                      color:
                        unreadCount >
                        0
                          ? "#dc2626"
                          : "#111827",
                    }}
                  >
                    {unreadCount}
                    건
                  </strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  loadLeads(
                    leadPage,
                    leadFilter
                  )
                }
                style={{
                  width: "auto",
                  padding:
                    "9px 12px",
                  border:
                    "1px solid #d1d5db",
                  borderRadius:
                    "9px",
                  background:
                    "#ffffff",
                  fontWeight:
                    "bold",
                }}
              >
                새로고침
              </button>
            </div>

            <div
              style={{
                marginTop:
                  "12px",
                padding:
                  "11px",
                background:
                  "#eff6ff",
                borderRadius:
                  "10px",
                color:
                  "#1e3a8a",
                fontSize:
                  "13px",
                lineHeight:
                  1.5,
              }}
            >
              고객이 정확한
              상담을 요청하면 이
              목록에 저장됩니다.
              상담 상세에서 고객이
              올린 사진 전체를
              확인할 수 있습니다.
            </div>

            <button
              type="button"
              onClick={
                enableNotifications
              }
              style={{
                ...secondaryButtonStyle,
                marginTop:
                  "10px",
                borderColor:
                  notificationEnabled
                    ? "#86efac"
                    : "#d1d5db",
                background:
                  notificationEnabled
                    ? "#f0fdf4"
                    : "#ffffff",
                color:
                  notificationEnabled
                    ? "#166534"
                    : "#111827",
              }}
            >
              {notificationEnabled
                ? "🔔 이 휴대폰 푸시 알림 등록됨"
                : "🔔 이 휴대폰에 신규상담 알림 등록"}
            </button>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(3, 1fr)",
                gap: "6px",
                marginTop:
                  "12px",
              }}
            >
              {[
                [
                  "all",
                  "전체",
                ],
                [
                  "unread",
                  "미확인",
                ],
                [
                  "read",
                  "확인",
                ],
              ].map(
                ([
                  value,
                  label,
                ]) => (
                  <button
                    key={
                      value
                    }
                    type="button"
                    onClick={() => {
                      setLeadFilter(
                        value
                      );

                      loadLeads(
                        1,
                        value
                      );
                    }}
                    style={{
                      padding:
                        "10px 5px",
                      borderRadius:
                        "9px",
                      border:
                        leadFilter ===
                        value
                          ? "2px solid #111827"
                          : "1px solid #d1d5db",
                      background:
                        leadFilter ===
                        value
                          ? "#111827"
                          : "#ffffff",
                      color:
                        leadFilter ===
                        value
                          ? "#ffffff"
                          : "#111827",
                      fontWeight:
                        "bold",
                    }}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </section>

          <section
            style={
              sectionStyle
            }
          >
            <div
              style={{
                marginBottom:
                  "10px",
                color:
                  "#6b7280",
                fontSize:
                  "13px",
              }}
            >
              총{" "}
              {leadTotal.toLocaleString(
                "ko-KR"
              )}
              건
            </div>

            {leadsMessage && (
              <div
                style={{
                  padding:
                    "10px",
                  marginBottom:
                    "10px",
                  borderRadius:
                    "9px",
                  background:
                    "#f3f4f6",
                  fontSize:
                    "14px",
                }}
              >
                {leadsMessage}
              </div>
            )}

            {leadsLoading ? (
              <div
                style={{
                  padding:
                    "30px",
                  textAlign:
                    "center",
                }}
              >
                상담목록 불러오는
                중...
              </div>
            ) : leads.length ===
              0 ? (
              <div
                style={{
                  padding:
                    "30px",
                  textAlign:
                    "center",
                  color:
                    "#6b7280",
                }}
              >
                해당 상담이
                없습니다.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                }}
              >
                {leads.map(
                  (lead) => {
                    const isOpen =
                      openLeadId ===
                      lead.id;

                    const customerPhotoUrls =
                      Array.isArray(
                        leadPhotoUrls[
                          lead.id
                        ]
                      )
                        ? leadPhotoUrls[
                            lead.id
                          ]
                        : [];

                    const customerPhotoPaths =
                      [
                        ...new Set(
                          (
                            Array.isArray(
                              lead.customer_photo_paths
                            ) &&
                            lead
                              .customer_photo_paths
                              .length >
                              0
                              ? lead.customer_photo_paths
                              : lead.customer_photo_path
                              ? [
                                  lead.customer_photo_path,
                                ]
                              : []
                          ).filter(
                            Boolean
                          )
                        ),
                      ];

                    const hasCustomerPhotos =
                      customerPhotoPaths.length >
                      0;

                    const photoLoading =
                      leadPhotoLoadingId ===
                      lead.id;

                    return (
                      <div
                        key={
                          lead.id
                        }
                        style={{
                          border:
                            lead.is_read
                              ? "1px solid #e5e7eb"
                              : "2px solid #ef4444",
                          borderRadius:
                            "14px",
                          background:
                            lead.is_read
                              ? "#ffffff"
                              : "#fff7f7",
                          overflow:
                            "hidden",
                        }}
                      >
                        <div
                          style={{
                            padding:
                              "14px",
                          }}
                        >
                          <div
                            style={{
                              display:
                                "flex",
                              justifyContent:
                                "space-between",
                              alignItems:
                                "flex-start",
                              gap:
                                "10px",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  display:
                                    "flex",
                                  alignItems:
                                    "center",
                                  gap:
                                    "6px",
                                  flexWrap:
                                    "wrap",
                                }}
                              >
                                <strong
                                  style={{
                                    fontSize:
                                      "17px",
                                  }}
                                >
                                  {lead.customer_name ||
                                    "이름 없음"}
                                </strong>

                                {!lead.is_read && (
                                  <span
                                    style={{
                                      padding:
                                        "3px 7px",
                                      borderRadius:
                                        "999px",
                                      background:
                                        "#dc2626",
                                      color:
                                        "#ffffff",
                                      fontSize:
                                        "11px",
                                      fontWeight:
                                        "bold",
                                    }}
                                  >
                                    NEW
                                  </span>
                                )}

                                <span
                                  style={{
                                    padding:
                                      "3px 7px",
                                    borderRadius:
                                      "999px",
                                    background:
                                      "#f3f4f6",
                                    fontSize:
                                      "11px",
                                  }}
                                >
                                  {lead.status ||
                                    "신규문의"}
                                </span>
                              </div>

                              <a
                                href={`tel:${lead.phone}`}
                                style={{
                                  display:
                                    "inline-block",
                                  marginTop:
                                    "6px",
                                  color:
                                    "#2563eb",
                                  fontWeight:
                                    "bold",
                                  textDecoration:
                                    "none",
                                }}
                              >
                                📞{" "}
                                {lead.phone ||
                                  "-"}
                              </a>
                            </div>

                            <div
                              style={{
                                textAlign:
                                  "right",
                                fontSize:
                                  "12px",
                                color:
                                  "#6b7280",
                              }}
                            >
                              {formatDate(
                                lead.created_at
                              )}
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop:
                                "10px",
                              display:
                                "grid",
                              gap:
                                "4px",
                              fontSize:
                                "13px",
                              color:
                                "#4b5563",
                            }}
                          >
                            <div>
                              📍 지역:{" "}
                              {lead.region ||
                                "-"}
                            </div>

                            <div>
                              🛠 부위:{" "}
                              {lead.category ||
                                "-"}
                              {lead.sub_category
                                ? ` / ${lead.sub_category}`
                                : ""}
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop:
                                "10px",
                              padding:
                                "11px",
                              borderRadius:
                                "10px",
                              background:
                                "#eff6ff",
                            }}
                          >
                            <div
                              style={{
                                fontSize:
                                  "12px",
                                color:
                                  "#1e40af",
                                marginBottom:
                                  "3px",
                              }}
                            >
                              AI 예상견적
                            </div>

                            <div
                              style={{
                                fontWeight:
                                  "bold",
                                color:
                                  "#1d4ed8",
                                fontSize:
                                  "18px",
                              }}
                            >
                              {formatWon(
                                lead.estimate_average
                              )}
                            </div>

                            <div
                              style={{
                                marginTop:
                                  "3px",
                                fontSize:
                                  "12px",
                                color:
                                  "#4b5563",
                              }}
                            >
                              {formatWon(
                                lead.estimate_min
                              )}{" "}
                              ~{" "}
                              {formatWon(
                                lead.estimate_max
                              )}
                            </div>
                          </div>

                          <div
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                lead.is_read
                                  ? "1fr"
                                  : "1fr 1fr",
                              gap:
                                "7px",
                              marginTop:
                                "10px",
                            }}
                          >
                            {!lead.is_read && (
                              <button
                                type="button"
                                onClick={() =>
                                  markLeadRead(
                                    lead.id
                                  )
                                }
                                style={{
                                  ...secondaryButtonStyle,
                                  padding:
                                    "9px",
                                  borderColor:
                                    "#86efac",
                                  color:
                                    "#166534",
                                  background:
                                    "#f0fdf4",
                                }}
                              >
                                ✓ 확인 처리
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
                                padding:
                                  "9px",
                              }}
                            >
                              {isOpen
                                ? "상세 닫기"
                                : `상세 보기${
                                    hasCustomerPhotos
                                      ? ` · 사진 ${customerPhotoPaths.length}장`
                                      : ""
                                  }`}
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div
                            style={{
                              borderTop:
                                "1px solid #e5e7eb",
                              padding:
                                "14px",
                              background:
                                "#f9fafb",
                            }}
                          >
                            {/* 고객사진 */}

                            <div
                              style={{
                                marginBottom:
                                  "16px",
                              }}
                            >
                              {photoLoading && (
                                <div
                                  style={{
                                    padding:
                                      "20px",
                                    textAlign:
                                      "center",
                                    color:
                                      "#6b7280",
                                  }}
                                >
                                  고객사진 불러오는
                                  중...
                                </div>
                              )}

                              {!photoLoading &&
                                customerPhotoUrls.length >
                                  0 && (
                                  <>
                                    <div
                                      style={{
                                        marginBottom:
                                          "8px",
                                        fontWeight:
                                          "bold",
                                      }}
                                    >
                                      📷 고객사진{" "}
                                      {
                                        customerPhotoUrls.length
                                      }
                                      장
                                    </div>

                                    <div
                                      style={{
                                        display:
                                          "grid",
                                        gridTemplateColumns:
                                          "repeat(2, minmax(0, 1fr))",
                                        gap:
                                          "8px",
                                      }}
                                    >
                                      {customerPhotoUrls.map(
                                        (
                                          url,
                                          index
                                        ) => (
                                          <img
                                            key={`${lead.id}-${index}`}
                                            src={
                                              url
                                            }
                                            alt={`고객 상담 사진 ${
                                              index +
                                              1
                                            }`}
                                            onClick={() =>
                                              setPreviewPhoto(
                                                {
                                                  signedUrl:
                                                    url,
                                                }
                                              )
                                            }
                                            style={{
                                              width:
                                                "100%",
                                              aspectRatio:
                                                "1 / 1",
                                              objectFit:
                                                "cover",
                                              background:
                                                "#f3f4f6",
                                              borderRadius:
                                                "12px",
                                              cursor:
                                                "pointer",
                                            }}
                                          />
                                        )
                                      )}
                                    </div>
                                  </>
                                )}

                              {!photoLoading &&
                                hasCustomerPhotos &&
                                customerPhotoUrls.length ===
                                  0 && (
                                  <div
                                    style={{
                                      padding:
                                        "15px",
                                      textAlign:
                                        "center",
                                      color:
                                        "#b91c1c",
                                      background:
                                        "#fef2f2",
                                      borderRadius:
                                        "9px",
                                    }}
                                  >
                                    고객사진을
                                    불러오지
                                    못했습니다.
                                  </div>
                                )}

                              {!hasCustomerPhotos && (
                                <div
                                  style={{
                                    padding:
                                      "15px",
                                    textAlign:
                                      "center",
                                    color:
                                      "#6b7280",
                                    background:
                                      "#f3f4f6",
                                    borderRadius:
                                      "9px",
                                  }}
                                >
                                  저장된 고객사진이
                                  없습니다.
                                </div>
                              )}
                            </div>

                            {/* AI 설명 */}

                            <div
                              style={{
                                marginBottom:
                                  "14px",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight:
                                    "bold",
                                  marginBottom:
                                    "5px",
                                }}
                              >
                                🤖 AI 분석
                              </div>

                              <div
                                style={{
                                  padding:
                                    "11px",
                                  borderRadius:
                                    "9px",
                                  background:
                                    "#ffffff",
                                  border:
                                    "1px solid #e5e7eb",
                                  fontSize:
                                    "13px",
                                  lineHeight:
                                    1.6,
                                  whiteSpace:
                                    "pre-wrap",
                                }}
                              >
                                {lead.ai_description ||
                                  "AI 분석 내용이 없습니다."}
                              </div>
                            </div>

                            {/* 상담 상태 */}

                            <div
                              style={{
                                marginBottom:
                                  "14px",
                              }}
                            >
                              <label
                                style={{
                                  display:
                                    "block",
                                  fontWeight:
                                    "bold",
                                  marginBottom:
                                    "5px",
                                }}
                              >
                                상담 상태
                              </label>

                              <select
                                value={
                                  lead.status ||
                                  "신규문의"
                                }
                                onChange={(e) =>
                                  updateLeadStatus(
                                    lead.id,
                                    e
                                      .target
                                      .value
                                  )
                                }
                                style={
                                  inputStyle
                                }
                              >
                                {STATUS_OPTIONS.map(
                                  (
                                    option
                                  ) => (
                                    <option
                                      key={
                                        option
                                      }
                                      value={
                                        option
                                      }
                                    >
                                      {
                                        option
                                      }
                                    </option>
                                  )
                                )}
                              </select>
                            </div>

                            {/* 메모 */}

                            <div
                              style={{
                                marginBottom:
                                  "14px",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight:
                                    "bold",
                                  marginBottom:
                                    "5px",
                                }}
                              >
                                📝 고객 요청 /
                                메모
                              </div>

                              <div
                                style={{
                                  padding:
                                    "11px",
                                  borderRadius:
                                    "9px",
                                  background:
                                    "#ffffff",
                                  border:
                                    "1px solid #e5e7eb",
                                  fontSize:
                                    "13px",
                                  lineHeight:
                                    1.6,
                                  whiteSpace:
                                    "pre-wrap",
                                }}
                              >
                                {lead.memo ||
                                  "메모가 없습니다."}
                              </div>
                            </div>

                            {/* 읽음 */}

                            <div
                              style={{
                                padding:
                                  "10px",
                                borderRadius:
                                  "9px",
                                background:
                                  "#ffffff",
                                border:
                                  "1px solid #e5e7eb",
                                fontSize:
                                  "12px",
                                color:
                                  "#6b7280",
                                marginBottom:
                                  "10px",
                              }}
                            >
                              {lead.is_read
                                ? `확인함${
                                    lead.read_at
                                      ? ` · ${formatDate(
                                          lead.read_at
                                        )}`
                                      : ""
                                  }`
                                : "아직 확인하지 않은 상담입니다."}
                            </div>

                            <div
                              style={{
                                display:
                                  "grid",
                                gridTemplateColumns:
                                  lead.is_read
                                    ? "1fr 1fr"
                                    : "1fr",
                                gap:
                                  "7px",
                              }}
                            >
                              {lead.is_read && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    markLeadUnread(
                                      lead.id
                                    )
                                  }
                                  style={{
                                    ...secondaryButtonStyle,
                                    padding:
                                      "10px",
                                  }}
                                >
                                  미확인으로 변경
                                </button>
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
                                  padding:
                                    "10px",
                                  color:
                                    "#b91c1c",
                                  borderColor:
                                    "#fecaca",
                                  background:
                                    "#fff",
                                }}
                              >
                                상담 삭제
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            )}

            {leadTotalPages >
              1 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr auto 1fr",
                  alignItems:
                    "center",
                  gap: "8px",
                  marginTop:
                    "14px",
                }}
              >
                <button
                  type="button"
                  disabled={
                    leadPage <= 1
                  }
                  onClick={() =>
                    loadLeads(
                      leadPage - 1,
                      leadFilter
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    opacity:
                      leadPage <=
                      1
                        ? 0.5
                        : 1,
                  }}
                >
                  이전
                </button>

                <div
                  style={{
                    fontSize:
                      "13px",
                    color:
                      "#4b5563",
                  }}
                >
                  {leadPage} /{" "}
                  {leadTotalPages}
                </div>

                <button
                  type="button"
                  disabled={
                    leadPage >=
                    leadTotalPages
                  }
                  onClick={() =>
                    loadLeads(
                      leadPage + 1,
                      leadFilter
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    opacity:
                      leadPage >=
                      leadTotalPages
                        ? 0.5
                        : 1,
                  }}
                >
                  다음
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* ======================================================
          사진 전체화면 확대
          ====================================================== */}

      {previewPhoto?.signedUrl && (
        <div
          onClick={() =>
            setPreviewPhoto(
              null
            )
          }
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background:
              "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            padding: "16px",
          }}
        >
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
              top: "16px",
              right: "16px",
              width: "44px",
              height: "44px",
              border:
                "1px solid rgba(255,255,255,0.4)",
              borderRadius:
                "999px",
              background:
                "rgba(0,0,0,0.5)",
              color:
                "#ffffff",
              fontSize:
                "24px",
              cursor: "pointer",
            }}
          >
            ×
          </button>

          <img
            src={
              previewPhoto.signedUrl
            }
            alt="확대 사진"
            onClick={(e) =>
              e.stopPropagation()
            }
            style={{
              maxWidth: "100%",
              maxHeight:
                "90vh",
              objectFit:
                "contain",
              borderRadius:
                "10px",
            }}
          />
        </div>
      )}
    </main>
  );
  }
    
