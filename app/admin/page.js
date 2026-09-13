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
          final_price,
          quote_work_details,
          quote_material,
          quote_note,
          quote_created_at,
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
        b        .toString(16)
        .padStart(2, "0")
      )
      .join("");
  }

  // ============================================================
  // 이미지 리사이즈
  // ============================================================

  async function resizeImage(
    file,
    maxWidth = 1600,
    quality = 0.85
  ) {
    return new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload = () => {
          const image = new Image();

          image.onload = () => {
            let width = image.width;
            let height = image.height;

            if (width > maxWidth) {
              height = Math.round(
                height *
                  (maxWidth / width)
              );

              width = maxWidth;
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
              image,
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
                      "이미지 변환 실패"
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

          image.onerror = () =>
            reject(
              new Error(
                "이미지를 불러올 수 없습니다."
              )
            );

          image.src =
            reader.result;
        };

        reader.onerror = () =>
          reject(
            new Error(
              "파일을 읽을 수 없습니다."
            )
          );

        reader.readAsDataURL(file);
      }
    );
  }

  // ============================================================
  // AI 사진 분석
  // ============================================================

  async function analyzeImage(file) {
    const formData =
      new FormData();

    formData.append(
      "image",
      file
    );

    const response = await fetch(
      "/api/analyze",
      {
        method: "POST",
        body: formData,
      }
    );

    const result =
      await response.json();

    if (!response.ok) {
      throw new Error(
        result?.error ||
          "AI 사진 분석 실패"
      );
    }

    return result;
  }

  // ============================================================
  // 전후 사진 비교 AI 분석
  // ============================================================

  async function analyzeBeforeAfter(
    beforeFile,
    afterFile
  ) {
    const formData =
      new FormData();

    formData.append(
      "beforeImage",
      beforeFile
    );

    formData.append(
      "afterImage",
      afterFile
    );

    const response = await fetch(
      "/api/analyze",
      {
        method: "POST",
        body: formData,
      }
    );

    const result =
      await response.json();

    if (!response.ok) {
      throw new Error(
        result?.error ||
          "전후 비교 분석 실패"
      );
    }

    return result;
  }

  // ============================================================
  // 임베딩 생성
  // ============================================================

  async function createEmbedding(
    text
  ) {
    if (!text?.trim()) {
      return null;
    }

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
      await response.json();

    if (!response.ok) {
      throw new Error(
        result?.error ||
          "임베딩 생성 실패"
      );
    }

    return (
      result.embedding || null
    );
  }

  // ============================================================
  // 사진 저장
  // ============================================================

  async function savePhoto({
    file,
    workItemId,
    projectId,
    photoType,
    photoCategory,
    photoSubCategory,
    description,
    tags = [],
    embedding = null,
    imageHash = null,
  }) {
    const resized =
      await resizeImage(file);

    const extension = "jpg";

    const safeName =
      `${Date.now()}-${Math.random()
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
          contentType:
            "image/jpeg",

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
      .getPublicUrl(
        storagePath
      );

    const photoUrl =
      publicData?.publicUrl ||
      storagePath;

    const insertData = {
      work_item_id:
        workItemId,

      project_id:
        projectId,

      photo_type:
        photoType,

      category:
        photoCategory,

      sub_category:
        photoSubCategory,

      storage_path:
        storagePath,

      photo_url:
        photoUrl,

      ai_description:
        description || null,

      ai_tags:
        tags,

      embedding:
        embedding,

      image_hash:
        imageHash,
    };

    const {
      error: insertError,
    } = await supabase
      .from("work_photos")
      .insert(insertData);

    if (insertError) {
      await supabase.storage
        .from("work-photos")
        .remove([
          storagePath,
        ]);

      throw insertError;
    }

    return storagePath;
  }

  // ============================================================
  // 시공 DB 신규 등록
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
        "⚠️ 실제 시공금액을 입력해주세요."
      );

      return;
    }

    setLoading(true);
    setMessage("");

    try {
      // 기존 프로젝트 ID 유지
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      // --------------------------------------------------------
      // 중복 이미지 검사
      // --------------------------------------------------------

      const allFiles = [
        ...beforeImages.map(
          (file) => ({
            file,
            type: "before",
          })
        ),

        ...afterImages.map(
          (file) => ({
            file,
            type: "after",
          })
        ),
      ];

      const filesWithHashes =
        [];

      const seenHashes =
        new Set();

      for (
        const item of allFiles
      ) {
        const hash =
          await getImageHash(
            item.file
          );

        if (
          seenHashes.has(hash)
        ) {
          continue;
        }

        seenHashes.add(hash);

        const {
          data: duplicateData,
          error:
            duplicateError,
        } = await supabase
          .from("work_photos")
          .select("id")
          .eq(
            "image_hash",
            hash
          )
          .limit(1);

        if (
          duplicateError
        ) {
          console.error(
            duplicateError
          );
        }

        if (
          duplicateData &&
          duplicateData.length >
            0
        ) {
          continue;
        }

        filesWithHashes.push(
          {
            ...item,
            hash,
          }
        );
      }

      if (
        filesWithHashes.length ===
        0
      ) {
        throw new Error(
          "선택한 사진이 모두 이미 등록된 사진입니다."
        );
      }

      // --------------------------------------------------------
      // 시공건 생성
      // --------------------------------------------------------

      const {
        data: workItem,
        error:
          workItemError,
      } = await supabase
        .from("work_items")
        .insert({
          project_id:
            projectId,

          category:
            category.trim(),

          sub_category:
            category.trim(),

          actual_cost:
            costNumber,

          memo:
            memo.trim() ||
            null,
        })
        .select(
          "id, project_id"
        )
        .single();

      if (
        workItemError
      ) {
        throw workItemError;
      }

      const workItemId =
        workItem.id;

      // --------------------------------------------------------
      // 시공 전 사진 분석
      // --------------------------------------------------------

      const analyzedBefore =
        [];

      const analyzedAfter =
        [];

      for (
        const item of filesWithHashes
      ) {
        if (
          item.type !==
          "before"
        ) {
          continue;
        }

        let aiResult = null;

        try {
          aiResult =
            await analyzeImage(
              item.file
            );
        } catch (
          error
        ) {
          console.error(
            "시공 전 AI 분석 오류:",
            error
          );
        }

        const description =
          aiResult?.description ||
          aiResult?.ai_description ||
          `${category.trim()} 시공 전 사진`;

        const tags =
          Array.isArray(
            aiResult?.tags
          )
            ? aiResult.tags
            : [];

        if (
          !tags.includes(
            "시공전"
          )
        ) {
          tags.push(
            "시공전"
          );
        }

        const detectedCategory =
          aiResult?.category ||
          category.trim();

        const detectedSubCategory =
          aiResult?.sub_category ||
          category.trim();

        analyzedBefore.push(
          {
            ...item,

            description,

            tags,

            detectedCategory,

            detectedSubCategory,
          }
        );
      }

      // --------------------------------------------------------
      // 시공 후 사진 분석
      // --------------------------------------------------------

      for (
        const item of filesWithHashes
      ) {
        if (
          item.type !==
          "after"
        ) {
          continue;
        }

        let aiResult = null;

        try {
          aiResult =
            await analyzeImage(
              item.file
            );
        } catch (
          error
        ) {
          console.error(
            "시공 후 AI 분석 오류:",
            error
          );
        }

        const description =
          aiResult?.description ||
          aiResult?.ai_description ||
          `${category.trim()} 시공 후 사진`;

        const tags =
          Array.isArray(
            aiResult?.tags
          )
            ? aiResult.tags
            : [];

        if (
          !tags.includes(
            "시공후"
          )
        ) {
          tags.push(
            "시공후"
          );
        }

        const detectedCategory =
          aiResult?.category ||
          category.trim();

        const detectedSubCategory =
          aiResult?.sub_category ||
          category.trim();

        analyzedAfter.push(
          {
            ...item,

            description,

            tags,

            detectedCategory,

            detectedSubCategory,
          }
        );
      }

      // --------------------------------------------------------
      // 전후 비교 분석
      // --------------------------------------------------------

      let comparisonResult =
        null;

      if (
        analyzedBefore.length >
          0 &&
        analyzedAfter.length >
          0
      ) {
        try {
          comparisonResult =
            await analyzeBeforeAfter(
              analyzedBefore[0]
                .file,
              analyzedAfter[0]
                .file
            );
        } catch (
          error
        ) {
          console.error(
            "전후 비교 오류:",
            error
          );
        }
      }

      // --------------------------------------------------------
      // 시공 전 사진 저장
      // --------------------------------------------------------

      for (
        const item of analyzedBefore
      ) {
        const searchText =
          [
            `시공 부위: ${
              item.detectedCategory
            }`,

            `세부 부위: ${
              item.detectedSubCategory
            }`,

            "사진 상태: 시공 전",

            `사진 설명: ${
              item.description
            }`,

            `특징: ${
              item.tags.join(
                ", "
              )
            }`,

            comparisonResult
              ?.description
              ? `전후 비교: ${comparisonResult.description}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");

        let embedding =
          null;

        try {
          embedding =
            await createEmbedding(
              searchText
            );
        } catch (
          error
        ) {
          console.error(
            "임베딩 오류:",
            error
          );
        }

        await savePhoto({
          file: item.file,

          workItemId,

          projectId,

          photoType:
            "before",

          photoCategory:
            item.detectedCategory,

          photoSubCategory:
            item.detectedSubCategory,

          description:
            item.description,

          tags:
            item.tags,

          embedding,

          imageHash:
            item.hash,
        });
      }

      // --------------------------------------------------------
      // 시공 후 사진 저장
      // --------------------------------------------------------

      for (
        const item of analyzedAfter
      ) {
        const compareDescription =
          comparisonResult
            ?.description ||
          comparisonResult
            ?.ai_description ||
          "";

        const combinedDescription =
          compareDescription
            ? `${item.description}\n\n전후 비교: ${compareDescription}`
            : item.description;

        const compareTags =
          Array.isArray(
            comparisonResult?.tags
          )
            ? comparisonResult.tags
            : [];

        const tags = [
          ...new Set([
            ...item.tags,
            ...compareTags,
            "시공후",
          ]),
        ];

        const searchText =
          [
            `시공 부위: ${
              item.detectedCategory
            }`,

            `세부 부위: ${
              item.detectedSubCategory
            }`,

            "사진 상태: 시공 후",

            `사진 설명: ${combinedDescription}`,

            `특징: ${tags.join(
              ", "
            )}`,

            `실제 시공금액: ${costNumber}원`,

            material.trim()
              ? `사용 자재: ${material.trim()}`
              : "",

            memo.trim()
              ? `메모: ${memo.trim()}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");

        let embedding =
          null;

        try {
          embedding =
            await createEmbedding(
              searchText
            );
        } catch (
          error
        ) {
          console.error(
            "임베딩 오류:",
            error
          );
        }

        await savePhoto({
          file: item.file,

          workItemId,

          projectId,

          photoType:
            "after",

          photoCategory:
            item.detectedCategory,

          photoSubCategory:
            item.detectedSubCategory,

          description:
            combinedDescription,

          tags,

          embedding,

          imageHash:
            item.hash,
        });
      }

      // --------------------------------------------------------
      // 등록 완료
      // --------------------------------------------------------

      setBeforeImages(
        []
      );

      setAfterImages(
        []
      );

      setCategory("");

      setActualCost("");

      setMaterial("");

      setMemo("");

      setMessage(
        `✅ 시공 데이터가 등록되었습니다. 총 ${filesWithHashes.length}장의 사진을 저장했습니다.`
      );

      await loadJobs(
        1,
        jobSearchApplied
      );

      changeTab("jobs");
    } catch (error) {
      console.error(
        "시공 등록 오류:",
        error
      );

      setMessage(
        `❌ 등록 오류: ${
          error?.message ||
          "등록 실패"
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // 최종 견적 작성 / 저장
  // ============================================================

  function LeadQuoteEditor({
    lead,
  }) {
    const [
      price,
      setPrice,
    ] = useState(
      lead.final_price !==
          null &&
        lead.final_price !==
          undefined
        ? String(
            lead.final_price
          )
        : ""
    );

    const [
      workDetails,
      setWorkDetails,
    ] = useState(
      lead.quote_work_details ||
        lead.category ||
        ""
    );

    const [
      quoteMaterialValue,
      setQuoteMaterialValue,
    ] = useState(
      lead.quote_material || ""
    );

    const [
      quoteNoteValue,
      setQuoteNoteValue,
    ] = useState(
      lead.quote_note || ""
    );

    const [
      saving,
      setSaving,
    ] = useState(false);

    const [
      quoteMessage,
      setQuoteMessage,
    ] = useState("");

    async function saveFinalQuote() {
      const priceNumber =
        Number(
          String(price).replace(
            /[^0-9]/g,
            ""
          )
        );

      if (
        !Number.isFinite(
          priceNumber
        ) ||
        priceNumber <= 0
      ) {
        setQuoteMessage(
          "⚠️ 최종 견적금액을 정확히 입력해주세요."
        );

        return;
      }

      if (
        !workDetails.trim()
      ) {
        setQuoteMessage(
          "⚠️ 시공내용을 입력해주세요."
        );

        return;
      }

      setSaving(true);
      setQuoteMessage("");

      try {
        const now =
          new Date().toISOString();

        const { error } =
          await supabase
            .from(
              "customer_leads"
            )
            .update({
              final_price:
                priceNumber,

              quote_work_details:
                workDetails.trim(),

              quote_material:
                quoteMaterialValue.trim() ||
                null,

              quote_note:
                quoteNoteValue.trim() ||
                null,

              quote_created_at:
                now,
            })
            .eq(
              "id",
              lead.id
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
                        priceNumber,

                      quote_work_details:
                        workDetails.trim(),

                      quote_material:
                        quoteMaterialValue.trim() ||
                        null,

                      quote_note:
                        quoteNoteValue.trim() ||
                        null,

                      quote_created_at:
                        now,
                    }
                  : item
            )
        );

        setPrice(
          String(
            priceNumber
          )
        );

        setQuoteMessage(
          "✅ 최종 견적이 저장되었습니다."
        );
      } catch (error) {
        console.error(
          error
        );

        setQuoteMessage(
          `❌ 견적 저장 오류: ${
            error?.message ||
            "저장 실패"
          }`
        );
      } finally {
        setSaving(false);
      }
    }

    return (
      <div
        style={{
          marginBottom:
            "14px",

          padding: "14px",

          borderRadius:
            "12px",

          background:
            "#fffbeb",

          border:
            "1px solid #fde68a",
        }}
      >
        <div
          style={{
            fontWeight:
              "bold",

            fontSize:
              "17px",

            marginBottom:
              "4px",
          }}
        >
          🧾 최종 견적 작성
        </div>

        <div
          style={{
            fontSize:
              "12px",

            color:
              "#92400e",

            lineHeight:
              1.5,

            marginBottom:
              "12px",
          }}
        >
          AI 예상견적은 참고용입니다.
          고객에게 보낼 확정 금액과 내용을
          직접 입력해주세요.
        </div>

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
          최종 견적금액
        </label>

        <input
          value={price}
          inputMode="numeric"
          onChange={(e) =>
            setPrice(
              e.target.value.replace(
                /[^0-9]/g,
                ""
              )
            )
          }
          placeholder="예: 850000"
          style={{
            ...inputStyle,

            marginBottom:
              "5px",
          }}
        />

        <div
          style={{
            fontSize:
              "13px",

            color:
              "#1d4ed8",

            fontWeight:
              "bold",

            marginBottom:
              "12px",
          }}
        >
          {price
            ? formatWon(
                Number(price)
              )
            : "금액을 입력해주세요."}
        </div>

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
          시공내용
        </label>

        <textarea
          value={
            workDetails
          }
          onChange={(e) =>
            setWorkDetails(
              e.target.value
            )
          }
          rows={3}
          placeholder="예: 싱크대 상·하부장 인테리어필름 시공"
          style={{
            ...inputStyle,

            resize:
              "vertical",

            marginBottom:
              "10px",
          }}
        />

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
          사용 자재
        </label>

        <input
          value={
            quoteMaterialValue
          }
          onChange={(e) =>
            setQuoteMaterialValue(
              e.target.value
            )
          }
          placeholder="예: 현대 L&C GS115 밀키화이트"
          style={{
            ...inputStyle,

            marginBottom:
              "10px",
          }}
        />

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
          특이사항 / 안내
        </label>

        <textarea
          value={
            quoteNoteValue
          }
          onChange={(e) =>
            setQuoteNoteValue(
              e.target.value
            )
          }
          rows={3}
          placeholder="예: 현장 상태에 따라 추가비용이 발생할 수 있습니다."
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
          disabled={saving}
          onClick={
            saveFinalQuote
          }
          style={{
            ...primaryButtonStyle,

            background:
              "#92400e",
          }}
        >
          {saving
            ? "견적 저장 중..."
            : "최종 견적 저장"}
        </button>

        {lead.quote_created_at && (
          <div
            style={{
              marginTop:
                "8px",

              fontSize:
                "12px",

              color:
                "#6b7280",
            }}
          >
            마지막 저장:{" "}
            {formatDate(
              lead.quote_created_at
            )}
          </div>
        )}

        {quoteMessage && (
          <div
            style={{
              marginTop:
                "9px",

              padding:
                "9px",

              borderRadius:
                "8px",

              background:
                "#ffffff",

              fontSize:
                "13px",

              lineHeight:
                1.5,
            }}
          >
            {quoteMessage}
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

          borderRadius:
            "12px",

          padding: "10px",

          background:
            "#f9fafb",
        }}
      >
        {photo.signedUrl ? (
          <img
            src={
              photo.signedUrl
            }
            alt={
              photo.photo_type ===
              "before"
                ? "시공 전"
                : "시공 후"
            }
            onClick={() =>
              setPreviewPhoto(
                photo.signedUrl
              )
            }
            style={{
              width: "100%",
              maxHeight:
                "260px",
              objectFit:
                "cover",
              borderRadius:
                "10px",
              cursor:
                "pointer",
              marginBottom:
                "8px",
            }}
          />
        ) : (
          <div
            style={{
              padding:
                "30px",

              textAlign:
                "center",

              background:
                "#e5e7eb",

              borderRadius:
                "10px",

              marginBottom:
                "8px",
            }}
          >
            이미지 없음
          </div>
        )}

        {!isEditing ? (
          <>
            <div
              style={{
                fontWeight:
                  "bold",

                marginBottom:
                  "5px",
              }}
            >
              {photo.photo_type ===
              "before"
                ? "시공 전"
                : photo.photo_type ===
                  "after"
                ? "시공 후"
                : photo.photo_type ||
                  "사진"}
            </div>

            <div
              style={{
                fontSize:
                  "13px",

                lineHeight:
                  1.6,

                color:
                  "#374151",

                whiteSpace:
                  "pre-wrap",

                marginBottom:
                  "8px",
              }}
            >
              {photo.ai_description ||
                "설명 없음"}
            </div>

            {Array.isArray(
              photo.ai_tags
            ) &&
              photo.ai_tags
                .length > 0 && (
                <div
                  style={{
                    display:
                      "flex",

                    flexWrap:
                      "wrap",

                    gap: "5px",

                    marginBottom:
                      "8px",
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
                            "4px 7px",

                          borderRadius:
                            "999px",

                          background:
                            "#e0e7ff",

                          color:
                            "#3730a3",

                          fontSize:
                            "11px",
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
                display:
                  "grid",

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
                style={
                  secondaryButtonStyle
                }
              >
                사진정보 수정
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

                  color:
                    "#dc2626",

                  borderColor:
                    "#fecaca",
                }}
              >
                사진 삭제
              </button>
            </div>
          </>
        ) : (
          <div>
            <select
              value={
                editPhotoType
              }
              onChange={(e) =>
                setEditPhotoType(
                  e.target.value
                )
              }
              style={{
                ...inputStyle,

                marginBottom:
                  "8px",
              }}
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
              style={{
                ...inputStyle,

                marginBottom:
                  "8px",
              }}
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
              style={{
                ...inputStyle,

                marginBottom:
                  "8px",
              }}
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
              rows={5}
              placeholder="AI 설명"
              style={{
                ...inputStyle,

                resize:
                  "vertical",

                marginBottom:
                  "8px",
              }}
            />

            <div
              style={{
                display:
                  "grid",

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
                style={
                  primaryButtonStyle
                }
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
                style={
                  secondaryButtonStyle
                }
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // 메인 화면
  // ============================================================

  return (
    <main
      style={{
        maxWidth: "980px",
        margin: "0 auto",
        padding:
          "18px 12px 80px",
        background:
          "#f3f4f6",
        minHeight:
          "100vh",
        color: "#111827",
      }}
    >
      <div
        style={{
          marginBottom:
            "18px",
        }}
      >
        <h1
          style={{
            margin:
              "0 0 5px",

            fontSize:
              "26px",
          }}
        >
          기분좋은공간 관리자
        </h1>

        <div
          style={{
            color:
              "#6b7280",

            fontSize:
              "13px",
          }}
        >
          시공 데이터 · AI 견적 · 고객 상담 관리
        </div>
      </div>

      {/* 신규 상담 실시간 알림 */}

      {newLeadAlert && (
        <div
          style={{
            marginBottom:
              "14px",

            padding:
              "14px",

            background:
              "#fff7ed",

            border:
              "2px solid #fb923c",

            borderRadius:
              "14px",
          }}
        >
          <div
            style={{
              fontWeight:
                "bold",

              fontSize:
                "17px",

              marginBottom:
                "5px",
            }}
          >
            🔔 신규 상담이 들어왔습니다.
          </div>

          <div
            style={{
              fontSize:
                "14px",

              marginBottom:
                "10px",
            }}
          >
            {newLeadAlert.customer_name ||
              "고객"}{" "}
            ·{" "}
            {newLeadAlert.phone ||
              "전화번호 없음"}
          </div>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "1fr 1fr",

              gap: "8px",
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

                setNewLeadAlert(
                  null
                );

                loadLeads(
                  1,
                  "unread"
                );
              }}
              style={
                primaryButtonStyle
              }
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
              style={
                secondaryButtonStyle
              }
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 상단 탭 */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(3, 1fr)",
          gap: "7px",
          marginBottom:
            "14px",
        }}
      >
        <button
          type="button"
          onClick={() =>
            changeTab(
              "register"
            )
          }
          style={{
            ...secondaryButtonStyle,

            background:
              activeTab ===
              "register"
                ? "#111827"
                : "#ffffff",

            color:
              activeTab ===
              "register"
                ? "#ffffff"
                : "#111827",
          }}
        >
          시공 등록
        </button>

        <button
          type="button"
          onClick={() => {
            changeTab(
              "jobs"
            );

            loadJobs(
              jobPage,
              jobSearchApplied
            );
          }}
          style={{
            ...secondaryButtonStyle,

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
          }}
        >
          시공 DB
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
            ...secondaryButtonStyle,

            position:
              "relative",

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
          }}
        >
          고객 상담

          {unreadCount >
            0 && (
            <span
              style={{
                position:
                  "absolute",

                top: "-8px",
                right:
                  "-6px",

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
                  "11px",

                fontWeight:
                  "bold",
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* 푸시 알림 */}

      <div
        style={{
          ...sectionStyle,
          padding: "12px",
        }}
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
            <div
              style={{
                fontWeight:
                  "bold",
                fontSize:
                  "14px",
              }}
            >
              📲 신규 상담 휴대폰 알림
            </div>

            <div
              style={{
                color:
                  "#6b7280",
                fontSize:
                  "11px",
                marginTop:
                  "3px",
              }}
            >
              {notificationEnabled
                ? "이 기기에 알림이 등록되어 있습니다."
                : "알림을 켜면 신규 상담을 바로 확인할 수 있습니다."}
            </div>
          </div>

          <button
            type="button"
            onClick={
              enableNotifications
            }
            style={{
              padding:
                "9px 12px",
              border: "none",
              borderRadius:
                "9px",
              background:
                notificationEnabled
                  ? "#16a34a"
                  : "#2563eb",
              color:
                "#ffffff",
              fontWeight:
                "bold",
              whiteSpace:
                "nowrap",
            }}
          >
            {notificationEnabled
              ? "알림 등록됨"
              : "알림 켜기"}
          </button>
        </div>
      </div>

      {/* AI 설정 */}

      <section
        style={sectionStyle}
      >
        <div
          style={{
            fontWeight: "bold",
            fontSize: "17px",
            marginBottom:
              "10px",
          }}
        >
          🤖 AI 유사도 설정
        </div>

        <div
          style={{
            fontSize: "13px",
            color: "#6b7280",
            lineHeight: 1.5,
            marginBottom:
              "10px",
          }}
        >
          현재 기준:{" "}
          <strong>
            {Math.round(
              Number(
                similarityThreshold
              ) * 100
            )}
            %
          </strong>
        </div>

        <input
          type="range"
          min="0.3"
          max="0.95"
          step="0.01"
          value={
            similarityThreshold
          }
          onChange={(e) =>
            setSimilarityThreshold(
              Number(
                e.target.value
              )
            )
          }
          style={{
            width: "100%",
            marginBottom:
              "10px",
          }}
        />

        <button
          type="button"
          disabled={
            settingLoading
          }
          onClick={
            saveSimilaritySetting
          }
          style={
            secondaryButtonStyle
          }
        >
          {settingLoading
            ? "저장 중..."
            : "유사도 기준 저장"}
        </button>

        {settingMessage && (
          <div
            style={{
              marginTop:
                "8px",
              fontSize:
                "13px",
            }}
          >
            {settingMessage}
          </div>
        )}
      </section>

      {/* 시공 등록 */}

      {activeTab ===
        "register" && (
        <section
          style={sectionStyle}
        >
          <h2
            style={{
              margin:
                "0 0 14px",
              fontSize:
                "20px",
            }}
          >
            시공 데이터 등록
          </h2>

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
            시공 부위
          </label>

          <input
            value={category}
            onChange={(e) =>
              setCategory(
                e.target.value
              )
            }
            placeholder="예: 싱크대, 방문, 샷시"
            style={{
              ...inputStyle,
              marginBottom:
                "12px",
            }}
          />

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
            실제 시공금액
          </label>

          <input
            value={actualCost}
            inputMode="numeric"
            onChange={(e) =>
              setActualCost(
                e.target.value.replace(
                  /[^0-9]/g,
                  ""
                )
              )
            }
            placeholder="예: 850000"
            style={{
              ...inputStyle,
              marginBottom:
                "5px",
            }}
          />

          <div
            style={{
              color:
                "#2563eb",
              fontWeight:
                "bold",
              fontSize:
                "13px",
              marginBottom:
                "12px",
            }}
          >
            {actualCost
              ? formatWon(
                  actualCost
                )
              : ""}
          </div>

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
            사용 자재
          </label>

          <input
            value={material}
            onChange={(e) =>
              setMaterial(
                e.target.value
              )
            }
            placeholder="예: 현대 L&C GS115"
            style={{
              ...inputStyle,
              marginBottom:
                "12px",
            }}
          />

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
            메모
          </label>

          <textarea
            value={memo}
            onChange={(e) =>
              setMemo(
                e.target.value
              )
            }
            rows={3}
            placeholder="현장 특이사항"
            style={{
              ...inputStyle,
              resize:
                "vertical",
              marginBottom:
                "12px",
            }}
          />

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
            시공 전 사진
          </label>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) =>
              setBeforeImages(
                Array.from(
                  e.target.files ||
                    []
                )
              )
            }
            style={{
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
                "12px",
            }}
          >
            선택:{" "}
            {beforeImages.length}
            장
          </div>

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
            시공 후 사진
          </label>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) =>
              setAfterImages(
                Array.from(
                  e.target.files ||
                    []
                )
              )
            }
            style={{
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
                "14px",
            }}
          >
            선택:{" "}
            {afterImages.length}
            장
          </div>

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
              : "시공 데이터 저장"}
          </button>

          {message && (
            <div
              style={{
                marginTop:
                  "12px",
                whiteSpace:
                  "pre-wrap",
                lineHeight:
                  1.6,
              }}
            >
              {message}
            </div>
          )}
        </section>
      )}

      {/* 시공 DB */}

      {activeTab ===
        "jobs" && (
        <section
          style={sectionStyle}
        >
          <h2
            style={{
              margin:
                "0 0 12px",
              fontSize:
                "20px",
            }}
          >
            시공 DB
          </h2>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "1fr auto",
              gap: "7px",
              marginBottom:
                "7px",
            }}
          >
            <input
              value={jobSearch}
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
              placeholder="시공 부위 또는 메모 검색"
              style={inputStyle}
            />

            <button
              type="button"
              onClick={
                searchJobs
              }
              style={{
                padding:
                  "0 16px",
                border: "none",
                borderRadius:
                  "10px",
                background:
                  "#2563eb",
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
                ...secondaryButtonStyle,
                marginBottom:
                  "10px",
              }}
            >
              검색 초기화
            </button>
          )}

          <div
            style={{
              fontSize:
                "13px",
              color:
                "#6b7280",
              marginBottom:
                "10px",
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
                marginBottom:
                  "10px",
                padding:
                  "10px",
                borderRadius:
                  "9px",
                background:
                  "#f9fafb",
                whiteSpace:
                  "pre-wrap",
              }}
            >
              {jobsMessage}
            </div>
          )}

          {jobsLoading ? (
            <div>
              불러오는 중...
            </div>
          ) : jobs.length ===
            0 ? (
            <div
              style={{
                padding:
                  "30px 0",
                textAlign:
                  "center",
                color:
                  "#6b7280",
              }}
            >
              등록된 시공 데이터가 없습니다.
            </div>
          ) : (
            <div
              style={{
                display:
                  "grid",
                gap: "10px",
              }}
            >
              {jobs.map(
                (job) => (
                  <div
                    key={
                      job.id
                    }
                    style={{
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "12px",
                      padding:
                        "12px",
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
                            fontWeight:
                              "bold",
                            fontSize:
                              "16px",
                          }}
                        >
                          {job.category ||
                            "시공"}
                        </div>

                        <div
                          style={{
                            color:
                              "#2563eb",
                            fontWeight:
                              "bold",
                            marginTop:
                              "4px",
                          }}
                        >
                          {formatWon(
                            job.actual_cost
                          )}
                        </div>

                        <div
                          style={{
                            color:
                              "#6b7280",
                            fontSize:
                              "11px",
                            marginTop:
                              "4px",
                          }}
                        >
                          {formatDate(
                            job.created_at
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          toggleJobDetail(
                            job.id
                          )
                        }
                        style={{
                          padding:
                            "8px 11px",
                          border:
                            "1px solid #d1d5db",
                          borderRadius:
                            "8px",
                          background:
                            "#ffffff",
                          fontWeight:
                            "bold",
                        }}
                      >
                        {openJobId ===
                        job.id
                          ? "닫기"
                          : "상세"}
                      </button>
                    </div>

                    {openJobId ===
                      job.id && (
                      <div
                        style={{
                          marginTop:
                            "12px",
                          paddingTop:
                            "12px",
                          borderTop:
                            "1px solid #e5e7eb",
                        }}
                      >
                        {editingId ===
                        job.id ? (
                          <div>
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
                              style={{
                                ...inputStyle,
                                marginBottom:
                                  "7px",
                              }}
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
                                marginBottom:
                                  "7px",
                              }}
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
                                  e.target.value.replace(
                                    /[^0-9]/g,
                                    ""
                                  )
                                )
                              }
                              placeholder="시공금액"
                              style={{
                                ...inputStyle,
                                marginBottom:
                                  "7px",
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
                              rows={3}
                              placeholder="메모"
                              style={{
                                ...inputStyle,
                                resize:
                                  "vertical",
                                marginBottom:
                                  "7px",
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
                                style={
                                  primaryButtonStyle
                                }
                              >
                                수정 저장
                              </button>

                              <button
                                type="button"
                                onClick={
                                  cancelEdit
                                }
                                style={
                                  secondaryButtonStyle
                                }
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              style={{
                                fontSize:
                                  "13px",
                                lineHeight:
                                  1.7,
                                marginBottom:
                                  "10px",
                              }}
                            >
                              <div>
                                <strong>
                                  세부 부위:
                                </strong>{" "}
                                {job.sub_category ||
                                  "-"}
                              </div>

                              <div>
                                <strong>
                                  메모:
                                </strong>{" "}
                                {job.memo ||
                                  "-"}
                              </div>
                            </div>

                            <div
                              style={{
                                display:
                                  "grid",
                                gridTemplateColumns:
                                  "1fr 1fr",
                                gap:
                                  "7px",
                                marginBottom:
                                  "12px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  startEdit(
                                    job
                                  )
                                }
                                style={
                                  secondaryButtonStyle
                                }
                              >
                                시공정보 수정
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
                                  color:
                                    "#dc2626",
                                  borderColor:
                                    "#fecaca",
                                }}
                              >
                                시공건 삭제
                              </button>
                            </div>
                          </>
                        )}

                        <div
                          style={{
                            fontWeight:
                              "bold",
                            marginBottom:
                              "8px",
                          }}
                        >
                          시공 사진
                        </div>

                        {jobPhotoLoadingId ===
                        job.id ? (
                          <div>
                            사진 불러오는 중...
                          </div>
                        ) : (
                          <div
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(220px, 1fr))",
                              gap:
                                "10px",
                            }}
                          >
                            {(jobPhotos[
                              job.id
                            ] || [])
                              .length ===
                            0 ? (
                              <div
                                style={{
                                  color:
                                    "#6b7280",
                                }}
                              >
                                등록된 사진이 없습니다.
                              </div>
                            ) : (
                              (jobPhotos[
                                job.id
                              ] || []).map(
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
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {/* 시공 DB 페이지 이동 */}

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
              style={
                secondaryButtonStyle
              }
            >
              이전
            </button>

            <div
              style={{
                fontSize:
                  "13px",
                whiteSpace:
                  "nowrap",
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
              style={
                secondaryButtonStyle
              }
            >
              다음
            </button>
          </div>
        </section>
      )}

      {/* 고객 상담 */}

      {activeTab ===
        "leads" && (
        <section
          style={sectionStyle}
        >
          <h2
            style={{
              margin:
                "0 0 12px",
              fontSize:
                "20px",
            }}
          >
            고객 상담
          </h2>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(3, 1fr)",
              gap: "6px",
              marginBottom:
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
                `미확인 ${unreadCount}`,
              ],
              [
                "read",
                "확인완료",
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

                    setLeadPage(
                      1
                    );
                  }}
                  style={{
                    ...secondaryButtonStyle,
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
                  }}
                >
                  {label}
                </button>
              )
            )}
          </div>

          <div
            style={{
              color:
                "#6b7280",
              fontSize:
                "13px",
              marginBottom:
                "10px",
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
                marginBottom:
                  "10px",
                padding:
                  "10px",
                background:
                  "#f9fafb",
                borderRadius:
                  "9px",
                whiteSpace:
                  "pre-wrap",
              }}
            >
              {leadsMessage}
            </div>
          )}

          {leadsLoading ? (
            <div>
              상담 목록 불러오는 중...
            </div>
          ) : leads.length ===
            0 ? (
            <div
              style={{
                padding:
                  "30px 0",
                textAlign:
                  "center",
                color:
                  "#6b7280",
              }}
            >
              상담 내역이 없습니다.
            </div>
          ) : (
            <div
              style={{
                display:
                  "grid",
                gap: "10px",
              }}
            >
              {leads.map(
                (lead) => (
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
                        "12px",
                      padding:
                        "12px",
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
                                  "10px",
                                fontWeight:
                                  "bold",
                              }}
                            >
                              NEW
                            </span>
                          )}

                          <strong
                            style={{
                              fontSize:
                                "16px",
                            }}
                          >
                            {lead.customer_name ||
                              "고객"}
                          </strong>
                        </div>

                        <div
                          style={{
                            marginTop:
                              "5px",
                            fontSize:
                              "13px",
                            color:
                              "#374151",
                          }}
                        >
                          {lead.phone ||
                            "전화번호 없음"}
                        </div>

                        <div
                          style={{
                            marginTop:
                              "3px",
                            fontSize:
                              "12px",
                            color:
                              "#6b7280",
                          }}
                        >
                          {lead.region ||
                            "지역 미입력"}{" "}
                          ·{" "}
                          {formatDate(
                            lead.created_at
                          )}
                        </div>

                        <div
                          style={{
                            marginTop:
                              "5px",
                            fontSize:
                              "13px",
                            fontWeight:
                              "bold",
                            color:
                              "#2563eb",
                          }}
                        >
                          AI 예상{" "}
                          {formatWon(
                            lead.estimate_min
                          )}{" "}
                          ~{" "}
                          {formatWon(
                            lead.estimate_max
                          )}
                        </div>

                        {lead.final_price && (
                          <div
                            style={{
                              marginTop:
                                "4px",
                              fontSize:
                                "13px",
                              fontWeight:
                                "bold",
                              color:
                                "#92400e",
                            }}
                          >
                            최종 견적{" "}
                            {formatWon(
                              lead.final_price
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          await toggleLeadDetail(
                            lead
                          );

                          if (
                            !lead.is_read
                          ) {
                            await markLeadRead(
                              lead.id
                            );
                          }
                        }}
                        style={{
                          padding:
                            "8px 11px",
                          border:
                            "1px solid #d1d5db",
                          borderRadius:
                            "8px",
                          background:
                            "#ffffff",
                          fontWeight:
                            "bold",
                        }}
                      >
                        {openLeadId ===
                        lead.id
                          ? "닫기"
                          : "상세"}
                      </button>
                    </div>

                    {openLeadId ===
                      lead.id && (
                      <div
                        style={{
                          marginTop:
                            "12px",
                          paddingTop:
                            "12px",
                          borderTop:
                            "1px solid #e5e7eb",
                        }}
                      >
                        <div
                          style={{
                            fontWeight:
                              "bold",
                            marginBottom:
                              "7px",
                          }}
                        >
                          고객사진
                        </div>

                        {leadPhotoLoadingId ===
                        lead.id ? (
                          <div
                            style={{
                              marginBottom:
                                "12px",
                            }}
                          >
                            고객사진 불러오는 중...
                          </div>
                        ) : Array.isArray(
                            leadPhotoUrls[
                              lead.id
                            ]
                          ) &&
                          leadPhotoUrls[
                            lead.id
                          ].length >
                            0 ? (
                          <div
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(140px, 1fr))",
                              gap:
                                "8px",
                              marginBottom:
                                "12px",
                            }}
                          >
                            {leadPhotoUrls[
                              lead.id
                            ].map(
                              (
                                url,
                                index
                              ) => (
                                <img
                                  key={`${lead.id}-${index}`}
                                  src={
                                    url
                                  }
                                  alt={`고객사진 ${
                                    index +
                                    1
                                  }`}
                                  onClick={() =>
                                    setPreviewPhoto(
                                      url
                                    )
                                  }
                                  style={{
                                    width:
                                      "100%",
                                    height:
                                      "170px",
                                    objectFit:
                                      "cover",
                                    borderRadius:
                                      "10px",
                                    cursor:
                                      "pointer",
                                  }}
                                />
                              )
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              color:
                                "#6b7280",
                              fontSize:
                                "13px",
                              marginBottom:
                                "12px",
                            }}
                          >
                            고객사진이 없습니다.
                          </div>
                        )}

                        <div
                          style={{
                            padding:
                              "12px",
                            borderRadius:
                              "10px",
                            background:
                              "#eff6ff",
                            marginBottom:
                              "10px",
                          }}
                        >
                          <div
                            style={{
                              fontWeight:
                                "bold",
                              marginBottom:
                                "6px",
                            }}
                          >
                            AI 견적
                          </div>

                          <div
                            style={{
                              fontSize:
                                "14px",
                              lineHeight:
                                1.7,
                            }}
                          >
                            <div>
                              예상 최소금액:{" "}
                              <strong>
                                {formatWon(
                                  lead.estimate_min
                                )}
                              </strong>
                            </div>

                            <div>
                              예상 최대금액:{" "}
                              <strong>
                                {formatWon(
                                  lead.estimate_max
                                )}
                              </strong>
                            </div>

                            <div>
                              예상 평균금액:{" "}
                              <strong>
                                {formatWon(
                                  lead.estimate_average
                                )}
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            padding:
                              "12px",
                            borderRadius:
                              "10px",
                            background:
                              "#f9fafb",
                            marginBottom:
                              "12px",
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
                            AI 분석 내용
                          </div>

                          <div
                            style={{
                              fontSize:
                                "13px",
                              lineHeight:
                                1.7,
                              whiteSpace:
                                "pre-wrap",
                            }}
                          >
                            {lead.ai_description ||
                              "AI 분석 내용이 없습니다."}
                          </div>
                        </div>

                        {/* 최종 견적 작성 */}

                        <LeadQuoteEditor
                          lead={
                            lead
                          }
                        />

                        {/* 상담 상태 */}

                        <div
                          style={{
                            marginBottom:
                              "12px",
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
                            상담 상태
                          </div>

                          <select
                            value={
                              lead.status ||
                              "신규문의"
                            }
                            onChange={(e) =>
                              updateLeadStatus(
                                lead.id,
                                e.target.value
                              )
                            }
                            style={
                              inputStyle
                            }
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
                                  {status}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div
                          style={{
                            padding:
                              "12px",
                            background:
                              "#f9fafb",
                            borderRadius:
                              "10px",
                            marginBottom:
                              "10px",
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
                            고객 요청 / 메모
                          </div>

                          <div
                            style={{
                              fontSize:
                                "13px",
                              lineHeight:
                                1.7,
                              whiteSpace:
                                "pre-wrap",
                            }}
                          >
                            {lead.memo ||
                              "메모가 없습니다."}
                          </div>
                        </div>

                        <div
                          style={{
                            display:
                              "grid",
                            gridTemplateColumns:
                              "1fr 1fr",
                            gap:
                              "7px",
                            marginBottom:
                              "7px",
                          }}
                        >
                          {lead.is_read ? (
                            <button
                              type="button"
                              onClick={() =>
                                markLeadUnread(
                                  lead.id
                                )
                              }
                              style={
                                secondaryButtonStyle
                              }
                            >
                              미확인으로 변경
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                markLeadRead(
                                  lead.id
                                )
                              }
                              style={
                                secondaryButtonStyle
                              }
                            >
                              확인 완료
                            </button>
                          )}

                          <a
                            href={`tel:${lead.phone || ""}`}
                            style={{
                              ...primaryButtonStyle,
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              textDecoration:
                                "none",
                              boxSizing:
                                "border-box",
                            }}
                          >
                            📞 전화하기
                          </a>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            deleteLead(
                              lead
                            )
                          }
                          style={{
                            ...secondaryButtonStyle,
                            color:
                              "#dc2626",
                            borderColor:
                              "#fecaca",
                          }}
                        >
                          상담 삭제
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {/* 상담 페이지 이동 */}

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
              style={
                secondaryButtonStyle
              }
            >
              이전
            </button>

            <div
              style={{
                fontSize:
                  "13px",
                whiteSpace:
                  "nowrap",
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
              style={
                secondaryButtonStyle
              }
            >
              다음
            </button>
          </div>
        </section>
      )}

      {/* 전체화면 사진 미리보기 */}

      {previewPhoto && (
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
            zIndex: 9999,
            background:
              "rgba(0,0,0,0.88)",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            padding:
              "16px",
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
              top: "15px",
              right:
                "15px",
              width: "42px",
              height:
                "42px",
              border:
                "none",
              borderRadius:
                "50%",
              background:
                "#ffffff",
              fontSize:
                "20px",
              fontWeight:
                "bold",
            }}
          >
            ×
          </button>

          <img
            src={
              previewPhoto
            }
            alt="사진 크게 보기"
            onClick={(e) =>
              e.stopPropagation()
            }
            style={{
              maxWidth:
                "100%",
              maxHeight:
                "92vh",
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
