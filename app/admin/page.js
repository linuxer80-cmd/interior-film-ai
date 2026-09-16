"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const JOB_PAGE_SIZE = 10;
const LEAD_PAGE_SIZE = 20;
const SIGNED_URL_SECONDS = 60 * 30;
const PROJECT_ID = "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

export default function AdminPage() {
  /* =========================================================
     기본
  ========================================================= */

  const [activeTab, setActiveTab] = useState("jobs");
  const activeTabRef = useRef("jobs");

  const [similarityThreshold, setSimilarityThreshold] = useState(0.65);
  const [settingMessage, setSettingMessage] = useState("");
  const [settingLoading, setSettingLoading] = useState(false);

  /* =========================================================
     신규 시공
  ========================================================= */

  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);
  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  /* =========================================================
     시공 DB
  ========================================================= */

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsMessage, setJobsMessage] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [jobSearchApplied, setJobSearchApplied] = useState("");
  const [jobPage, setJobPage] = useState(1);
  const [jobTotal, setJobTotal] = useState(0);
  const [openJobId, setOpenJobId] = useState(null);

  const [jobPhotos, setJobPhotos] = useState({});
  const [jobPhotoLoadingId, setJobPhotoLoadingId] = useState(null);
  const [jobPhotoUrls, setJobPhotoUrls] = useState({});
  const [loadingPhotoId, setLoadingPhotoId] = useState(null);

  /* =========================================================
     시공 수정
  ========================================================= */

  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editMemo, setEditMemo] = useState("");

  /* =========================================================
     사진 수정
  ========================================================= */

  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editPhotoType, setEditPhotoType] = useState("before");
  const [editPhotoCategory, setEditPhotoCategory] = useState("");
  const [editPhotoSubCategory, setEditPhotoSubCategory] = useState("");
  const [editPhotoDescription, setEditPhotoDescription] = useState("");
  const [photoEditLoading, setPhotoEditLoading] = useState(false);

  /* =========================================================
     고객 상담
  ========================================================= */

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
     최종 견적
  ========================================================= */

  const [quoteEditingLeadId, setQuoteEditingLeadId] = useState(null);
  const [quoteFinalPrice, setQuoteFinalPrice] = useState("");
  const [quoteWorkDetails, setQuoteWorkDetails] = useState("");
  const [quoteMaterial, setQuoteMaterial] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [quoteSaving, setQuoteSaving] = useState(false);
  const [quoteImage, setQuoteImage] = useState(null);
  const [quoteImageLeadId, setQuoteImageLeadId] = useState(null);

  /* =========================================================
     HASH 복구
  ========================================================= */

  const [hashRepairRunning, setHashRepairRunning] = useState(false);
  const [hashRepairProgress, setHashRepairProgress] = useState(null);
  const [hashRepairMessage, setHashRepairMessage] = useState("");

  /* =========================================================
     스타일
  ========================================================= */

  const inputStyle = {
    width: "100%",
    padding: "14px",
    fontSize: "16px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    boxSizing: "border-box",
    background: "#fff",
    color: "#111827",
  };

  const sectionStyle = {
    padding: "18px",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    background: "#fff",
    marginBottom: "18px",
  };

  const primaryButtonStyle = {
    width: "100%",
    padding: "13px",
    border: "none",
    borderRadius: "10px",
    background: "#111827",
    color: "#fff",
    fontWeight: "bold",
    fontSize: "15px",
    cursor: "pointer",
  };

  const secondaryButtonStyle = {
    width: "100%",
    padding: "11px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#fff",
    color: "#111827",
    fontWeight: "bold",
    cursor: "pointer",
  };

  /* =========================================================
     공통
  ========================================================= */

  function formatWon(value) {
    if (value === null || value === undefined || value === "") return "-";
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

  function sanitizeSearchKeyword(value) {
    return String(value || "").replace(/[,()]/g, " ").trim();
  }

  function getLeadPhotoPaths(lead) {
    const paths = [];

    if (Array.isArray(lead?.customer_photo_paths)) {
      for (const path of lead.customer_photo_paths) {
        if (path && !paths.includes(path)) paths.push(path);
      }
    }

    if (
      lead?.customer_photo_path &&
      !paths.includes(lead.customer_photo_path)
    ) {
      paths.push(lead.customer_photo_path);
    }

    return paths;
  }

  function changeTab(tab) {
    activeTabRef.current = tab;
    setActiveTab(tab);

    if (tab === "leads") {
      loadLeads(1, leadFilter);
    }
  }

  /* =========================================================
     초기 실행
  ========================================================= */

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
        (payload) => handleRealtimeLead(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  /* =========================================================
     실시간 상담
  ========================================================= */

  function handleRealtimeLead(lead) {
    setUnreadCount((n) => n + 1);

    setNewLeadAlert({
      id: lead.id,
      customer_name: lead.customer_name,
      phone: lead.phone,
      region: lead.region,
      created_at: lead.created_at,
    });

    if (typeof document !== "undefined") {
      document.title = "🔴 신규 상담 | 기분좋은공간";
    }

    try {
      navigator.vibrate?.([250, 120, 250]);
    } catch {}

    try {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification("🔔 신규 상담이 들어왔습니다.", {
          body: `${lead.customer_name || "고객"} ${lead.phone || ""}`,
        });
      }
    } catch {}

    if (activeTabRef.current === "leads") {
      loadLeads(1, leadFilter);
    }
  }

  /* =========================================================
     알림
  ========================================================= */

  async function enableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
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

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!publicKey) {
        throw new Error("VAPID 공개키가 설정되지 않았습니다.");
      }

      const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);

      const base64 = (publicKey + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      const rawData = window.atob(base64);
      const applicationServerKey = new Uint8Array(rawData.length);

      for (let i = 0; i < rawData.length; i++) {
        applicationServerKey[i] = rawData.charCodeAt(i);
      }

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const json = subscription.toJSON();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("관리자 로그인 정보를 확인할 수 없습니다.");
      }

      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );

      if (error) throw error;

      setNotificationEnabled(true);

      await registration.showNotification("기분좋은공간", {
        body: "이 휴대폰에 신규 상담 알림이 등록되었습니다.",
        tag: "push-registration",
        data: { url: "/admin" },
      });
    } catch (error) {
      console.error(error);
      setNotificationEnabled(false);
      alert(`푸시 알림 등록 오류: ${error?.message || "실패"}`);
    }
  }

  /* =========================================================
     AI 설정
  ========================================================= */

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
        setSimilarityThreshold(Number(data.similarity_threshold));
      }
    } catch (error) {
      console.error("설정 불러오기:", error);
    }
  }

  async function saveSimilaritySetting() {
    setSettingLoading(true);
    setSettingMessage("");

    try {
      const { error } = await supabase
        .from("app_settings")
        .update({
          similarity_threshold: Number(similarityThreshold),
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;

      setSettingMessage(
        `✅ AI 유사도 기준 ${Math.round(
          Number(similarityThreshold) * 100
        )}% 저장 완료`
      );
    } catch (error) {
      setSettingMessage(`❌ 설정 저장 오류: ${error?.message || "실패"}`);
    } finally {
      setSettingLoading(false);
    }
  }

  /* =========================================================
     시공 DB
  ========================================================= */

  async function loadJobs(page = 1, keyword = jobSearchApplied) {
    setJobsLoading(true);
    setJobsMessage("");

    try {
      const from = (page - 1) * JOB_PAGE_SIZE;
      const to = from + JOB_PAGE_SIZE - 1;
      const safeKeyword = sanitizeSearchKeyword(keyword);

      let query = supabase.from("work_items").select(
        "id,project_id,category,sub_category,actual_cost,memo,created_at",
        { count: "exact" }
      );

      if (safeKeyword) {
        query = query.or(
          `category.ilike.%${safeKeyword}%,sub_category.ilike.%${safeKeyword}%,memo.ilike.%${safeKeyword}%`
        );
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      setJobs(data || []);
      setJobTotal(count || 0);
      setJobPage(page);
      setOpenJobId(null);
    } catch (error) {
      console.error(error);
      setJobsMessage(`❌ 시공 DB 오류: ${error?.message || "불러오기 실패"}`);
    } finally {
      setJobsLoading(false);
    }
  }

  function searchJobs() {
    const keyword = sanitizeSearchKeyword(jobSearch);
    setJobSearchApplied(keyword);
    loadJobs(1, keyword);
  }

  function clearJobSearch() {
    setJobSearch("");
    setJobSearchApplied("");
    loadJobs(1, "");
  }

  async function loadJobPhotos(workItemId) {
    setJobPhotoLoadingId(workItemId);

    try {
      const { data, error } = await supabase
        .from("work_photos")
        .select(
          "id,work_item_id,project_id,photo_type,category,sub_category,storage_path,ai_description,ai_tags,created_at"
        )
        .eq("work_item_id", workItemId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setJobPhotos((current) => ({
        ...current,
        [workItemId]: data || [],
      }));
    } catch (error) {
      console.error(error);
      setJobsMessage(
        `❌ 사진정보 불러오기 오류: ${error?.message || "실패"}`
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

  async function loadSingleJobPhoto(photo) {
    if (!photo?.id) return null;
    if (jobPhotoUrls[photo.id]) return jobPhotoUrls[photo.id];

    if (!photo.storage_path) {
      setJobsMessage("⚠️ 사진 저장경로가 없습니다.");
      return null;
    }

    setLoadingPhotoId(photo.id);

    try {
      const { data, error } = await supabase.storage
        .from("work-photos")
        .createSignedUrl(photo.storage_path, SIGNED_URL_SECONDS);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("사진 주소를 만들 수 없습니다.");

      setJobPhotoUrls((current) => ({
        ...current,
        [photo.id]: data.signedUrl,
      }));

      return data.signedUrl;
    } catch (error) {
      console.error(error);
      setJobsMessage(`❌ 사진 오류: ${error?.message || "불러오기 실패"}`);
      return null;
    } finally {
      setLoadingPhotoId(null);
    }
  }

  async function openJobPhotoPreview(photo) {
    let url = jobPhotoUrls[photo.id];

    if (!url) url = await loadSingleJobPhoto(photo);
    if (url) setPreviewPhoto(url);
  }

  /* =========================================================
     시공 수정
  ========================================================= */

  function startEdit(job) {
    setEditingId(job.id);
    setEditCategory(job.category || "");
    setEditSubCategory(job.sub_category || job.category || "");
    setEditCost(
      job.actual_cost !== null && job.actual_cost !== undefined
        ? String(job.actual_cost)
        : ""
    );
    setEditMemo(job.memo || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveJobEdit(jobId) {
    const cost = Number(String(editCost).replace(/,/g, ""));

    if (!editCategory.trim()) {
      setJobsMessage("⚠️ 시공 부위를 입력해주세요.");
      return;
    }

    if (!Number.isFinite(cost) || cost <= 0) {
      setJobsMessage("⚠️ 실제 시공금액을 입력해주세요.");
      return;
    }

    try {
      const { error } = await supabase
        .from("work_items")
        .update({
          category: editCategory.trim(),
          sub_category: editSubCategory.trim() || editCategory.trim(),
          actual_cost: cost,
          memo: editMemo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (error) throw error;

      setEditingId(null);
      setJobsMessage("✅ 시공 데이터가 수정되었습니다.");
      await loadJobs(jobPage, jobSearchApplied);
    } catch (error) {
      console.error(error);
      setJobsMessage(`❌ 수정 오류: ${error?.message || "실패"}`);
    }
  }

  /* =========================================================
     임베딩
  ========================================================= */

  async function createEmbedding(text) {
    if (!String(text || "").trim()) return null;

    const response = await fetch("/api/embedding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error || "임베딩 생성 실패");
    }

    return result.embedding || null;
  }

  /* =========================================================
     사진 수정
  ========================================================= */

  function startPhotoEdit(photo) {
    setEditingPhotoId(photo.id);
    setEditPhotoType(photo.photo_type || "before");
    setEditPhotoCategory(photo.category || "");
    setEditPhotoSubCategory(photo.sub_category || photo.category || "");
    setEditPhotoDescription(photo.ai_description || "");
  }

  function cancelPhotoEdit() {
    setEditingPhotoId(null);
  }

  async function savePhotoEdit(photo) {
    if (!editPhotoCategory.trim()) {
      setJobsMessage("⚠️ 사진 카테고리를 입력해주세요.");
      return;
    }

    setPhotoEditLoading(true);

    try {
      let tags = Array.isArray(photo.ai_tags) ? [...photo.ai_tags] : [];

      tags = tags.filter(
        (tag) =>
          tag !== "시공전" &&
          tag !== "시공후" &&
          tag !== "전후비교"
      );

      if (editPhotoType === "before") tags.push("시공전");
      if (editPhotoType === "after") tags.push("시공후");

      tags = [...new Set(tags)];

      const searchText = [
        `시공 부위: ${editPhotoCategory.trim()}`,
        `세부 부위: ${
          editPhotoSubCategory.trim() || editPhotoCategory.trim()
        }`,
        `사진 상태: ${
          editPhotoType === "before" ? "시공 전" : "시공 후"
        }`,
        `사진 설명: ${editPhotoDescription.trim()}`,
        `특징: ${tags.join(", ")}`,
      ].join("\n");

      const embedding = await createEmbedding(searchText);

      const { error } = await supabase
        .from("work_photos")
        .update({
          photo_type: editPhotoType,
          category: editPhotoCategory.trim(),
          sub_category:
            editPhotoSubCategory.trim() || editPhotoCategory.trim(),
          ai_description: editPhotoDescription.trim(),
          ai_tags: tags,
          embedding,
        })
        .eq("id", photo.id);

      if (error) throw error;

      setEditingPhotoId(null);
      setJobsMessage("✅ 사진 정보가 수정되었습니다.");
      await loadJobPhotos(photo.work_item_id);
    } catch (error) {
      console.error(error);
      setJobsMessage(`❌ 사진 수정 오류: ${error?.message || "실패"}`);
    } finally {
      setPhotoEditLoading(false);
    }
  }

  async function deletePhoto(photo) {
    if (!window.confirm("이 사진을 완전히 삭제하시겠습니까?")) return;

    try {
      if (photo.storage_path) {
        const { error: storageError } = await supabase.storage
          .from("work-photos")
          .remove([photo.storage_path]);

        if (storageError) console.error(storageError);
      }

      const { error } = await supabase
        .from("work_photos")
        .delete()
        .eq("id", photo.id);

      if (error) throw error;

      setJobPhotos((current) => ({
        ...current,
        [photo.work_item_id]: (current[photo.work_item_id] || []).filter(
          (item) => item.id !== photo.id
        ),
      }));

      setJobPhotoUrls((current) => {
        const next = { ...current };
        delete next[photo.id];
        return next;
      });

      setJobsMessage("✅ 사진이 삭제되었습니다.");
    } catch (error) {
      console.error(error);
      setJobsMessage(`❌ 사진 삭제 오류: ${error?.message || "실패"}`);
    }
  }

  async function deleteJob(job) {
    if (
      !window.confirm(
        "이 시공건과 연결된 모든 사진까지 완전히 삭제하시겠습니까?"
      )
    ) {
      return;
    }

    try {
      const { data: photos, error: photoLoadError } = await supabase
        .from("work_photos")
        .select("id,storage_path")
        .eq("work_item_id", job.id);

      if (photoLoadError) throw photoLoadError;

      const paths = (photos || [])
        .map((photo) => photo.storage_path)
        .filter(Boolean);

      if (paths.length) {
        const { error: storageError } = await supabase.storage
          .from("work-photos")
          .remove(paths);

        if (storageError) console.error("Storage 삭제:", storageError);
      }

      const { error: photosDeleteError } = await supabase
        .from("work_photos")
        .delete()
        .eq("work_item_id", job.id);

      if (photosDeleteError) throw photosDeleteError;

      const { error } = await supabase
        .from("work_items")
        .delete()
        .eq("id", job.id);

      if (error) throw error;

      setOpenJobId(null);

      setJobPhotos((current) => {
        const next = { ...current };
        delete next[job.id];
        return next;
      });

      if (photos?.length) {
        const ids = new Set(photos.map((photo) => photo.id));

        setJobPhotoUrls((current) => {
          const next = { ...current };
          ids.forEach((id) => delete next[id]);
          return next;
        });
      }

      setJobsMessage("✅ 시공건이 삭제되었습니다.");

      const targetPage =
        jobs.length === 1 && jobPage > 1 ? jobPage - 1 : jobPage;

      await loadJobs(targetPage, jobSearchApplied);
    } catch (error) {
      console.error(error);
      setJobsMessage(`❌ 시공 삭제 오류: ${error?.message || "실패"}`);
    }
  }

  /* =========================================================
     HASH
  ========================================================= */

  async function getImageHash(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);

    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function startHashRepair() {
    if (hashRepairRunning) return;

    const ok = window.confirm(
      "기존 사진의 중복검사용 HASH를 생성합니다.\n\n사진 자체는 삭제하거나 변경하지 않습니다.\n완료될 때까지 관리자 화면을 열어두세요."
    );

    if (!ok) return;

    setHashRepairRunning(true);
    setHashRepairMessage("기존 사진 HASH 복구를 시작합니다...");

    try {
      while (true) {
        const response = await fetch(
          `/api/repair-image-hashes?t=${Date.now()}`,
          { method: "GET", cache: "no-store" }
        );

        let result;

        try {
          result = await response.json();
        } catch {
          throw new Error(`서버 응답 오류 (${response.status})`);
        }

        if (!response.ok || !result?.success) {
          throw new Error(
            result?.error || `HASH 복구 요청 실패 (${response.status})`
          );
        }

        const total = Number(result.total || 0);
        const completed = Number(result.completed || 0);
        const remaining = Number(result.remaining || 0);
        const processed = Number(result.processed || 0);
        const failed = Number(result.failed || 0);

        const percent =
          total > 0 ? Math.round((completed / total) * 100) : 0;

        setHashRepairProgress({
          ...result,
          total,
          completed,
          remaining,
          processed,
          failed,
          progress: `${percent}%`,
        });

        setHashRepairMessage(
          `처리 중 ${completed.toLocaleString()} / ${total.toLocaleString()}장 (${percent}%)\n남은 사진 ${remaining.toLocaleString()}장`
        );

        if (failed > 0) {
          throw new Error(
            `${failed}장의 HASH 생성에 실패했습니다. 다시 실행하면 남은 사진부터 계속됩니다.`
          );
        }

        if (result.finished || remaining === 0) {
          setHashRepairMessage(
            "✅ 기존 사진 HASH 복구가 모두 완료되었습니다.\n이제 기존 사진 전체를 대상으로 중복검사가 가능합니다."
          );
          break;
        }

        if (processed === 0) {
          throw new Error(
            "처리 가능한 사진이 없습니다. Storage 경로가 없는 기존 데이터가 있는지 확인이 필요합니다."
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error("HASH 자동 복구:", error);

      setHashRepairMessage(
        `⚠️ HASH 복구가 중간에 멈췄습니다.\n${
          error?.message || "알 수 없는 오류"
        }\n\n버튼을 다시 누르면 남은 사진부터 이어서 처리합니다.`
      );
    } finally {
      setHashRepairRunning(false);
    }
  }

  /* =========================================================
     이미지 압축
  ========================================================= */

  async function resizeImage(file, maxSize = 1200, quality = 0.7) {
    let bitmap = null;

    try {
      if ("createImageBitmap" in window) {
        bitmap = await createImageBitmap(file);
      }
    } catch {
      bitmap = null;
    }

    if (bitmap) {
      try {
        let width = bitmap.width;
        let height = bitmap.height;
        const longest = Math.max(width, height);

        if (longest > maxSize) {
          const ratio = maxSize / longest;
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { alpha: false });

        if (!ctx) {
          throw new Error("이미지 변환 기능을 사용할 수 없습니다.");
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);

        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (result) =>
              result
                ? resolve(result)
                : reject(new Error("이미지 변환 실패")),
            "image/jpeg",
            quality
          );
        });

        bitmap.close?.();

        return new File(
          [blob],
          `${String(file.name || "photo").replace(/\.[^.]+$/, "")}.jpg`,
          { type: "image/jpeg" }
        );
      } catch (error) {
        bitmap.close?.();
        throw error;
      }
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          let width = image.naturalWidth || image.width;
          let height = image.naturalHeight || image.height;
          const longest = Math.max(width, height);

          if (longest > maxSize) {
            const ratio = maxSize / longest;
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d", { alpha: false });

          if (!ctx) {
            reject(new Error("이미지 변환 기능을 사용할 수 없습니다."));
            return;
          }

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(image, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("이미지 변환 실패"));
                return;
              }

              resolve(
                new File(
                  [blob],
                  `${String(file.name || "photo").replace(
                    /\.[^.]+$/,
                    ""
                  )}.jpg`,
                  { type: "image/jpeg" }
                )
              );
            },
            "image/jpeg",
            quality
          );
        };

        image.onerror = () =>
          reject(
            new Error("선택한 사진을 브라우저에서 불러오지 못했습니다.")
          );

        image.src = reader.result;
      };

      reader.onerror = () =>
        reject(new Error("사진 파일을 읽지 못했습니다."));

      reader.readAsDataURL(file);
    });
  }

  /* =========================================================
     AI 사진 분석
  ========================================================= */

  async function analyzeImage(file) {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    let result = {};

    try {
      result = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(
        result?.error ||
          result?.message ||
          "AI 사진 분석에 실패했습니다."
      );
    }

    return {
      category:
        result?.category ||
        result?.analysis?.category ||
        "",
      sub_category:
        result?.sub_category ||
        result?.subcategory ||
        result?.analysis?.sub_category ||
        result?.analysis?.subcategory ||
        "",
      description:
        result?.description ||
        result?.ai_description ||
        result?.analysis?.description ||
        "",
      tags: Array.isArray(result?.tags)
        ? result.tags
        : Array.isArray(result?.ai_tags)
        ? result.ai_tags
        : Array.isArray(result?.analysis?.tags)
        ? result.analysis.tags
        : [],
    };
  }

  /* =========================================================
     시공 사진 저장
     중요:
     압축 → HASH → 중복검사 → AI → 저장
  ========================================================= */

  async function savePhoto({
    file,
    workItemId,
    projectId,
    photoType,
    fallbackCategory,
    fallbackSubCategory,
  }) {
    // 기존 HASH 복구와 동일하게
    // 실제 Storage에 저장될 압축 파일을 기준으로 HASH 생성
    const compressed = await resizeImage(file, 1200, 0.7);
    const storedFileHash = await getImageHash(compressed);

    const { data: duplicate, error: duplicateError } = await supabase
      .from("work_photos")
      .select("id,photo_type")
      .eq("image_hash", storedFileHash)
      .limit(1);

    if (duplicateError) throw duplicateError;

    if (duplicate?.length) {
      return {
        skipped: true,
        reason: "duplicate",
      };
    }

    let analysis = {
      category: "",
      sub_category: "",
      description: "",
      tags: [],
    };

    try {
      analysis = await analyzeImage(compressed);
    } catch (error) {
      console.error("AI 분석 오류:", error);
    }

    const finalCategory =
      String(fallbackCategory || analysis.category || "기타").trim() ||
      "기타";

    const finalSubCategory =
      String(
        fallbackSubCategory ||
          analysis.sub_category ||
          finalCategory
      ).trim() || finalCategory;

    let tags = Array.isArray(analysis.tags)
      ? analysis.tags.filter(Boolean)
      : [];

    if (photoType === "before") tags.push("시공전");
    if (photoType === "after") tags.push("시공후");

    tags = [...new Set(tags)];

    const description = String(analysis.description || "").trim();

    const searchText = [
      `시공 부위: ${finalCategory}`,
      `세부 부위: ${finalSubCategory}`,
      `사진 상태: ${
        photoType === "before"
          ? "시공 전"
          : photoType === "after"
          ? "시공 후"
          : "시공 사진"
      }`,
      `사진 설명: ${description}`,
      `특징: ${tags.join(", ")}`,
    ].join("\n");

    let embedding = null;

    try {
      embedding = await createEmbedding(searchText);
    } catch (error) {
      console.error("임베딩 생성 오류:", error);
    }

    const storagePath =
      `history/${Date.now()}-${crypto.randomUUID()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("work-photos")
      .upload(storagePath, compressed, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    try {
      const { data: publicUrlData } = supabase.storage
        .from("work-photos")
        .getPublicUrl(storagePath);

      const photoUrl = publicUrlData?.publicUrl || storagePath;

      const { data: inserted, error: insertError } = await supabase
        .from("work_photos")
        .insert({
          project_id: projectId,
          work_item_id: workItemId,
          photo_url: photoUrl,
          storage_path: storagePath,
          photo_type: photoType,
          category: finalCategory,
          sub_category: finalSubCategory,
          ai_description: description,
          ai_tags: tags,
          embedding,
          image_hash: storedFileHash,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      return {
        skipped: false,
        id: inserted?.id,
        category: finalCategory,
        sub_category: finalSubCategory,
        description,
        tags,
        storage_path: storagePath,
      };
    } catch (error) {
      try {
        await supabase.storage.from("work-photos").remove([storagePath]);
      } catch {}

      throw error;
    }
  }

  /* =========================================================
     시공 등록
  ========================================================= */

  async function registerJob() {
    if (!category.trim()) {
      setMessage("⚠️ 시공 부위를 입력해주세요.");
      return;
    }

    const cost = Number(String(actualCost).replace(/,/g, ""));

    if (!Number.isFinite(cost) || cost <= 0) {
      setMessage("⚠️ 실제 시공금액을 입력해주세요.");
      return;
    }

    if (beforeImages.length === 0 && afterImages.length === 0) {
      setMessage(
        "⚠️ 시공 전 또는 시공 후 사진을 1장 이상 선택해주세요."
      );
      return;
    }

    setLoading(true);
    setMessage("사진 압축 + 중복검사 + AI 분석 + 저장 중입니다...");

    let createdWorkItemId = null;

    try {
      // 현재 work_items에 material 전용 컬럼이 확인되지 않아
      // 자재는 메모와 함께 보존
      const combinedMemo = [
        material.trim() ? `사용 자재: ${material.trim()}` : "",
        memo.trim(),
      ]
        .filter(Boolean)
        .join("\n");

      const { data: workItem, error: itemError } = await supabase
        .from("work_items")
        .insert({
          project_id: PROJECT_ID,
          category: category.trim(),
          sub_category: category.trim(),
          quantity: 1,
          difficulty: 3,
          actual_cost: cost,
          memo: combinedMemo || null,
        })
        .select("id")
        .single();

      if (itemError) throw itemError;

      createdWorkItemId = workItem.id;

      let savedCount = 0;
      let duplicateCount = 0;

      const selectedFiles = [
        ...beforeImages.map((file) => ({
          file,
          photoType: "before",
        })),
        ...afterImages.map((file) => ({
          file,
          photoType: "after",
        })),
      ];

      for (let i = 0; i < selectedFiles.length; i++) {
        const item = selectedFiles[i];

        setMessage(
          `사진 ${i + 1}/${selectedFiles.length} 처리 중...\n압축 + 중복검사 + AI 분석`
        );

        const result = await savePhoto({
          file: item.file,
          workItemId: workItem.id,
          projectId: PROJECT_ID,
          photoType: item.photoType,
          fallbackCategory: category.trim(),
          fallbackSubCategory: category.trim(),
        });

        if (result?.skipped) {
          duplicateCount++;
        } else {
          savedCount++;
        }
      }

      if (savedCount === 0) {
        await supabase
          .from("work_items")
          .delete()
          .eq("id", workItem.id);

        createdWorkItemId = null;

        setMessage(
          "⚠️ 선택한 사진이 모두 이미 등록된 사진입니다.\n새 시공건은 저장하지 않았습니다."
        );

        return;
      }

      setBeforeImages([]);
      setAfterImages([]);
      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");

      setMessage(
        duplicateCount > 0
          ? `✅ 저장 완료!\n${savedCount}장 저장 / 중복 ${duplicateCount}장 제외`
          : `✅ 사진 ${savedCount}장 저장 + AI 분석 + DB 저장 완료!`
      );

      await loadJobs(1, "");
    } catch (error) {
      console.error(error);

      if (createdWorkItemId) {
        try {
          const { count } = await supabase
            .from("work_photos")
            .select("id", {
              count: "exact",
              head: true,
            })
            .eq("work_item_id", createdWorkItemId);

          if (!count) {
            await supabase
              .from("work_items")
              .delete()
              .eq("id", createdWorkItemId);
          }
        } catch {}
      }

      setMessage(`❌ 오류: ${error?.message || "저장에 실패했습니다."}`);
    } finally {
      setLoading(false);
    }
  }

  function handleBeforeFiles(event) {
    const files = Array.from(event.target.files || []);
    setBeforeImages(files);
    event.target.value = "";
  }

  function handleAfterFiles(event) {
    const files = Array.from(event.target.files || []);
    setAfterImages(files);
    event.target.value = "";
  }

  /* =========================================================
     고객 상담
  ========================================================= */

  async function loadUnreadCount() {
    try {
      const { count, error } = await supabase
        .from("customer_leads")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("is_read", false);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (error) {
      console.error("미확인 상담:", error);
    }
  }

  async function loadLeads(page = 1, filter = leadFilter) {
    setLeadsLoading(true);
    setLeadsMessage("");

    try {
      const from = (page - 1) * LEAD_PAGE_SIZE;
      const to = from + LEAD_PAGE_SIZE - 1;

      let query = supabase.from("customer_leads").select(
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
        created_at,
        final_price,
        quote_work_details,
        quote_material,
        quote_note,
        quote_created_at
        `,
        { count: "exact" }
      );

      if (filter === "unread") query = query.eq("is_read", false);
      if (filter === "read") query = query.eq("is_read", true);

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      setLeads(data || []);
      setLeadTotal(count || 0);
      setLeadPage(page);
      setOpenLeadId(null);

      await loadUnreadCount();
    } catch (error) {
      console.error(error);
      setLeadsMessage(
        `❌ 상담목록 오류: ${error?.message || "불러오기 실패"}`
      );
    } finally {
      setLeadsLoading(false);
    }
  }

  async function markLeadRead(lead) {
    if (!lead || lead.is_read) return;

    try {
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("customer_leads")
        .update({
          is_read: true,
          read_at: now,
        })
        .eq("id", lead.id);

      if (error) throw error;

      setLeads((current) =>
        current.map((item) =>
          item.id === lead.id
            ? {
                ...item,
                is_read: true,
                read_at: now,
              }
            : item
        )
      );

      setUnreadCount((current) => Math.max(0, current - 1));

      if (typeof document !== "undefined") {
        document.title = "기분좋은공간 관리자";
      }
    } catch (error) {
      console.error("읽음 처리 오류:", error);
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

      setUnreadCount((n) => n + 1);
    } catch (error) {
      console.error(error);
      setLeadsMessage(`❌ 미확인 처리 오류: ${error?.message || "실패"}`);
    }
  }

  async function toggleLeadRead(lead) {
    if (lead.is_read) {
      await markLeadUnread(lead.id);
    } else {
      await markLeadRead(lead);
    }
  }

  async function openLeadDetail(lead) {
    if (openLeadId === lead.id) {
      setOpenLeadId(null);
      return;
    }

    setOpenLeadId(lead.id);

    // 상세를 열어도 사진은 자동 다운로드하지 않음
    await markLeadRead(lead);
  }

  async function updateLeadStatus(leadId, status) {
    try {
      const { error } = await supabase
        .from("customer_leads")
        .update({ status })
        .eq("id", leadId);

      if (error) throw error;

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId ? { ...lead, status } : lead
        )
      );

      setLeadsMessage("✅ 상담 상태가 변경되었습니다.");
    } catch (error) {
      console.error(error);
      setLeadsMessage(`❌ 상태 변경 오류: ${error?.message || "실패"}`);
    }
  }

  async function saveLeadMemo(leadId, value) {
    try {
      const memoValue = String(value || "").trim();

      const { error } = await supabase
        .from("customer_leads")
        .update({
          memo: memoValue || null,
        })
        .eq("id", leadId);

      if (error) throw error;

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                memo: memoValue || null,
              }
            : lead
        )
      );

      setLeadsMessage("✅ 상담 메모가 저장되었습니다.");
    } catch (error) {
      console.error(error);
      setLeadsMessage(`❌ 메모 저장 오류: ${error?.message || "실패"}`);
    }
  }

  async function loadSingleLeadPhoto(lead, path, index) {
    if (!path) return null;

    const key = `${lead.id}:${index}`;

    if (leadPhotoUrls[key]) return leadPhotoUrls[key];

    setLeadPhotoLoadingId(key);

    try {
      const { data, error } = await supabase.storage
        .from("work-photos")
        .createSignedUrl(path, SIGNED_URL_SECONDS);

      if (error) throw error;

      const url = data?.signedUrl || null;

      if (!url) throw new Error("사진 주소를 만들 수 없습니다.");

      setLeadPhotoUrls((current) => ({
        ...current,
        [key]: url,
      }));

      return url;
    } catch (error) {
      console.error(error);
      setLeadsMessage(`❌ 고객사진 오류: ${error?.message || "실패"}`);
      return null;
    } finally {
      setLeadPhotoLoadingId(null);
    }
  }

  async function openLeadPhotoPreview(lead, path, index) {
    const key = `${lead.id}:${index}`;

    let url = leadPhotoUrls[key] || null;

    if (!url) {
      url = await loadSingleLeadPhoto(lead, path, index);
    }

    if (url) setPreviewPhoto(url);
  }

  async function deleteLead(lead) {
    const ok = window.confirm(
      `${lead.customer_name || "고객"} 상담을 삭제하시겠습니까?\n고객사진도 함께 삭제됩니다.`
    );

    if (!ok) return;

    try {
      const paths = getLeadPhotoPaths(lead);

      if (paths.length) {
        const { error: storageError } = await supabase.storage
          .from("work-photos")
          .remove(paths);

        if (storageError) console.error("고객사진 삭제:", storageError);
      }

      const { error } = await supabase
        .from("customer_leads")
        .delete()
        .eq("id", lead.id);

      if (error) throw error;

      setOpenLeadId(null);

      setLeadPhotoUrls((current) => {
        const next = {};

        for (const [key, value] of Object.entries(current)) {
          if (!key.startsWith(`${lead.id}:`)) {
            next[key] = value;
          }
        }

        return next;
      });

      if (!lead.is_read) {
        setUnreadCount((n) => Math.max(0, n - 1));
      }

      setLeadsMessage("✅ 고객 상담이 삭제되었습니다.");

      const targetPage =
        leads.length === 1 && leadPage > 1 ? leadPage - 1 : leadPage;

      await loadLeads(targetPage, leadFilter);
    } catch (error) {
      console.error(error);
      setLeadsMessage(`❌ 상담 삭제 오류: ${error?.message || "실패"}`);
    }
  }

  /* =========================================================
     최종 견적
  ========================================================= */

  function startQuoteEdit(lead) {
    setQuoteEditingLeadId(lead.id);

    setQuoteFinalPrice(
      lead.final_price !== null && lead.final_price !== undefined
        ? String(lead.final_price)
        : lead.estimate_average !== null &&
          lead.estimate_average !== undefined
        ? String(lead.estimate_average)
        : ""
    );

    setQuoteWorkDetails(
      lead.quote_work_details || lead.ai_description || ""
    );

    setQuoteMaterial(lead.quote_material || "");
    setQuoteNote(lead.quote_note || "");
    setQuoteImage(null);
    setQuoteImageLeadId(null);
  }

  function cancelQuoteEdit() {
    setQuoteEditingLeadId(null);
    setQuoteImage(null);
    setQuoteImageLeadId(null);
  }

  async function saveFinalQuote(lead) {
    const price = Number(String(quoteFinalPrice).replace(/,/g, ""));

    if (!Number.isFinite(price) || price <= 0) {
      setLeadsMessage("⚠️ 최종 견적금액을 입력해주세요.");
      return;
    }

    setQuoteSaving(true);

    try {
      const now = new Date().toISOString();

      const payload = {
        final_price: price,
        quote_work_details: quoteWorkDetails.trim() || null,
        quote_material: quoteMaterial.trim() || null,
        quote_note: quoteNote.trim() || null,
        quote_created_at: now,
      };

      const { error } = await supabase
        .from("customer_leads")
        .update(payload)
        .eq("id", lead.id);

      if (error) throw error;

      setLeads((current) =>
        current.map((item) =>
          item.id === lead.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      setLeadsMessage("✅ 최종 견적이 저장되었습니다.");
    } catch (error) {
      console.error(error);
      setLeadsMessage(
        `❌ 최종 견적 저장 오류: ${error?.message || "실패"}`
      );
    } finally {
      setQuoteSaving(false);
    }
  }

  /* =========================================================
     견적 이미지
  ========================================================= */

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const source = String(text || "-");
    const paragraphs = source.split("\n");
    let currentY = y;

    for (const paragraph of paragraphs) {
      const chars = Array.from(paragraph || " ");
      let line = "";

      for (let i = 0; i < chars.length; i++) {
        const test = line + chars[i];

        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, currentY);
          line = chars[i];
          currentY += lineHeight;
        } else {
          line = test;
        }
      }

      if (line) {
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
      }
    }

    return currentY;
  }

  function generateQuoteImage(lead) {
    const price = Number(
      String(quoteFinalPrice || lead.final_price || 0).replace(/,/g, "")
    );

    if (!Number.isFinite(price) || price <= 0) {
      setLeadsMessage("⚠️ 최종 견적금액을 먼저 입력해주세요.");
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1450;

      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("견적 이미지를 만들 수 없습니다.");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#4b3621";
      ctx.fillRect(0, 0, 1080, 190);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 58px sans-serif";
      ctx.fillText("기분좋은공간", 70, 90);

      ctx.font = "30px sans-serif";
      ctx.fillText("인테리어필름 최종 견적서", 70, 145);

      ctx.fillStyle = "#111827";
      ctx.font = "bold 34px sans-serif";

      let y = 255;

      ctx.fillText("고객 정보", 70, y);

      y += 60;
      ctx.font = "28px sans-serif";
      ctx.fillText(`고객명 : ${lead.customer_name || "-"}`, 70, y);

      y += 48;
      ctx.fillText(`연락처 : ${lead.phone || "-"}`, 70, y);

      y += 48;
      ctx.fillText(`지역 : ${lead.region || "-"}`, 70, y);

      y += 75;

      ctx.strokeStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.moveTo(70, y);
      ctx.lineTo(1010, y);
      ctx.stroke();

      y += 65;

      ctx.fillStyle = "#111827";
      ctx.font = "bold 34px sans-serif";
      ctx.fillText("시공 내용", 70, y);

      y += 55;
      ctx.font = "28px sans-serif";

      y = wrapCanvasText(
        ctx,
        quoteWorkDetails ||
          lead.quote_work_details ||
          lead.ai_description ||
          "-",
        70,
        y,
        940,
        42
      );

      y += 35;
      ctx.font = "bold 34px sans-serif";
      ctx.fillText("필름 / 자재", 70, y);

      y += 55;
      ctx.font = "28px sans-serif";

      y = wrapCanvasText(
        ctx,
        quoteMaterial || lead.quote_material || "-",
        70,
        y,
        940,
        42
      );

      y += 40;

      ctx.fillStyle = "#f5f0e8";
      ctx.fillRect(60, y, 960, 150);

      ctx.fillStyle = "#4b3621";
      ctx.font = "bold 32px sans-serif";
      ctx.fillText("최종 견적금액", 90, y + 58);

      ctx.font = "bold 52px sans-serif";
      ctx.fillText(`${price.toLocaleString("ko-KR")}원`, 90, y + 120);

      y += 205;

      ctx.fillStyle = "#111827";
      ctx.font = "bold 34px sans-serif";
      ctx.fillText("안내사항", 70, y);

      y += 55;
      ctx.font = "27px sans-serif";

      wrapCanvasText(
        ctx,
        quoteNote ||
          lead.quote_note ||
          "현장 상태 및 추가 작업 발생 시 최종 금액이 달라질 수 있습니다.",
        70,
        y,
        940,
        40
      );

      ctx.fillStyle = "#6b7280";
      ctx.font = "24px sans-serif";
      ctx.fillText(
        `견적일 : ${new Date().toLocaleDateString("ko-KR")}`,
        70,
        1340
      );

      ctx.fillStyle = "#4b3621";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText("기분좋은공간 · 인테리어필름", 70, 1390);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);

      setQuoteImage(dataUrl);
      setQuoteImageLeadId(lead.id);

      setLeadsMessage(
        "✅ 견적 이미지가 생성되었습니다. 내용을 확인해주세요."
      );
    } catch (error) {
      console.error(error);
      setLeadsMessage(
        `❌ 견적 이미지 생성 오류: ${error?.message || "실패"}`
      );
    }
  }

  function downloadQuoteImage(lead) {
    if (!quoteImage) {
      setLeadsMessage("⚠️ 견적 이미지를 먼저 생성해주세요.");
      return;
    }

    const link = document.createElement("a");

    link.href = quoteImage;
    link.download = `기분좋은공간_견적서_${
      lead.customer_name || "고객"
    }.jpg`;

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function shareQuoteImage(lead) {
    if (!quoteImage) {
      setLeadsMessage("⚠️ 견적 이미지를 먼저 생성해주세요.");
      return;
    }

    try {
      const response = await fetch(quoteImage);
      const blob = await response.blob();

      const file = new File(
        [blob],
        `기분좋은공간_견적서_${lead.customer_name || "고객"}.jpg`,
        { type: "image/jpeg" }
      );

      if (
        navigator.share &&
        navigator.canShare?.({
          files: [file],
        })
      ) {
        await navigator.share({
          title: "기분좋은공간 견적서",
          text: `${lead.customer_name || "고객"}님 견적서입니다.`,
          files: [file],
        });

        return;
      }

      downloadQuoteImage(lead);

      setLeadsMessage(
        "ℹ️ 이 브라우저는 이미지 직접 공유를 지원하지 않아 견적 이미지를 저장했습니다."
      );
    } catch (error) {
      if (error?.name === "AbortError") return;

      console.error(error);

      setLeadsMessage(
        `❌ 견적 이미지 공유 오류: ${error?.message || "실패"}`
      );
    }
  }

  /* =========================================================
     PhotoCard
  ========================================================= */

  function PhotoCard({ photo }) {
    const url = jobPhotoUrls[photo.id];
    const editing = editingPhotoId === photo.id;

    return (
      <div
        style={{
          padding: "10px",
          border: "1px solid #e5e7eb",
          borderRadius: "10px",
          background: "#f9fafb",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <strong>
            {photo.photo_type === "before"
              ? "시공 전"
              : photo.photo_type === "after"
              ? "시공 후"
              : photo.photo_type || "사진"}
          </strong>

          <span
            style={{
              fontSize: "11px",
              color: "#6b7280",
            }}
          >
            {photo.category || "-"}
          </span>
        </div>

        {url ? (
          <img
            src={url}
            alt="시공사진"
            loading="lazy"
            decoding="async"
            onClick={() => setPreviewPhoto(url)}
            style={{
              width: "100%",
              maxHeight: "320px",
              objectFit: "cover",
              borderRadius: "9px",
              marginTop: "8px",
              cursor: "pointer",
            }}
          />
        ) : (
          <button
            type="button"
            disabled={loadingPhotoId === photo.id}
            onClick={() => openJobPhotoPreview(photo)}
            style={{
              ...secondaryButtonStyle,
              marginTop: "8px",
            }}
          >
            {loadingPhotoId === photo.id
              ? "사진 불러오는 중..."
              : "📷 사진 보기"}
          </button>
        )}

        {!editing ? (
          <>
            <div
              style={{
                marginTop: "8px",
                fontSize: "12px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              <strong>세부:</strong> {photo.sub_category || "-"}
              <br />
              <strong>AI:</strong> {photo.ai_description || "-"}
            </div>

            <button
              type="button"
              onClick={() => startPhotoEdit(photo)}
              style={{
                ...secondaryButtonStyle,
                marginTop: "7px",
              }}
            >
              사진정보 수정
            </button>

            <button
              type="button"
              onClick={() => deletePhoto(photo)}
              style={{
                ...secondaryButtonStyle,
                marginTop: "6px",
                color: "#dc2626",
              }}
            >
              사진 삭제
            </button>
          </>
        ) : (
          <div style={{ marginTop: "8px" }}>
            <select
              value={editPhotoType}
              onChange={(e) => setEditPhotoType(e.target.value)}
              style={{
                ...inputStyle,
                marginBottom: "6px",
              }}
            >
              <option value="before">시공 전</option>
              <option value="after">시공 후</option>
            </select>

            <input
              value={editPhotoCategory}
              onChange={(e) => setEditPhotoCategory(e.target.value)}
              placeholder="카테고리"
              style={{
                ...inputStyle,
                marginBottom: "6px",
              }}
            />

            <input
              value={editPhotoSubCategory}
              onChange={(e) => setEditPhotoSubCategory(e.target.value)}
              placeholder="세부 부위"
              style={{
                ...inputStyle,
                marginBottom: "6px",
              }}
            />

            <textarea
              value={editPhotoDescription}
              onChange={(e) => setEditPhotoDescription(e.target.value)}
              placeholder="AI 설명"
              rows={4}
              style={{
                ...inputStyle,
                marginBottom: "6px",
              }}
            />

            <button
              type="button"
              disabled={photoEditLoading}
              onClick={() => savePhotoEdit(photo)}
              style={primaryButtonStyle}
            >
              {photoEditLoading ? "저장 중..." : "사진정보 저장"}
            </button>

            <button
              type="button"
              onClick={cancelPhotoEdit}
              style={{
                ...secondaryButtonStyle,
                marginTop: "6px",
              }}
            >
              취소
            </button>
          </div>
        )}
      </div>
    );
  }

  /* =========================================================
     페이지
  ========================================================= */

  const jobTotalPages = Math.max(
    1,
    Math.ceil(jobTotal / JOB_PAGE_SIZE)
  );

  const leadTotalPages = Math.max(
    1,
    Math.ceil(leadTotal / LEAD_PAGE_SIZE)
  );

  /* =========================================================
     화면
  ========================================================= */

  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "16px",
        background: "#f3f4f6",
        minHeight: "100vh",
        color: "#111827",
      }}
    >
      <h1
        style={{
          fontSize: "25px",
          margin: "0 0 14px",
        }}
      >
        기분좋은공간 관리자
      </h1>

      {/* 탭 */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: "6px",
          marginBottom: "15px",
        }}
      >
        {[
          ["jobs", "시공 DB"],
          ["register", "시공 등록"],
          [
            "leads",
            unreadCount
              ? `고객 상담 (${unreadCount})`
              : "고객 상담",
          ],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => changeTab(tab)}
            style={{
              padding: "12px 5px",
              borderRadius: "9px",
              border: 0,
              fontWeight: "bold",
              background:
                activeTab === tab ? "#111827" : "#ffffff",
              color:
                activeTab === tab ? "#ffffff" : "#111827",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 신규 상담 */}

      {newLeadAlert && (
        <div
          style={{
            ...sectionStyle,
            background: "#fef2f2",
            borderColor: "#fecaca",
          }}
        >
          <strong>🔔 신규 상담이 들어왔습니다.</strong>

          <div
            style={{
              marginTop: "7px",
              fontSize: "13px",
            }}
          >
            {newLeadAlert.customer_name || "고객"} ·{" "}
            {newLeadAlert.phone || "-"}
          </div>

          <button
            type="button"
            onClick={() => {
              setNewLeadAlert(null);
              changeTab("leads");
            }}
            style={{
              ...primaryButtonStyle,
              marginTop: "10px",
              background: "#dc2626",
            }}
          >
            상담 확인
          </button>
        </div>
      )}

      {/* =====================================================
          시공 DB
      ===================================================== */}

      {activeTab === "jobs" && (
        <section style={sectionStyle}>
          <h2
            style={{
              marginTop: 0,
              fontSize: "20px",
            }}
          >
            🗂️ 시공 DB
          </h2>

          {/* HASH */}

          <div
            style={{
              padding: "13px",
              marginBottom: "14px",
              border: "1px solid #facc15",
              borderRadius: "12px",
              background: "#fefce8",
            }}
          >
            <strong>🔐 기존 사진 중복검사 준비</strong>

            <div
              style={{
                marginTop: "6px",
                color: "#713f12",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              기존 사진 중 HASH가 없는 사진만 처리합니다.
              <br />
              사진 자체는 삭제하거나 변경하지 않습니다.
            </div>

            {hashRepairProgress && (
              <div style={{ marginTop: "10px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    fontWeight: "bold",
                    marginBottom: "5px",
                  }}
                >
                  <span>
                    {hashRepairProgress.completed || 0} /{" "}
                    {hashRepairProgress.total || 0}장
                  </span>

                  <span>
                    {hashRepairProgress.progress || "0%"}
                  </span>
                </div>

                <div
                  style={{
                    width: "100%",
                    height: "12px",
                    borderRadius: "999px",
                    overflow: "hidden",
                    background: "#e5e7eb",
                  }}
                >
                  <div
                    style={{
                      width: hashRepairProgress.progress || "0%",
                      height: "100%",
                      background: "#16a34a",
                      transition: "width .3s ease",
                    }}
                  />
                </div>

                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "11px",
                    color: "#6b7280",
                  }}
                >
                  남은 사진: {hashRepairProgress.remaining || 0}장
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={hashRepairRunning}
              onClick={startHashRepair}
              style={{
                ...primaryButtonStyle,
                marginTop: "10px",
                background: hashRepairRunning
                  ? "#9ca3af"
                  : "#ca8a04",
              }}
            >
              {hashRepairRunning
                ? "HASH 복구 진행 중..."
                : "기존 사진 HASH 복구 시작"}
            </button>

            {hashRepairMessage && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px",
                  borderRadius: "8px",
                  background: "#ffffff",
                  fontSize: "12px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {hashRepairMessage}
              </div>
            )}
          </div>

          {/* 검색 */}

          <div
            style={{
              display: "flex",
              gap: "6px",
              marginBottom: "10px",
            }}
          >
            <input
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchJobs();
              }}
              placeholder="시공 부위 검색"
              style={inputStyle}
            />

            <button
              type="button"
              onClick={searchJobs}
              style={{
                ...primaryButtonStyle,
                width: "80px",
              }}
            >
              검색
            </button>
          </div>

          {jobSearchApplied && (
            <button
              type="button"
              onClick={clearJobSearch}
              style={{
                ...secondaryButtonStyle,
                marginBottom: "10px",
              }}
            >
              검색 초기화
            </button>
          )}

          {jobsMessage && (
            <div
              style={{
                marginBottom: "10px",
                fontSize: "13px",
                whiteSpace: "pre-wrap",
              }}
            >
              {jobsMessage}
            </div>
          )}

          {jobsLoading ? (
            <div>불러오는 중...</div>
          ) : jobs.length === 0 ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "#6b7280",
              }}
            >
              등록된 시공 데이터가 없습니다.
            </div>
          ) : (
            jobs.map((job) => {
              const isOpen = openJobId === job.id;
              const photos = jobPhotos[job.id] || [];

              return (
                <div
                  key={job.id}
                  style={{
                    padding: "12px",
                    marginBottom: "9px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "11px",
                  }}
                >
                  <strong>{job.category || "시공"}</strong>

                  <div
                    style={{
                      marginTop: "5px",
                      fontSize: "13px",
                      lineHeight: 1.6,
                    }}
                  >
                    {job.sub_category || "-"}
                    <br />
                    {formatWon(job.actual_cost)}
                    <br />
                    {formatDate(job.created_at)}
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleJobDetail(job.id)}
                    style={{
                      ...secondaryButtonStyle,
                      marginTop: "8px",
                    }}
                  >
                    {isOpen ? "닫기" : "상세보기"}
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: "12px" }}>
                      {editingId === job.id ? (
                        <>
                          <input
                            value={editCategory}
                            onChange={(e) =>
                              setEditCategory(e.target.value)
                            }
                            placeholder="시공 부위"
                            style={{
                              ...inputStyle,
                              marginBottom: "7px",
                            }}
                          />

                          <input
                            value={editSubCategory}
                            onChange={(e) =>
                              setEditSubCategory(e.target.value)
                            }
                            placeholder="세부 부위"
                            style={{
                              ...inputStyle,
                              marginBottom: "7px",
                            }}
                          />

                          <input
                            value={editCost}
                            inputMode="numeric"
                            onChange={(e) =>
                              setEditCost(
                                e.target.value.replace(/[^0-9]/g, "")
                              )
                            }
                            placeholder="시공금액"
                            style={{
                              ...inputStyle,
                              marginBottom: "7px",
                            }}
                          />

                          <textarea
                            value={editMemo}
                            onChange={(e) =>
                              setEditMemo(e.target.value)
                            }
                            placeholder="메모"
                            rows={3}
                            style={{
                              ...inputStyle,
                              marginBottom: "7px",
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => saveJobEdit(job.id)}
                            style={primaryButtonStyle}
                          >
                            수정 저장
                          </button>

                          <button
                            type="button"
                            onClick={cancelEdit}
                            style={{
                              ...secondaryButtonStyle,
                              marginTop: "6px",
                            }}
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <div
                            style={{
                              padding: "10px",
                              background: "#f9fafb",
                              borderRadius: "9px",
                              fontSize: "13px",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            메모: {job.memo || "-"}
                          </div>

                          <button
                            type="button"
                            onClick={() => startEdit(job)}
                            style={{
                              ...secondaryButtonStyle,
                              marginTop: "7px",
                            }}
                          >
                            시공정보 수정
                          </button>
                        </>
                      )}

                      <div
                        style={{
                          marginTop: "13px",
                          fontWeight: "bold",
                        }}
                      >
                        📷 사진
                      </div>

                      {jobPhotoLoadingId === job.id ? (
                        <div style={{ marginTop: "8px" }}>
                          사진정보 불러오는 중...
                        </div>
                      ) : photos.length ? (
                        <div
                          style={{
                            display: "grid",
                            gap: "8px",
                            marginTop: "8px",
                          }}
                        >
                          {photos.map((photo) => (
                            <PhotoCard
                              key={photo.id}
                              photo={photo}
                            />
                          ))}
                        </div>
                      ) : (
                        <div
                          style={{
                            marginTop: "8px",
                            color: "#6b7280",
                            fontSize: "12px",
                          }}
                        >
                          사진이 없습니다.
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => deleteJob(job)}
                        style={{
                          ...secondaryButtonStyle,
                          marginTop: "12px",
                          color: "#dc2626",
                        }}
                      >
                        시공 전체 삭제
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {jobTotalPages > 1 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: "7px",
                alignItems: "center",
                marginTop: "12px",
              }}
            >
              <button
                type="button"
                disabled={jobPage <= 1}
                onClick={() =>
                  loadJobs(jobPage - 1, jobSearchApplied)
                }
                style={secondaryButtonStyle}
              >
                이전
              </button>

              <strong>
                {jobPage}/{jobTotalPages}
              </strong>

              <button
                type="button"
                disabled={jobPage >= jobTotalPages}
                onClick={() =>
                  loadJobs(jobPage + 1, jobSearchApplied)
                }
                style={secondaryButtonStyle}
              >
                다음
              </button>
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          시공 등록
          사진을 가장 먼저 선택
      ===================================================== */}

      {activeTab === "register" && (
        <section style={sectionStyle}>
          <h2
            style={{
              marginTop: 0,
              fontSize: "20px",
            }}
          >
            ➕ 시공 등록
          </h2>

          <div
            style={{
              padding: "12px",
              marginBottom: "12px",
              borderRadius: "10px",
              background: "#eff6ff",
              color: "#1e3a8a",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            📷 사진을 먼저 선택한 다음 시공정보와 금액을
            입력하세요.
          </div>

          {/* 1. 시공 전 사진 */}

          <div
            style={{
              padding: "14px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "11px",
              marginBottom: "9px",
            }}
          >
            <strong>① 시공 전 사진</strong>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleBeforeFiles}
              style={{
                width: "100%",
                marginTop: "10px",
              }}
            />

            <div
              style={{
                marginTop: "7px",
                fontSize: "13px",
                fontWeight: beforeImages.length
                  ? "bold"
                  : "normal",
                color: beforeImages.length
                  ? "#16a34a"
                  : "#6b7280",
              }}
            >
              {beforeImages.length
                ? `✅ ${beforeImages.length}장 선택됨`
                : "선택된 사진 없음"}
            </div>

            {beforeImages.length > 0 && (
              <button
                type="button"
                disabled={loading}
                onClick={() => setBeforeImages([])}
                style={{
                  marginTop: "7px",
                  border: 0,
                  background: "transparent",
                  color: "#dc2626",
                  fontWeight: "bold",
                }}
              >
                시공 전 사진 선택 취소
              </button>
            )}
          </div>

          {/* 2. 시공 후 사진 */}

          <div
            style={{
              padding: "14px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "11px",
              marginBottom: "14px",
            }}
          >
            <strong>② 시공 후 사진</strong>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleAfterFiles}
              style={{
                width: "100%",
                marginTop: "10px",
              }}
            />

            <div
              style={{
                marginTop: "7px",
                fontSize: "13px",
                fontWeight: afterImages.length
                  ? "bold"
                  : "normal",
                color: afterImages.length
                  ? "#16a34a"
                  : "#6b7280",
              }}
            >
              {afterImages.length
                ? `✅ ${afterImages.length}장 선택됨`
                : "선택된 사진 없음"}
            </div>

            {afterImages.length > 0 && (
              <button
                type="button"
                disabled={loading}
                onClick={() => setAfterImages([])}
                style={{
                  marginTop: "7px",
                  border: 0,
                  background: "transparent",
                  color: "#dc2626",
                  fontWeight: "bold",
                }}
              >
                시공 후 사진 선택 취소
              </button>
            )}
          </div>

          {/* 3. 시공 부위 */}

          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "5px",
            }}
          >
            ③ 시공 부위
          </label>

          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="예: 문·문틀 / 싱크대 / 중문 / 방화문"
            style={{
              ...inputStyle,
              marginBottom: "11px",
            }}
          />

          {/* 4. 금액 */}

          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "5px",
            }}
          >
            ④ 실제 시공금액
          </label>

          <input
            value={actualCost}
            inputMode="numeric"
            onChange={(e) =>
              setActualCost(e.target.value.replace(/[^0-9]/g, ""))
            }
            placeholder="실제 시공금액"
            style={{
              ...inputStyle,
              marginBottom: "4px",
            }}
          />

          {actualCost && (
            <div
              style={{
                marginBottom: "11px",
                fontSize: "14px",
                fontWeight: "bold",
                color: "#92400e",
              }}
            >
              {formatWon(actualCost)}
            </div>
          )}

          {/* 5. 자재 */}

          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginTop: actualCost ? 0 : "11px",
              marginBottom: "5px",
            }}
          >
            ⑤ 사용 자재
          </label>

          <input
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="예: 현대L&C GS245"
            style={{
              ...inputStyle,
              marginBottom: "11px",
            }}
          />

          {/* 6. 메모 */}

          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "5px",
            }}
          >
            ⑥ 메모
          </label>

          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="현장 특징이나 참고사항"
            rows={3}
            style={{
              ...inputStyle,
              marginBottom: "12px",
            }}
          />

          {/* 저장 */}

          <button
            type="button"
            disabled={loading}
            onClick={registerJob}
            style={{
              ...primaryButtonStyle,
              background: loading ? "#9ca3af" : "#111827",
            }}
          >
            {loading
              ? "AI 분석 + 저장 중..."
              : `⑦ 시공 데이터 저장${
                  beforeImages.length + afterImages.length
                    ? ` (${beforeImages.length + afterImages.length}장)`
                    : ""
                }`}
          </button>

          {message && (
            <div
              style={{
                marginTop: "10px",
                padding: "10px",
                background: "#f9fafb",
                borderRadius: "9px",
                whiteSpace: "pre-wrap",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              {message}
            </div>
          )}

          <hr
            style={{
              border: 0,
              borderTop: "1px solid #e5e7eb",
              margin: "20px 0",
            }}
          />

          <strong>AI 유사도 기준</strong>

          <div
            style={{
              marginTop: "8px",
              display: "flex",
              gap: "7px",
            }}
          >
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={similarityThreshold}
              onChange={(e) =>
                setSimilarityThreshold(e.target.value)
              }
              style={inputStyle}
            />

            <button
              type="button"
              disabled={settingLoading}
              onClick={saveSimilaritySetting}
              style={{
                ...primaryButtonStyle,
                width: "100px",
              }}
            >
              저장
            </button>
          </div>

          {settingMessage && (
            <div
              style={{
                marginTop: "7px",
                fontSize: "12px",
              }}
            >
              {settingMessage}
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          고객 상담
      ===================================================== */}

      {activeTab === "leads" && (
        <section style={sectionStyle}>
          <h2
            style={{
              marginTop: 0,
              fontSize: "20px",
            }}
          >
            📞 고객 상담
          </h2>

          <button
            type="button"
            onClick={enableNotifications}
            style={{
              ...secondaryButtonStyle,
              marginBottom: "10px",
            }}
          >
            {notificationEnabled
              ? "🔔 알림 등록됨"
              : "🔔 이 휴대폰에 알림 등록"}
          </button>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: "5px",
              marginBottom: "10px",
            }}
          >
            {[
              ["all", "전체"],
              ["unread", "미확인"],
              ["read", "확인"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setLeadFilter(value);
                  loadLeads(1, value);
                }}
                style={{
                  padding: "9px",
                  border: 0,
                  borderRadius: "8px",
                  background:
                    leadFilter === value
                      ? "#111827"
                      : "#e5e7eb",
                  color:
                    leadFilter === value
                      ? "#fff"
                      : "#111827",
                  fontWeight: "bold",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {leadsMessage && (
            <div
              style={{
                marginBottom: "10px",
                fontSize: "13px",
                whiteSpace: "pre-wrap",
              }}
            >
              {leadsMessage}
            </div>
          )}

          {leadsLoading ? (
            <div>불러오는 중...</div>
          ) : leads.length === 0 ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "#6b7280",
              }}
            >
              상담 내역이 없습니다.
            </div>
          ) : (
            leads.map((lead) => {
              const isOpen = openLeadId === lead.id;
              const paths = getLeadPhotoPaths(lead);
              const quoteEditing =
                quoteEditingLeadId === lead.id;

              return (
                <div
                  key={lead.id}
                  style={{
                    padding: "12px",
                    marginBottom: "9px",
                    border: lead.is_read
                      ? "1px solid #e5e7eb"
                      : "2px solid #ef4444",
                    borderRadius: "11px",
                    background: "#fff",
                  }}
                >
                  <strong>{lead.customer_name || "고객"}</strong>

                  {!lead.is_read && (
                    <span
                      style={{
                        marginLeft: "6px",
                        color: "#dc2626",
                        fontSize: "11px",
                        fontWeight: "bold",
                      }}
                    >
                      NEW
                    </span>
                  )}

                  <div
                    style={{
                      marginTop: "5px",
                      fontSize: "13px",
                      lineHeight: 1.6,
                    }}
                  >
                    📱 {lead.phone || "-"}
                    <br />
                    📍 {lead.region || "-"}
                    <br />
                    🛠️ {lead.category || "-"}
                    <br />
                    AI 예상:{" "}
                    {lead.estimate_min != null &&
                    lead.estimate_max != null
                      ? `${formatWon(
                          lead.estimate_min
                        )} ~ ${formatWon(
                          lead.estimate_max
                        )}`
                      : "-"}
                  </div>

                  <button
                    type="button"
                    onClick={() => openLeadDetail(lead)}
                    style={{
                      ...secondaryButtonStyle,
                      marginTop: "8px",
                    }}
                  >
                    {isOpen ? "닫기" : "상세보기"}
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: "12px" }}>
                      <div
                        style={{
                          padding: "10px",
                          background: "#f9fafb",
                          borderRadius: "9px",
                          fontSize: "13px",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        <strong>AI 분석</strong>
                        <br />
                        {lead.ai_description || "-"}
                      </div>

                      {/* 고객사진 */}

                      {paths.length > 0 && (
                        <div style={{ marginTop: "10px" }}>
                          <strong>
                            고객사진 ({paths.length})
                          </strong>

                          <div
                            style={{
                              display: "grid",
                              gap: "7px",
                              marginTop: "7px",
                            }}
                          >
                            {paths.map((path, index) => {
                              const key = `${lead.id}:${index}`;
                              const url = leadPhotoUrls[key];

                              return (
                                <div key={key}>
                                  {url ? (
                                    <img
                                      src={url}
                                      alt="고객사진"
                                      loading="lazy"
                                      decoding="async"
                                      onClick={() =>
                                        setPreviewPhoto(url)
                                      }
                                      style={{
                                        width: "100%",
                                        maxHeight: "300px",
                                        objectFit: "cover",
                                        borderRadius: "9px",
                                      }}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={
                                        leadPhotoLoadingId === key
                                      }
                                      onClick={() =>
                                        openLeadPhotoPreview(
                                          lead,
                                          path,
                                          index
                                        )
                                      }
                                      style={secondaryButtonStyle}
                                    >
                                      {leadPhotoLoadingId === key
                                        ? "불러오는 중..."
                                        : `📷 사진 ${
                                            index + 1
                                          } 보기`}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 읽음 상태 */}

                      <button
                        type="button"
                        onClick={() => toggleLeadRead(lead)}
                        style={{
                          ...secondaryButtonStyle,
                          marginTop: "10px",
                        }}
                      >
                        {lead.is_read
                          ? "다시 미확인으로 표시"
                          : "확인 처리"}
                      </button>

                      {/* 상태 */}

                      <select
                        value={lead.status || "new"}
                        onChange={(e) =>
                          updateLeadStatus(
                            lead.id,
                            e.target.value
                          )
                        }
                        style={{
                          ...inputStyle,
                          marginTop: "8px",
                        }}
                      >
                        <option value="new">신규</option>
                        <option value="contacted">
                          연락완료
                        </option>
                        <option value="scheduled">
                          시공예정
                        </option>
                        <option value="completed">완료</option>
                        <option value="cancelled">취소</option>
                      </select>

                      {/* 메모 */}

                      <textarea
                        defaultValue={lead.memo || ""}
                        onBlur={(e) =>
                          saveLeadMemo(
                            lead.id,
                            e.target.value
                          )
                        }
                        placeholder="관리자 메모"
                        rows={3}
                        style={{
                          ...inputStyle,
                          marginTop: "8px",
                        }}
                      />

                      {/* 최종 견적 */}

                      <div
                        style={{
                          padding: "12px",
                          marginTop: "10px",
                          borderRadius: "10px",
                          background: "#fff7ed",
                        }}
                      >
                        <strong>🧾 최종 견적</strong>

                        {!quoteEditing ? (
                          <>
                            <div
                              style={{
                                marginTop: "7px",
                                fontSize: "13px",
                                lineHeight: 1.6,
                              }}
                            >
                              확정금액:{" "}
                              <strong>
                                {lead.final_price
                                  ? formatWon(
                                      lead.final_price
                                    )
                                  : "미확정"}
                              </strong>

                              {lead.quote_created_at && (
                                <>
                                  <br />
                                  저장:{" "}
                                  {formatDate(
                                    lead.quote_created_at
                                  )}
                                </>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                startQuoteEdit(lead)
                              }
                              style={{
                                ...primaryButtonStyle,
                                marginTop: "8px",
                                background: "#92400e",
                              }}
                            >
                              최종 견적 작성/수정
                            </button>
                          </>
                        ) : (
                          <>
                            <input
                              value={quoteFinalPrice}
                              inputMode="numeric"
                              onChange={(e) =>
                                setQuoteFinalPrice(
                                  e.target.value.replace(
                                    /[^0-9]/g,
                                    ""
                                  )
                                )
                              }
                              placeholder="최종 견적금액"
                              style={{
                                ...inputStyle,
                                marginTop: "8px",
                              }}
                            />

                            {quoteFinalPrice && (
                              <div
                                style={{
                                  marginTop: "4px",
                                  color: "#92400e",
                                  fontWeight: "bold",
                                }}
                              >
                                {formatWon(quoteFinalPrice)}
                              </div>
                            )}

                            <textarea
                              value={quoteWorkDetails}
                              onChange={(e) =>
                                setQuoteWorkDetails(
                                  e.target.value
                                )
                              }
                              placeholder="시공내용"
                              rows={4}
                              style={{
                                ...inputStyle,
                                marginTop: "7px",
                              }}
                            />

                            <input
                              value={quoteMaterial}
                              onChange={(e) =>
                                setQuoteMaterial(
                                  e.target.value
                                )
                              }
                              placeholder="사용 자재"
                              style={{
                                ...inputStyle,
                                marginTop: "7px",
                              }}
                            />

                            <textarea
                              value={quoteNote}
                              onChange={(e) =>
                                setQuoteNote(e.target.value)
                              }
                              placeholder="특이사항 / 안내"
                              rows={3}
                              style={{
                                ...inputStyle,
                                marginTop: "7px",
                              }}
                            />

                            <button
                              type="button"
                              disabled={quoteSaving}
                              onClick={() =>
                                saveFinalQuote(lead)
                              }
                              style={{
                                ...primaryButtonStyle,
                                marginTop: "8px",
                                background: "#92400e",
                              }}
                            >
                              {quoteSaving
                                ? "저장 중..."
                                : "최종 견적 저장"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                generateQuoteImage(lead)
                              }
                              style={{
                                ...secondaryButtonStyle,
                                marginTop: "6px",
                              }}
                            >
                              🖼️ 견적 이미지 만들기
                            </button>

                            {quoteImage &&
                              quoteImageLeadId === lead.id && (
                                <>
                                  <img
                                    src={quoteImage}
                                    alt="견적서"
                                    onClick={() =>
                                      setPreviewPhoto(
                                        quoteImage
                                      )
                                    }
                                    style={{
                                      width: "100%",
                                      marginTop: "9px",
                                      borderRadius: "9px",
                                    }}
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      shareQuoteImage(lead)
                                    }
                                    style={{
                                      ...primaryButtonStyle,
                                      marginTop: "7px",
                                      background: "#16a34a",
                                    }}
                                  >
                                    📤 고객에게 전송
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      downloadQuoteImage(
                                        lead
                                      )
                                    }
                                    style={{
                                      ...secondaryButtonStyle,
                                      marginTop: "6px",
                                    }}
                                  >
                                    이미지 저장
                                  </button>
                                </>
                              )}

                            <button
                              type="button"
                              onClick={cancelQuoteEdit}
                              style={{
                                ...secondaryButtonStyle,
                                marginTop: "6px",
                              }}
                            >
                              닫기
                            </button>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteLead(lead)}
                        style={{
                          ...secondaryButtonStyle,
                          marginTop: "10px",
                          color: "#dc2626",
                        }}
                      >
                        상담 삭제
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {leadTotalPages > 1 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: "7px",
                alignItems: "center",
                marginTop: "12px",
              }}
            >
              <button
                type="button"
                disabled={leadPage <= 1}
                onClick={() =>
                  loadLeads(
                    leadPage - 1,
                    leadFilter
                  )
                }
                style={secondaryButtonStyle}
              >
                이전
              </button>

              <strong>
                {leadPage}/{leadTotalPages}
              </strong>

              <button
                type="button"
                disabled={
                  leadPage >= leadTotalPages
                }
                onClick={() =>
                  loadLeads(
                    leadPage + 1,
                    leadFilter
                  )
                }
                style={secondaryButtonStyle}
              >
                다음
              </button>
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          사진 전체화면
      ===================================================== */}

      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "15px",
          }}
        >
          <button
            type="button"
            onClick={() => setPreviewPhoto(null)}
            style={{
              position: "absolute",
              top: "18px",
              right: "18px",
              width: "45px",
              height: "45px",
              borderRadius: "50%",
              border: 0,
              background: "#fff",
              color: "#111827",
              fontSize: "24px",
              fontWeight: "bold",
              zIndex: 10000,
            }}
          >
            ×
          </button>

          <img
            src={previewPhoto}
            alt="사진 크게 보기"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "92vh",
              objectFit: "contain",
            }}
          />
        </div>
      )}
    </main>
  );
        }
