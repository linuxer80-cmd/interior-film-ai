"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const JOB_PAGE_SIZE = 10;
const LEAD_PAGE_SIZE = 20;
const SIGNED_URL_SECONDS = 60 * 30;

export default function AdminPage() {
  /* =========================
     기본 상태
  ========================= */

  const [activeTab, setActiveTab] = useState("jobs");
  const activeTabRef = useRef("jobs");

  const [similarityThreshold, setSimilarityThreshold] = useState(0.65);
  const [settingMessage, setSettingMessage] = useState("");
  const [settingLoading, setSettingLoading] = useState(false);

  /* =========================
     신규 시공 등록
  ========================= */

  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);
  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  /* =========================
     시공 DB
  ========================= */

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsMessage, setJobsMessage] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [jobSearchApplied, setJobSearchApplied] = useState("");
  const [jobPage, setJobPage] = useState(1);
  const [jobTotal, setJobTotal] = useState(0);
  const [openJobId, setOpenJobId] = useState(null);

  /* 사진 DB정보와 실제 이미지 URL을 분리
     상세를 열어도 사진 원본은 자동 다운로드하지 않음 */
  const [jobPhotos, setJobPhotos] = useState({});
  const [jobPhotoLoadingId, setJobPhotoLoadingId] = useState(null);
  const [jobPhotoUrls, setJobPhotoUrls] = useState({});
  const [loadingPhotoId, setLoadingPhotoId] = useState(null);

  /* =========================
     시공 수정
  ========================= */

  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editMemo, setEditMemo] = useState("");

  /* =========================
     사진 수정
  ========================= */

  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editPhotoType, setEditPhotoType] = useState("before");
  const [editPhotoCategory, setEditPhotoCategory] = useState("");
  const [editPhotoSubCategory, setEditPhotoSubCategory] = useState("");
  const [editPhotoDescription, setEditPhotoDescription] = useState("");
  const [photoEditLoading, setPhotoEditLoading] = useState(false);

  /* =========================
     고객 상담
  ========================= */

  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsMessage, setLeadsMessage] = useState("");
  const [leadPage, setLeadPage] = useState(1);
  const [leadTotal, setLeadTotal] = useState(0);
  const [leadFilter, setLeadFilter] = useState("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const [openLeadId, setOpenLeadId] = useState(null);

  /* 고객사진도 URL 생성과 실제 표시를 필요할 때만 */
  const [leadPhotoUrls, setLeadPhotoUrls] = useState({});
  const [leadPhotoLoadingId, setLeadPhotoLoadingId] = useState(null);

  const [newLeadAlert, setNewLeadAlert] = useState(null);
  const [notificationEnabled, setNotificationEnabled] = useState(false);

  /* =========================
     스타일
  ========================= */

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

  /* =========================
     탭
  ========================= */

  function changeTab(tab) {
    activeTabRef.current = tab;
    setActiveTab(tab);

    if (tab === "leads") {
      loadLeads(1, leadFilter);
    }
  }

  /* =========================
     공통
  ========================= */

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

  function getTotalPages(total, size) {
    return Math.max(1, Math.ceil(Number(total || 0) / size));
  }

  function sanitizeSearchKeyword(value) {
    return String(value || "")
      .replace(/[,()]/g, " ")
      .trim();
  }

  function getLeadPhotoPaths(lead) {
    const paths =
      Array.isArray(lead?.customer_photo_paths) &&
      lead.customer_photo_paths.length
        ? lead.customer_photo_paths
        : lead?.customer_photo_path
        ? [lead.customer_photo_path]
        : [];

    return [...new Set(paths.filter(Boolean))];
  }

  /* =========================
     초기 실행
  ========================= */

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

  /* =========================
     실시간 신규 상담
  ========================= */

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
      if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
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

  /* =========================
     푸시 알림 등록
  ========================= */

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

      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
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

  /* =========================
     AI 유사도 설정
  ========================= */

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("similarity_threshold")
        .eq("id", 1)
        .single();

      if (error) throw error;

      if (data?.similarity_threshold !== null &&
          data?.similarity_threshold !== undefined) {
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

  /* =========================
     시공 목록
     사진 데이터는 조회하지 않음
  ========================= */

  async function loadJobs(page = 1, keyword = jobSearchApplied) {
    setJobsLoading(true);
    setJobsMessage("");

    try {
      const from = (page - 1) * JOB_PAGE_SIZE;
      const to = from + JOB_PAGE_SIZE - 1;
      const safeKeyword = sanitizeSearchKeyword(keyword);

      let query = supabase
        .from("work_items")
        .select(
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

  /* =========================
     시공 상세
     DB 메타데이터만 조회
  ========================= */

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

  /* =========================
     트래픽 절감 핵심
     클릭한 시공사진 1장만 Signed URL 생성
  ========================= */

  async function loadSingleJobPhoto(photo) {
    if (!photo?.id) return null;

    if (jobPhotoUrls[photo.id]) {
      return jobPhotoUrls[photo.id];
    }

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

      if (!data?.signedUrl) {
        throw new Error("사진 주소를 만들 수 없습니다.");
      }

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

    if (!url) {
      url = await loadSingleJobPhoto(photo);
    }

    if (url) setPreviewPhoto(url);
  }

  /* =========================
     시공 수정
  ========================= */

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

  /* =========================
     사진 수정
  ========================= */

  function startPhotoEdit(photo) {
    setEditingPhotoId(photo.id);
    setEditPhotoType(photo.photo_type || "before");
    setEditPhotoCategory(photo.category || "");
    setEditPhotoSubCategory(
      photo.sub_category || photo.category || ""
    );
    setEditPhotoDescription(photo.ai_description || "");
  }

  function cancelPhotoEdit() {
    setEditingPhotoId(null);
  }

  async function createEmbedding(text) {
    if (!String(text || "").trim()) return null;

    const response = await fetch("/api/embedding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error || "임베딩 생성 실패");
    }

    return result.embedding || null;
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

  /* =========================
     사진 삭제
  ========================= */

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
    /* =========================
     시공 전체 삭제
  ========================= */

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

        if (storageError) {
          console.error("Storage 삭제:", storageError);
        }
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

          ids.forEach((id) => {
            delete next[id];
          });

          return next;
        });
      }

      setJobsMessage("✅ 시공건이 삭제되었습니다.");

      const targetPage =
        jobs.length === 1 && jobPage > 1
          ? jobPage - 1
          : jobPage;

      await loadJobs(targetPage, jobSearchApplied);
    } catch (error) {
      console.error(error);
      setJobsMessage(`❌ 시공 삭제 오류: ${error?.message || "실패"}`);
    }
  }

  /* =========================
     미확인 상담 수
  ========================= */

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

  /* =========================
     상담 목록
  ========================= */

  async function loadLeads(page = 1, filter = leadFilter) {
    setLeadsLoading(true);
    setLeadsMessage("");

    try {
      const from = (page - 1) * LEAD_PAGE_SIZE;
      const to = from + LEAD_PAGE_SIZE - 1;

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
          created_at,
          final_price,
          quote_work_details,
          quote_material,
          quote_note,
          quote_created_at
          `,
          { count: "exact" }
        );

      if (filter === "unread") {
        query = query.eq("is_read", false);
      }

      if (filter === "read") {
        query = query.eq("is_read", true);
      }

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

  /* =========================
     상담 상세 열기
     여기서는 사진 다운로드 안 함
  ========================= */

  function toggleLeadDetail(lead) {
    if (openLeadId === lead.id) {
      setOpenLeadId(null);
      return;
    }

    setOpenLeadId(lead.id);
  }

  /* =========================
     고객사진 불러오기

     중요:
     상담 상세만 열어서는 Storage 트래픽 없음.
     사용자가 버튼을 눌러야 사진 URL 생성.
  ========================= */

  async function loadLeadPhotos(lead) {
    const paths = getLeadPhotoPaths(lead);

    if (!paths.length) return;

    if (leadPhotoUrls[lead.id]?.length) return;

    setLeadPhotoLoadingId(lead.id);

    try {
      const urls = [];

      for (const path of paths) {
        const { data, error } = await supabase.storage
          .from("work-photos")
          .createSignedUrl(path, SIGNED_URL_SECONDS);

        if (error) {
          console.error("고객사진 URL:", path, error);
          continue;
        }

        if (data?.signedUrl) {
          urls.push(data.signedUrl);
        }
      }

      setLeadPhotoUrls((current) => ({
        ...current,
        [lead.id]: urls,
      }));

      if (!urls.length) {
        setLeadsMessage("⚠️ 불러올 수 있는 고객사진이 없습니다.");
      }
    } catch (error) {
      console.error(error);
      setLeadsMessage(
        `❌ 고객사진 오류: ${error?.message || "불러오기 실패"}`
      );
    } finally {
      setLeadPhotoLoadingId(null);
    }
  }

  /* =========================
     상담 읽음 처리
  ========================= */

  async function markLeadRead(leadId) {
    try {
      const now = new Date().toISOString();

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

      setUnreadCount((n) => Math.max(0, n - 1));

      if (typeof document !== "undefined") {
        document.title = "기분좋은공간 관리자";
      }
    } catch (error) {
      console.error(error);
      setLeadsMessage(
        `❌ 읽음 처리 오류: ${error?.message || "실패"}`
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

      setUnreadCount((n) => n + 1);
    } catch (error) {
      console.error(error);
      setLeadsMessage(
        `❌ 미확인 처리 오류: ${error?.message || "실패"}`
      );
    }
  }

  async function toggleLeadRead(lead) {
    if (lead.is_read) {
      await markLeadUnread(lead.id);
    } else {
      await markLeadRead(lead.id);
    }
  }

  /* =========================
     상담 상태
  ========================= */

  async function updateLeadStatus(leadId, status) {
    try {
      const { error } = await supabase
        .from("customer_leads")
        .update({ status })
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

      setLeadsMessage("✅ 상담 상태가 변경되었습니다.");
    } catch (error) {
      console.error(error);
      setLeadsMessage(
        `❌ 상태 변경 오류: ${error?.message || "실패"}`
      );
    }
  }

  /* =========================
     상담 메모
  ========================= */

  async function updateLeadMemo(leadId, value) {
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
      setLeadsMessage(
        `❌ 메모 저장 오류: ${error?.message || "실패"}`
      );
    }
  }

  /* =========================
     상담 삭제
  ========================= */

  async function deleteLead(lead) {
    if (
      !window.confirm(
        `${lead.customer_name || "고객"} 상담을 삭제하시겠습니까?\n고객사진도 함께 삭제됩니다.`
      )
    ) {
      return;
    }

    try {
      const paths = getLeadPhotoPaths(lead);

      if (paths.length) {
        const { error: storageError } = await supabase.storage
          .from("work-photos")
          .remove(paths);

        if (storageError) {
          console.error("고객사진 삭제:", storageError);
        }
      }

      const { error } = await supabase
        .from("customer_leads")
        .delete()
        .eq("id", lead.id);

      if (error) throw error;

      setOpenLeadId(null);

      setLeadPhotoUrls((current) => {
        const next = { ...current };
        delete next[lead.id];
        return next;
      });

      if (!lead.is_read) {
        setUnreadCount((n) => Math.max(0, n - 1));
      }

      setLeadsMessage("✅ 상담이 삭제되었습니다.");

      const targetPage =
        leads.length === 1 && leadPage > 1
          ? leadPage - 1
          : leadPage;

      await loadLeads(targetPage, leadFilter);
    } catch (error) {
      console.error(error);
      setLeadsMessage(
        `❌ 상담 삭제 오류: ${error?.message || "실패"}`
      );
    }
  }

  /* =========================
     이미지 SHA-256
  ========================= */

  async function getImageHash(file) {
    const buffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      buffer
    );

    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /* =========================
     이미지 압축
     기존 1600px / 85%보다 작게 저장
     최대변 1200px / JPEG 70%
  ========================= */

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

        const ctx = canvas.getContext("2d", {
          alpha: false,
        });

        if (!ctx) {
          throw new Error("이미지 변환 기능을 사용할 수 없습니다.");
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);

        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) resolve(result);
              else reject(new Error("이미지 변환 실패"));
            },
            "image/jpeg",
            quality
          );
        });

        bitmap.close?.();

        return new File(
          [blob],
          String(file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg",
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

          const ctx = canvas.getContext("2d", {
            alpha: false,
          });

          if (!ctx) {
            reject(
              new Error("이미지 변환 기능을 사용할 수 없습니다.")
            );
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
                  String(file.name || "photo").replace(/\.[^.]+$/, "") +
                    ".jpg",
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
            new Error(
              "선택한 사진을 브라우저에서 불러오지 못했습니다."
            )
          );

        image.src = reader.result;
      };

      reader.onerror = () =>
        reject(new Error("사진 파일을 읽지 못했습니다."));

      reader.readAsDataURL(file);
    });
  }

  /* =========================
     AI 사진 분석
  ========================= */

  async function analyzeImage(file) {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error || "AI 사진 분석 실패");
    }

    return result;
  }

  /* =========================
     전후 사진 비교
  ========================= */

  async function analyzeBeforeAfter(beforeFile, afterFile) {
    const formData = new FormData();

    formData.append("beforeImage", beforeFile);
    formData.append("afterImage", afterFile);

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error || "전후 비교 분석 실패");
    }

    return result;
  }

  /* =========================
     사진 Storage + DB 저장
  ========================= */

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
    const resized = await resizeImage(file, 1200, 0.7);

    const fileName =
      `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const storagePath =
      `history/${projectId}/${workItemId}/${photoType}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("work-photos")
      .upload(storagePath, resized, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    /* 기존 photo_url NOT NULL 구조 유지 */
    const { data: publicData } = supabase.storage
      .from("work-photos")
      .getPublicUrl(storagePath);

    const photoUrl = publicData?.publicUrl || storagePath;

    const { error: insertError } = await supabase
      .from("work_photos")
      .insert({
        work_item_id: workItemId,
        project_id: projectId,
        photo_type: photoType,
        category: photoCategory,
        sub_category: photoSubCategory,
        storage_path: storagePath,
        photo_url: photoUrl,
        ai_description: description || null,
        ai_tags: tags,
        embedding,
        image_hash: imageHash,
      });

    if (insertError) {
      await supabase.storage
        .from("work-photos")
        .remove([storagePath]);

      throw insertError;
    }

    return storagePath;
  }

  /* =========================
     신규 시공 저장
  ========================= */

  async function handleSave() {
    if (!beforeImages.length && !afterImages.length) {
      setMessage(
        "⚠️ 시공 전 또는 시공 후 사진을 한 장 이상 선택해주세요."
      );
      return;
    }

    if (!category.trim()) {
      setMessage("⚠️ 시공 부위를 입력해주세요.");
      return;
    }

    const cost = Number(
      String(actualCost).replace(/,/g, "")
    );

    if (!Number.isFinite(cost) || cost <= 0) {
      setMessage("⚠️ 실제 시공금액을 입력해주세요.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      const selectedFiles = [
        ...beforeImages.map((file) => ({
          file,
          type: "before",
        })),
        ...afterImages.map((file) => ({
          file,
          type: "after",
        })),
      ];

      const validFiles = [];
      const localHashes = new Set();

      /* 중복사진 확인 */
      for (const item of selectedFiles) {
        const hash = await getImageHash(item.file);

        if (localHashes.has(hash)) continue;

        localHashes.add(hash);

        const { data, error } = await supabase
          .from("work_photos")
          .select("id")
          .eq("image_hash", hash)
          .limit(1);

        if (error) {
          console.error("중복 확인:", error);
        }

        if (data?.length) continue;

        validFiles.push({
          ...item,
          hash,
        });
      }

      if (!validFiles.length) {
        throw new Error(
          "선택한 사진이 모두 이미 등록된 사진입니다."
        );
      }

      /* work_item 생성 */
      const { data: workItem, error: workItemError } =
        await supabase
          .from("work_items")
          .insert({
            project_id: projectId,
            category: category.trim(),
            sub_category: category.trim(),
            actual_cost: cost,
            memo: memo.trim() || null,
          })
          .select("id,project_id")
          .single();

      if (workItemError) throw workItemError;

      const analyzedBefore = [];
      const analyzedAfter = [];

      /* AI 분석 */
      for (const item of validFiles) {
        let ai = null;

        try {
          ai = await analyzeImage(item.file);
        } catch (error) {
          console.error("AI 분석:", error);
        }

        const description =
          ai?.description ||
          ai?.ai_description ||
          `${category.trim()} ${
            item.type === "before" ? "시공 전" : "시공 후"
          } 사진`;

        const tags = Array.isArray(ai?.tags)
          ? [...ai.tags]
          : [];

        const stateTag =
          item.type === "before" ? "시공전" : "시공후";

        if (!tags.includes(stateTag)) {
          tags.push(stateTag);
        }

        const analyzed = {
          ...item,
          description,
          tags,
          detectedCategory:
            ai?.category || category.trim(),
          detectedSubCategory:
            ai?.sub_category || category.trim(),
        };

        if (item.type === "before") {
          analyzedBefore.push(analyzed);
        } else {
          analyzedAfter.push(analyzed);
        }
      }

      /* 대표 전후사진 비교 */
      let comparison = null;

      if (analyzedBefore.length && analyzedAfter.length) {
        try {
          comparison = await analyzeBeforeAfter(
            analyzedBefore[0].file,
            analyzedAfter[0].file
          );
        } catch (error) {
          console.error("전후 비교:", error);
        }
      }

      /* 시공 전 저장 */
      for (const item of analyzedBefore) {
        const searchText = [
          `시공 부위: ${item.detectedCategory}`,
          `세부 부위: ${item.detectedSubCategory}`,
          "사진 상태: 시공 전",
          `사진 설명: ${item.description}`,
          `특징: ${item.tags.join(", ")}`,
          comparison?.description
            ? `전후 비교: ${comparison.description}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        let embedding = null;

        try {
          embedding = await createEmbedding(searchText);
        } catch (error) {
          console.error("임베딩:", error);
        }

        await savePhoto({
          file: item.file,
          workItemId: workItem.id,
          projectId,
          photoType: "before",
          photoCategory: item.detectedCategory,
          photoSubCategory: item.detectedSubCategory,
          description: item.description,
          tags: item.tags,
          embedding,
          imageHash: item.hash,
        });
      }

      /* 시공 후 저장 */
      for (const item of analyzedAfter) {
        const comparisonText =
          comparison?.description ||
          comparison?.ai_description ||
          "";

        const description = comparisonText
          ? `${item.description}\n\n전후 비교: ${comparisonText}`
          : item.description;

        const comparisonTags = Array.isArray(comparison?.tags)
          ? comparison.tags
          : [];

        const tags = [
          ...new Set([
            ...item.tags,
            ...comparisonTags,
            "시공후",
          ]),
        ];

        const searchText = [
          `시공 부위: ${item.detectedCategory}`,
          `세부 부위: ${item.detectedSubCategory}`,
          "사진 상태: 시공 후",
          `사진 설명: ${description}`,
          `특징: ${tags.join(", ")}`,
          `실제 시공금액: ${cost}원`,
          material.trim()
            ? `사용 자재: ${material.trim()}`
            : "",
          memo.trim()
            ? `메모: ${memo.trim()}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        let embedding = null;

        try {
          embedding = await createEmbedding(searchText);
        } catch (error) {
          console.error("임베딩:", error);
        }

        await savePhoto({
          file: item.file,
          workItemId: workItem.id,
          projectId,
          photoType: "after",
          photoCategory: item.detectedCategory,
          photoSubCategory: item.detectedSubCategory,
          description,
          tags,
          embedding,
          imageHash: item.hash,
        });
      }

      setBeforeImages([]);
      setAfterImages([]);
      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");

      setMessage(
        `✅ 시공 데이터 등록 완료 — ${validFiles.length}장 저장`
      );

      await loadJobs(1, "");
      changeTab("jobs");
    } catch (error) {
      console.error(error);
      setMessage(`❌ 등록 오류: ${error?.message || "등록 실패"}`);
    } finally {
      setLoading(false);
    }
        }
    /* =========================
     최종 견적 편집기
  ========================= */

  function LeadQuoteEditor({ lead }) {
    const [price, setPrice] = useState(
      lead.final_price != null ? String(lead.final_price) : ""
    );

    const [workDetails, setWorkDetails] = useState(
      lead.quote_work_details || lead.category || ""
    );

    const [quoteMaterial, setQuoteMaterial] = useState(
      lead.quote_material || ""
    );

    const [quoteNote, setQuoteNote] = useState(
      lead.quote_note || ""
    );

    const [quoteSaving, setQuoteSaving] = useState(false);
    const [quoteMessage, setQuoteMessage] = useState("");
    const [quoteImageUrl, setQuoteImageUrl] = useState(null);

    async function saveFinalQuote() {
      const priceNumber = Number(
        String(price).replace(/[^0-9]/g, "")
      );

      if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
        setQuoteMessage("⚠️ 최종 견적금액을 입력해주세요.");
        return;
      }

      if (!workDetails.trim()) {
        setQuoteMessage("⚠️ 시공내용을 입력해주세요.");
        return;
      }

      setQuoteSaving(true);
      setQuoteMessage("");

      try {
        const now = new Date().toISOString();

        const { error } = await supabase
          .from("customer_leads")
          .update({
            final_price: priceNumber,
            quote_work_details: workDetails.trim(),
            quote_material: quoteMaterial.trim() || null,
            quote_note: quoteNote.trim() || null,
            quote_created_at: now,
          })
          .eq("id", lead.id);

        if (error) throw error;

        setLeads((current) =>
          current.map((item) =>
            item.id === lead.id
              ? {
                  ...item,
                  final_price: priceNumber,
                  quote_work_details: workDetails.trim(),
                  quote_material: quoteMaterial.trim() || null,
                  quote_note: quoteNote.trim() || null,
                  quote_created_at: now,
                }
              : item
          )
        );

        setPrice(String(priceNumber));
        setQuoteMessage("✅ 최종 견적이 저장되었습니다.");
      } catch (error) {
        console.error(error);
        setQuoteMessage(
          `❌ 견적 저장 오류: ${error?.message || "실패"}`
        );
      } finally {
        setQuoteSaving(false);
      }
    }

    function wrapCanvasText(ctx, text, maxWidth) {
      const paragraphs = String(text || "-").split("\n");
      const lines = [];

      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
          lines.push("");
          continue;
        }

        let line = "";

        for (const char of paragraph) {
          const test = line + char;

          if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = char;
          } else {
            line = test;
          }
        }

        if (line) lines.push(line);
      }

      return lines;
    }

    function roundRect(ctx, x, y, w, h, r, fill) {
      ctx.beginPath();

      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, r);
      } else {
        const radius = Math.min(r, w / 2, h / 2);

        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(
          x + w,
          y + h,
          x + w - radius,
          y + h
        );
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
      }

      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }

    function generateQuoteImage() {
      const priceNumber = Number(
        String(price).replace(/[^0-9]/g, "")
      );

      if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
        setQuoteMessage(
          "⚠️ 먼저 최종 견적금액을 입력해주세요."
        );
        return;
      }

      if (!workDetails.trim()) {
        setQuoteMessage("⚠️ 시공내용을 입력해주세요.");
        return;
      }

      try {
        const canvas = document.createElement("canvas");

        canvas.width = 1080;
        canvas.height = 1500;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          throw new Error("견적 이미지를 만들 수 없습니다.");
        }

        ctx.fillStyle = "#f5f3ef";
        ctx.fillRect(0, 0, 1080, 1500);

        roundRect(
          ctx,
          55,
          55,
          970,
          1390,
          34,
          "#ffffff"
        );

        roundRect(
          ctx,
          55,
          55,
          970,
          245,
          34,
          "#171717"
        );

        ctx.fillStyle = "#ffffff";
        ctx.font =
          'bold 54px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText("기분좋은공간", 110, 145);

        ctx.fillStyle = "#d1d5db";
        ctx.font =
          '32px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText("인테리어필름 견적서", 110, 205);

        ctx.fillStyle = "#9ca3af";
        ctx.font =
          '23px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText("FEEL GOOD SPACE", 110, 255);

        let y = 370;

        ctx.fillStyle = "#111827";
        ctx.font =
          'bold 32px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText("고객 정보", 110, y);

        y += 60;

        ctx.fillStyle = "#374151";
        ctx.font =
          '28px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText(
          `고객명  ${lead.customer_name || "-"}`,
          110,
          y
        );

        y += 48;

        ctx.fillText(
          `연락처  ${lead.phone || "-"}`,
          110,
          y
        );

        y += 48;

        ctx.fillText(
          `지역  ${lead.region || "-"}`,
          110,
          y
        );

        y += 48;

        ctx.fillText(
          `견적일  ${new Date().toLocaleDateString("ko-KR")}`,
          110,
          y
        );

        y += 55;

        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(110, y);
        ctx.lineTo(970, y);
        ctx.stroke();

        y += 70;

        ctx.fillStyle = "#111827";
        ctx.font =
          'bold 32px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText("시공 내용", 110, y);

        y += 52;

        ctx.fillStyle = "#374151";
        ctx.font =
          '28px "Malgun Gothic","Noto Sans KR",sans-serif';

        const workLines = wrapCanvasText(
          ctx,
          workDetails,
          850
        ).slice(0, 5);

        for (const line of workLines) {
          ctx.fillText(line, 110, y);
          y += 42;
        }

        y += 28;

        ctx.fillStyle = "#111827";
        ctx.font =
          'bold 32px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText("사용 자재", 110, y);

        y += 52;

        ctx.fillStyle = "#374151";
        ctx.font =
          '28px "Malgun Gothic","Noto Sans KR",sans-serif';

        const materialLines = wrapCanvasText(
          ctx,
          quoteMaterial || "-",
          850
        ).slice(0, 3);

        for (const line of materialLines) {
          ctx.fillText(line, 110, y);
          y += 42;
        }

        y += 40;

        roundRect(
          ctx,
          100,
          y,
          880,
          190,
          25,
          "#fff7ed"
        );

        ctx.fillStyle = "#92400e";
        ctx.font =
          'bold 28px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText("최종 견적금액", 145, y + 60);

        ctx.fillStyle = "#111827";
        ctx.font =
          'bold 58px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText(
          `${priceNumber.toLocaleString("ko-KR")}원`,
          145,
          y + 135
        );

        y += 250;

        ctx.fillStyle = "#111827";
        ctx.font =
          'bold 30px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText("안내사항", 110, y);

        y += 48;

        ctx.fillStyle = "#4b5563";
        ctx.font =
          '25px "Malgun Gothic","Noto Sans KR",sans-serif';

        const noteLines = wrapCanvasText(
          ctx,
          quoteNote ||
            "현장 확인 결과에 따라 시공 범위 및 금액이 변경될 수 있습니다.",
          850
        ).slice(0, 4);

        for (const line of noteLines) {
          ctx.fillText(line, 110, y);
          y += 38;
        }

        ctx.fillStyle = "#9ca3af";
        ctx.font =
          '23px "Malgun Gothic","Noto Sans KR",sans-serif';

        ctx.fillText(
          "기분좋은공간 · 인테리어필름 전문",
          110,
          1380
        );

        const image = canvas.toDataURL(
          "image/jpeg",
          0.9
        );

        setQuoteImageUrl(image);

        setQuoteMessage(
          "✅ 견적서 이미지를 만들었습니다."
        );
      } catch (error) {
        console.error(error);
        setQuoteMessage(
          `❌ 견적 이미지 오류: ${error?.message || "실패"}`
        );
      }
    }

    return (
      <div
        style={{
          padding: "14px",
          marginTop: "12px",
          marginBottom: "12px",
          border: "1px solid #fde68a",
          borderRadius: "12px",
          background: "#fffbeb",
        }}
      >
        <div
          style={{
            fontSize: "17px",
            fontWeight: "bold",
            marginBottom: "5px",
          }}
        >
          🧾 최종 견적
        </div>

        <div
          style={{
            color: "#92400e",
            fontSize: "12px",
            lineHeight: 1.6,
            marginBottom: "12px",
          }}
        >
          AI 예상금액은 참고용입니다. 고객에게 전달할
          실제 확정금액과 시공내용을 직접 입력해주세요.
        </div>

        <label
          style={{
            display: "block",
            fontWeight: "bold",
            marginBottom: "5px",
          }}
        >
          최종 견적금액
        </label>

        <input
          value={price}
          inputMode="numeric"
          onChange={(e) =>
            setPrice(
              e.target.value.replace(/[^0-9]/g, "")
            )
          }
          placeholder="예: 850000"
          style={{
            ...inputStyle,
            marginBottom: "5px",
          }}
        />

        <div
          style={{
            color: "#2563eb",
            fontWeight: "bold",
            fontSize: "13px",
            marginBottom: "11px",
          }}
        >
          {price ? formatWon(Number(price)) : "금액을 입력해주세요."}
        </div>

        <label
          style={{
            display: "block",
            fontWeight: "bold",
            marginBottom: "5px",
          }}
        >
          시공내용
        </label>

        <textarea
          value={workDetails}
          onChange={(e) =>
            setWorkDetails(e.target.value)
          }
          rows={3}
          placeholder="예: 싱크대 상·하부장 인테리어필름 시공"
          style={{
            ...inputStyle,
            resize: "vertical",
            marginBottom: "10px",
          }}
        />

        <label
          style={{
            display: "block",
            fontWeight: "bold",
            marginBottom: "5px",
          }}
        >
          사용 자재
        </label>

        <input
          value={quoteMaterial}
          onChange={(e) =>
            setQuoteMaterial(e.target.value)
          }
          placeholder="예: 현대 L&C GS115 밀키화이트"
          style={{
            ...inputStyle,
            marginBottom: "10px",
          }}
        />

        <label
          style={{
            display: "block",
            fontWeight: "bold",
            marginBottom: "5px",
          }}
        >
          특이사항 / 안내
        </label>

        <textarea
          value={quoteNote}
          onChange={(e) =>
            setQuoteNote(e.target.value)
          }
          rows={3}
          placeholder="예: 현장 상태에 따라 추가비용이 발생할 수 있습니다."
          style={{
            ...inputStyle,
            resize: "vertical",
            marginBottom: "10px",
          }}
        />

        <button
          type="button"
          disabled={quoteSaving}
          onClick={saveFinalQuote}
          style={{
            ...primaryButtonStyle,
            background: "#92400e",
          }}
        >
          {quoteSaving
            ? "저장 중..."
            : "최종 견적 저장"}
        </button>

        <button
          type="button"
          onClick={generateQuoteImage}
          style={{
            ...primaryButtonStyle,
            background: "#2563eb",
            marginTop: "8px",
          }}
        >
          🖼️ 견적서 이미지 만들기
        </button>

        {quoteImageUrl && (
          <div style={{ marginTop: "13px" }}>
            <div
              style={{
                fontWeight: "bold",
                marginBottom: "7px",
              }}
            >
              견적서 미리보기
            </div>

            <img
              src={quoteImageUrl}
              alt="견적서"
              decoding="async"
              onClick={() =>
                setPreviewPhoto(quoteImageUrl)
              }
              style={{
                display: "block",
                width: "100%",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                cursor: "pointer",
              }}
            />

            <a
              href={quoteImageUrl}
              download={`기분좋은공간_견적서_${
                lead.customer_name || "고객"
              }.jpg`}
              style={{
                ...primaryButtonStyle,
                display: "block",
                textAlign: "center",
                textDecoration: "none",
                boxSizing: "border-box",
                background: "#16a34a",
                marginTop: "8px",
              }}
            >
              📥 견적서 이미지 저장
            </a>
          </div>
        )}

        {lead.quote_created_at && (
          <div
            style={{
              marginTop: "8px",
              color: "#6b7280",
              fontSize: "12px",
            }}
          >
            마지막 저장: {formatDate(lead.quote_created_at)}
          </div>
        )}

        {quoteMessage && (
          <div
            style={{
              marginTop: "9px",
              padding: "9px",
              background: "#ffffff",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            {quoteMessage}
          </div>
        )}
      </div>
    );
  }

  /* =========================
     사진 카드
  ========================= */

  function PhotoCard({ photo }) {
    const url = jobPhotoUrls[photo.id] || null;
    const isEditing = editingPhotoId === photo.id;
    const isLoading = loadingPhotoId === photo.id;

    return (
      <div
        style={{
          padding: "10px",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          background: "#f9fafb",
        }}
      >
        {url ? (
          <img
            src={url}
            alt={
              photo.photo_type === "before"
                ? "시공 전"
                : "시공 후"
            }
            loading="lazy"
            decoding="async"
            onClick={() => setPreviewPhoto(url)}
            style={{
              display: "block",
              width: "100%",
              height: "210px",
              objectFit: "cover",
              borderRadius: "9px",
              marginBottom: "8px",
              cursor: "pointer",
            }}
          />
        ) : (
          <div
            style={{
              padding: "20px 10px",
              marginBottom: "8px",
              textAlign: "center",
              background: "#e5e7eb",
              borderRadius: "9px",
            }}
          >
            <div
              style={{
                fontSize: "30px",
                marginBottom: "5px",
              }}
            >
              📷
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                lineHeight: 1.5,
                marginBottom: "8px",
              }}
            >
              트래픽 절약을 위해
              <br />
              사진을 자동 다운로드하지 않습니다.
            </div>

            <button
              type="button"
              disabled={isLoading}
              onClick={() =>
                loadSingleJobPhoto(photo)
              }
              style={secondaryButtonStyle}
            >
              {isLoading
                ? "불러오는 중..."
                : "사진 불러오기"}
            </button>
          </div>
        )}

        {!isEditing ? (
          <>
            <div
              style={{
                fontWeight: "bold",
                marginBottom: "4px",
              }}
            >
              {photo.photo_type === "before"
                ? "시공 전"
                : photo.photo_type === "after"
                ? "시공 후"
                : "사진"}
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginBottom: "5px",
              }}
            >
              {photo.category || "-"}
              {photo.sub_category
                ? ` · ${photo.sub_category}`
                : ""}
            </div>

            <div
              style={{
                fontSize: "13px",
                color: "#374151",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                marginBottom: "8px",
              }}
            >
              {photo.ai_description || "설명 없음"}
            </div>

            {Array.isArray(photo.ai_tags) &&
              photo.ai_tags.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px",
                    marginBottom: "8px",
                  }}
                >
                  {photo.ai_tags.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      style={{
                        padding: "3px 6px",
                        borderRadius: "999px",
                        background: "#e0e7ff",
                        color: "#3730a3",
                        fontSize: "10px",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

            {!url && (
              <button
                type="button"
                onClick={() =>
                  openJobPhotoPreview(photo)
                }
                style={{
                  ...secondaryButtonStyle,
                  marginBottom: "7px",
                  color: "#2563eb",
                }}
              >
                🔍 크게 보기
              </button>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  startPhotoEdit(photo)
                }
                style={secondaryButtonStyle}
              >
                정보 수정
              </button>

              <button
                type="button"
                onClick={() =>
                  deletePhoto(photo)
                }
                style={{
                  ...secondaryButtonStyle,
                  color: "#dc2626",
                  borderColor: "#fecaca",
                }}
              >
                사진 삭제
              </button>
            </div>
          </>
        ) : (
          <>
            <select
              value={editPhotoType}
              onChange={(e) =>
                setEditPhotoType(e.target.value)
              }
              style={{
                ...inputStyle,
                marginBottom: "7px",
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
              value={editPhotoCategory}
              onChange={(e) =>
                setEditPhotoCategory(e.target.value)
              }
              placeholder="시공 부위"
              style={{
                ...inputStyle,
                marginBottom: "7px",
              }}
            />

            <input
              value={editPhotoSubCategory}
              onChange={(e) =>
                setEditPhotoSubCategory(e.target.value)
              }
              placeholder="세부 부위"
              style={{
                ...inputStyle,
                marginBottom: "7px",
              }}
            />

            <textarea
              value={editPhotoDescription}
              onChange={(e) =>
                setEditPhotoDescription(e.target.value)
              }
              rows={5}
              placeholder="AI 설명"
              style={{
                ...inputStyle,
                resize: "vertical",
                marginBottom: "7px",
              }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px",
              }}
            >
              <button
                type="button"
                disabled={photoEditLoading}
                onClick={() =>
                  savePhotoEdit(photo)
                }
                style={primaryButtonStyle}
              >
                {photoEditLoading
                  ? "저장 중..."
                  : "저장"}
              </button>

              <button
                type="button"
                onClick={cancelPhotoEdit}
                style={secondaryButtonStyle}
              >
                취소
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* =========================
     페이지 수
  ========================= */

  const jobTotalPages = getTotalPages(
    jobTotal,
    JOB_PAGE_SIZE
  );

  const leadTotalPages = getTotalPages(
    leadTotal,
    LEAD_PAGE_SIZE
  );

  /* =========================
     메인 UI 시작
  ========================= */

  return (
    <main
      style={{
        maxWidth: "980px",
        margin: "0 auto",
        padding: "18px 12px 80px",
        minHeight: "100vh",
        boxSizing: "border-box",
        background: "#f3f4f6",
        color: "#111827",
      }}
    >
      <div style={{ marginBottom: "17px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "25px",
            fontWeight: "900",
          }}
        >
          기분좋은공간 관리자
        </h1>

        <div
          style={{
            marginTop: "5px",
            color: "#6b7280",
            fontSize: "13px",
          }}
        >
          시공 데이터 · AI 견적 · 고객 상담 관리
        </div>
      </div>

      {newLeadAlert && (
        <div
          style={{
            padding: "14px",
            marginBottom: "14px",
            borderRadius: "12px",
            background: "#fee2e2",
            border: "1px solid #fecaca",
          }}
        >
          <div
            style={{
              color: "#991b1b",
              fontWeight: "bold",
              marginBottom: "5px",
            }}
          >
            🔔 신규 상담이 들어왔습니다.
          </div>

          <div
            style={{
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            {newLeadAlert.customer_name || "고객"} ·{" "}
            {newLeadAlert.phone || "-"}
            <br />
            {newLeadAlert.region || "-"}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "7px",
              marginTop: "9px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setNewLeadAlert(null);
                changeTab("leads");

                if (typeof document !== "undefined") {
                  document.title =
                    "기분좋은공간 관리자";
                }
              }}
              style={{
                ...primaryButtonStyle,
                background: "#dc2626",
              }}
            >
              상담 확인
            </button>

            <button
              type="button"
              onClick={() =>
                setNewLeadAlert(null)
              }
              style={secondaryButtonStyle}
            >
              닫기
            </button>
          </div>
        </div>
      )}

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
          ["leads", `고객 상담${unreadCount ? ` (${unreadCount})` : ""}`],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => changeTab(value)}
            style={{
              padding: "12px 4px",
              borderRadius: "9px",
              border:
                activeTab === value
                  ? "1px solid #111827"
                  : "1px solid #d1d5db",
              background:
                activeTab === value
                  ? "#111827"
                  : "#ffffff",
              color:
                activeTab === value
                  ? "#ffffff"
                  : "#111827",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "register" && (
        <>
          <section style={sectionStyle}>
            <h2
              style={{
                marginTop: 0,
                fontSize: "20px",
              }}
            >
              📸 시공 데이터 등록
            </h2>

            <div
              style={{
                padding: "10px",
                marginBottom: "12px",
                borderRadius: "9px",
                background: "#ecfdf5",
                color: "#065f46",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              새 사진은 최대 1200px · JPEG 70%로 압축해서
              Storage 용량과 이후 이미지 트래픽을 줄입니다.
            </div>

            <label
              style={{
                display: "block",
                fontWeight: "bold",
                marginBottom: "5px",
              }}
            >
              시공 부위
            </label>

            <input
              value={category}
              onChange={(e) =>
                setCategory(e.target.value)
              }
              placeholder="예: 싱크대"
              style={{
                ...inputStyle,
                marginBottom: "10px",
              }}
            />

            <label
              style={{
                display: "block",
                fontWeight: "bold",
                marginBottom: "5px",
              }}
            >
              실제 시공금액
            </label>

            <input
              value={actualCost}
              inputMode="numeric"
              onChange={(e) =>
                setActualCost(
                  e.target.value.replace(/[^0-9]/g, "")
                )
              }
              placeholder="예: 850000"
              style={{
                ...inputStyle,
                marginBottom: "4px",
              }}
            />

            <div
              style={{
                color: "#2563eb",
                fontSize: "13px",
                fontWeight: "bold",
                marginBottom: "10px",
              }}
            >
              {actualCost
                ? formatWon(Number(actualCost))
                : "금액을 입력해주세요."}
            </div>

            <label
              style={{
                display: "block",
                fontWeight: "bold",
                marginBottom: "5px",
              }}
            >
              사용 자재
            </label>

            <input
              value={material}
              onChange={(e) =>
                setMaterial(e.target.value)
              }
              placeholder="예: GS115 밀키화이트"
              style={{
                ...inputStyle,
                marginBottom: "10px",
              }}
            />

            <label
              style={{
                display: "block",
                fontWeight: "bold",
                marginBottom: "5px",
              }}
            >
              메모
            </label>

            <textarea
              value={memo}
              onChange={(e) =>
                setMemo(e.target.value)
              }
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
                marginBottom: "11px",
              }}
            />

            <div
              style={{
                padding: "12px",
                marginBottom: "9px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
              }}
            >
              <strong>시공 전 사진</strong>

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) =>
                  setBeforeImages(
                    Array.from(e.target.files || [])
                  )
                }
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "8px",
                }}
              />

              {!!beforeImages.length && (
                <div
                  style={{
                    marginTop: "6px",
                    color: "#2563eb",
                    fontSize: "12px",
                  }}
                >
                  {beforeImages.length}장 선택
                </div>
              )}
            </div>

            <div
              style={{
                padding: "12px",
                marginBottom: "11px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
              }}
            >
              <strong>시공 후 사진</strong>

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) =>
                  setAfterImages(
                    Array.from(e.target.files || [])
                  )
                }
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "8px",
                }}
              />

              {!!afterImages.length && (
                <div
                  style={{
                    marginTop: "6px",
                    color: "#2563eb",
                    fontSize: "12px",
                  }}
                >
                  {afterImages.length}장 선택
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleSave}
              style={{
                ...primaryButtonStyle,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading
                ? "AI 분석 및 저장 중..."
                : "시공 데이터 저장"}
            </button>

            {message && (
              <div
                style={{
                  padding: "10px",
                  marginTop: "10px",
                  borderRadius: "9px",
                  background: "#f3f4f6",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {message}
              </div>
            )}
          </section>

          <section style={sectionStyle}>
            <h2
              style={{
                marginTop: 0,
                fontSize: "18px",
              }}
            >
              🤖 AI 유사도 설정
            </h2>

            <input
              type="range"
              min="0.3"
              max="0.95"
              step="0.01"
              value={similarityThreshold}
              onChange={(e) =>
                setSimilarityThreshold(
                  Number(e.target.value)
                )
              }
              style={{ width: "100%" }}
            />

            <div
              style={{
                textAlign: "center",
                fontSize: "20px",
                fontWeight: "bold",
                margin: "7px 0 11px",
              }}
            >
              {Math.round(similarityThreshold * 100)}%
            </div>

            <button
              type="button"
              disabled={settingLoading}
              onClick={saveSimilaritySetting}
              style={primaryButtonStyle}
            >
              {settingLoading
                ? "저장 중..."
                : "유사도 기준 저장"}
            </button>

            {settingMessage && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "13px",
                }}
              >
                {settingMessage}
              </div>
            )}
          </section>
        </>
      )}
      {/* =========================
          시공 DB
      ========================= */}

      {activeTab === "jobs" && (
        <>
          <section style={sectionStyle}>
            <h2 style={{ marginTop: 0, fontSize: "20px" }}>
              🗂️ 시공 데이터
            </h2>

            <div
              style={{
                display: "flex",
                gap: "7px",
                marginBottom: "10px",
              }}
            >
              <input
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchJobs();
                }}
                placeholder="시공 부위, 세부 부위, 메모 검색"
                style={{
                  ...inputStyle,
                  flex: 1,
                }}
              />

              <button
                type="button"
                onClick={searchJobs}
                style={{
                  ...primaryButtonStyle,
                  width: "75px",
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

            <div
              style={{
                padding: "10px",
                marginBottom: "12px",
                borderRadius: "9px",
                background: "#ecfdf5",
                color: "#065f46",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              💡 트래픽 절약 모드: 시공 목록과 상세정보를 열어도
              사진 원본은 자동으로 다운로드하지 않습니다.
            </div>

            {jobsMessage && (
              <div
                style={{
                  padding: "10px",
                  marginBottom: "10px",
                  borderRadius: "9px",
                  background: "#f3f4f6",
                  fontSize: "13px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {jobsMessage}
              </div>
            )}

            {jobsLoading ? (
              <div
                style={{
                  padding: "30px",
                  textAlign: "center",
                }}
              >
                불러오는 중...
              </div>
            ) : jobs.length === 0 ? (
              <div
                style={{
                  padding: "30px",
                  textAlign: "center",
                  color: "#6b7280",
                }}
              >
                등록된 시공 데이터가 없습니다.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "9px",
                }}
              >
                {jobs.map((job) => {
                  const isOpen = openJobId === job.id;
                  const photos = jobPhotos[job.id] || [];
                  const photosLoading =
                    jobPhotoLoadingId === job.id;

                  return (
                    <div
                      key={job.id}
                      style={{
                        padding: "13px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: "17px",
                              fontWeight: "bold",
                              marginBottom: "5px",
                            }}
                          >
                            {job.category || "시공 데이터"}
                          </div>

                          <div
                            style={{
                              fontSize: "13px",
                              color: "#4b5563",
                              lineHeight: 1.6,
                            }}
                          >
                            세부: {job.sub_category || "-"}
                            <br />
                            금액:{" "}
                            <strong>
                              {formatWon(job.actual_cost)}
                            </strong>
                            <br />
                            등록: {formatDate(job.created_at)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            toggleJobDetail(job.id)
                          }
                          style={{
                            ...secondaryButtonStyle,
                            width: "auto",
                            minWidth: "76px",
                          }}
                        >
                          {isOpen ? "닫기" : "상세"}
                        </button>
                      </div>

                      {isOpen && (
                        <div
                          style={{
                            marginTop: "13px",
                            paddingTop: "13px",
                            borderTop: "1px solid #e5e7eb",
                          }}
                        >
                          {editingId === job.id ? (
                            <div
                              style={{
                                padding: "12px",
                                borderRadius: "10px",
                                background: "#f9fafb",
                                marginBottom: "12px",
                              }}
                            >
                              <label
                                style={{
                                  display: "block",
                                  fontWeight: "bold",
                                  marginBottom: "5px",
                                }}
                              >
                                시공 부위
                              </label>

                              <input
                                value={editCategory}
                                onChange={(e) =>
                                  setEditCategory(
                                    e.target.value
                                  )
                                }
                                style={{
                                  ...inputStyle,
                                  marginBottom: "8px",
                                }}
                              />

                              <label
                                style={{
                                  display: "block",
                                  fontWeight: "bold",
                                  marginBottom: "5px",
                                }}
                              >
                                세부 부위
                              </label>

                              <input
                                value={editSubCategory}
                                onChange={(e) =>
                                  setEditSubCategory(
                                    e.target.value
                                  )
                                }
                                style={{
                                  ...inputStyle,
                                  marginBottom: "8px",
                                }}
                              />

                              <label
                                style={{
                                  display: "block",
                                  fontWeight: "bold",
                                  marginBottom: "5px",
                                }}
                              >
                                실제 시공금액
                              </label>

                              <input
                                value={editCost}
                                inputMode="numeric"
                                onChange={(e) =>
                                  setEditCost(
                                    e.target.value.replace(
                                      /[^0-9]/g,
                                      ""
                                    )
                                  )
                                }
                                style={{
                                  ...inputStyle,
                                  marginBottom: "8px",
                                }}
                              />

                              <label
                                style={{
                                  display: "block",
                                  fontWeight: "bold",
                                  marginBottom: "5px",
                                }}
                              >
                                메모
                              </label>

                              <textarea
                                value={editMemo}
                                onChange={(e) =>
                                  setEditMemo(e.target.value)
                                }
                                rows={4}
                                style={{
                                  ...inputStyle,
                                  resize: "vertical",
                                  marginBottom: "9px",
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
                                  onClick={() =>
                                    saveJobEdit(job.id)
                                  }
                                  style={primaryButtonStyle}
                                >
                                  수정 저장
                                </button>

                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  style={secondaryButtonStyle}
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div
                                style={{
                                  padding: "12px",
                                  borderRadius: "10px",
                                  background: "#f9fafb",
                                  marginBottom: "10px",
                                  fontSize: "13px",
                                  lineHeight: 1.7,
                                }}
                              >
                                <strong>시공 부위</strong>
                                <br />
                                {job.category || "-"}
                                <br />
                                <br />

                                <strong>세부 부위</strong>
                                <br />
                                {job.sub_category || "-"}
                                <br />
                                <br />

                                <strong>실제 시공금액</strong>
                                <br />
                                {formatWon(job.actual_cost)}
                                <br />
                                <br />

                                <strong>메모</strong>
                                <br />
                                <span
                                  style={{
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {job.memo || "-"}
                                </span>
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "1fr 1fr",
                                  gap: "7px",
                                  marginBottom: "13px",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    startEdit(job)
                                  }
                                  style={primaryButtonStyle}
                                >
                                  시공정보 수정
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteJob(job)
                                  }
                                  style={{
                                    ...secondaryButtonStyle,
                                    color: "#dc2626",
                                    borderColor: "#fecaca",
                                  }}
                                >
                                  시공 전체 삭제
                                </button>
                              </div>
                            </>
                          )}

                          <div
                            style={{
                              fontWeight: "bold",
                              fontSize: "16px",
                              marginBottom: "7px",
                            }}
                          >
                            📷 시공 사진
                          </div>

                          <div
                            style={{
                              padding: "9px",
                              marginBottom: "9px",
                              borderRadius: "9px",
                              background: "#eff6ff",
                              color: "#1e40af",
                              fontSize: "12px",
                              lineHeight: 1.6,
                            }}
                          >
                            사진 정보만 먼저 표시합니다.
                            <br />
                            <strong>사진 불러오기</strong>를
                            눌렀을 때 해당 사진 1장만
                            다운로드합니다.
                          </div>

                          {photosLoading ? (
                            <div
                              style={{
                                padding: "20px",
                                textAlign: "center",
                              }}
                            >
                              사진정보 불러오는 중...
                            </div>
                          ) : photos.length === 0 ? (
                            <div
                              style={{
                                padding: "20px",
                                textAlign: "center",
                                color: "#6b7280",
                              }}
                            >
                              등록된 사진이 없습니다.
                            </div>
                          ) : (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit,minmax(230px,1fr))",
                                gap: "9px",
                              }}
                            >
                              {photos.map((photo) => (
                                <PhotoCard
                                  key={photo.id}
                                  photo={photo}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {jobTotalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "14px",
                }}
              >
                <button
                  type="button"
                  disabled={jobPage <= 1}
                  onClick={() =>
                    loadJobs(
                      jobPage - 1,
                      jobSearchApplied
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    width: "auto",
                  }}
                >
                  이전
                </button>

                <div
                  style={{
                    minWidth: "70px",
                    textAlign: "center",
                    fontSize: "13px",
                    fontWeight: "bold",
                  }}
                >
                  {jobPage} / {jobTotalPages}
                </div>

                <button
                  type="button"
                  disabled={
                    jobPage >= jobTotalPages
                  }
                  onClick={() =>
                    loadJobs(
                      jobPage + 1,
                      jobSearchApplied
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    width: "auto",
                  }}
                >
                  다음
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* =========================
          고객 상담
      ========================= */}

      {activeTab === "leads" && (
        <section style={sectionStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "8px",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h2
              style={{
                margin: 0,
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
                width: "auto",
                fontSize: "12px",
              }}
            >
              {notificationEnabled
                ? "🔔 알림 등록됨"
                : "🔔 알림 등록"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              marginBottom: "12px",
            }}
          >
            {[
              ["all", "전체"],
              ["unread", "미확인"],
              ["read", "확인완료"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setLeadFilter(value);
                  loadLeads(1, value);
                }}
                style={{
                  padding: "8px 11px",
                  borderRadius: "999px",
                  border:
                    leadFilter === value
                      ? "1px solid #111827"
                      : "1px solid #d1d5db",
                  background:
                    leadFilter === value
                      ? "#111827"
                      : "#fff",
                  color:
                    leadFilter === value
                      ? "#fff"
                      : "#111827",
                  fontWeight: "bold",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                {label}
                {value === "unread" &&
                  unreadCount > 0 &&
                  ` (${unreadCount})`}
              </button>
            ))}
          </div>

          <div
            style={{
              padding: "10px",
              marginBottom: "12px",
              borderRadius: "9px",
              background: "#ecfdf5",
              color: "#065f46",
              fontSize: "12px",
              lineHeight: 1.6,
            }}
          >
            💡 고객사진도 상담 상세만 열었을 때는
            다운로드하지 않습니다. 필요한 상담에서
            사진 불러오기 버튼을 눌렀을 때만
            Supabase Storage를 사용합니다.
          </div>

          {leadsMessage && (
            <div
              style={{
                padding: "10px",
                marginBottom: "10px",
                borderRadius: "9px",
                background: "#f3f4f6",
                fontSize: "13px",
                whiteSpace: "pre-wrap",
              }}
            >
              {leadsMessage}
            </div>
          )}

          {leadsLoading ? (
            <div
              style={{
                padding: "30px",
                textAlign: "center",
              }}
            >
              상담내역 불러오는 중...
            </div>
          ) : leads.length === 0 ? (
            <div
              style={{
                padding: "30px",
                textAlign: "center",
                color: "#6b7280",
              }}
            >
              상담내역이 없습니다.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              {leads.map((lead) => {
                const isOpen =
                  openLeadId === lead.id;

                const photoPaths =
                  getLeadPhotoPaths(lead);

                const photoUrls =
                  leadPhotoUrls[lead.id] || [];

                const loadingLeadPhotos =
                  leadPhotoLoadingId === lead.id;

                return (
                  <div
                    key={lead.id}
                    style={{
                      padding: "13px",
                      border: lead.is_read
                        ? "1px solid #e5e7eb"
                        : "2px solid #ef4444",
                      borderRadius: "12px",
                      background: lead.is_read
                        ? "#fff"
                        : "#fff7f7",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        gap: "10px",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: "5px",
                            flexWrap: "wrap",
                            alignItems: "center",
                            marginBottom: "5px",
                          }}
                        >
                          <strong
                            style={{
                              fontSize: "17px",
                            }}
                          >
                            {lead.customer_name ||
                              "이름 없음"}
                          </strong>

                          {!lead.is_read && (
                            <span
                              style={{
                                padding: "3px 7px",
                                borderRadius: "999px",
                                background: "#dc2626",
                                color: "#fff",
                                fontSize: "10px",
                                fontWeight: "bold",
                              }}
                            >
                              NEW
                            </span>
                          )}

                          <span
                            style={{
                              padding: "3px 7px",
                              borderRadius: "999px",
                              background: "#e5e7eb",
                              fontSize: "10px",
                            }}
                          >
                            {lead.status || "new"}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: "13px",
                            lineHeight: 1.6,
                            color: "#4b5563",
                          }}
                        >
                          📱 {lead.phone || "-"}
                          <br />
                          📍 {lead.region || "-"}
                          <br />
                          🛠️ {lead.category || "-"}
                          <br />
                          🕐{" "}
                          {formatDate(
                            lead.created_at
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          toggleLeadDetail(lead)
                        }
                        style={{
                          ...secondaryButtonStyle,
                          width: "auto",
                          minWidth: "70px",
                        }}
                      >
                        {isOpen ? "닫기" : "상세"}
                      </button>
                    </div>

                    {isOpen && (
                      <div
                        style={{
                          marginTop: "13px",
                          paddingTop: "13px",
                          borderTop:
                            "1px solid #e5e7eb",
                        }}
                      >
                        <div
                          style={{
                            padding: "12px",
                            marginBottom: "11px",
                            borderRadius: "10px",
                            background: "#f9fafb",
                            fontSize: "13px",
                            lineHeight: 1.7,
                          }}
                        >
                          <strong>AI 분석</strong>
                          <br />
                          <span
                            style={{
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {lead.ai_description ||
                              "-"}
                          </span>

                          <br />
                          <br />

                          <strong>
                            AI 예상견적
                          </strong>
                          <br />

                          {lead.estimate_min != null &&
                          lead.estimate_max !=
                            null ? (
                            <>
                              {formatWon(
                                lead.estimate_min
                              )}
                              {" ~ "}
                              {formatWon(
                                lead.estimate_max
                              )}
                            </>
                          ) : (
                            "-"
                          )}

                          {lead.estimate_average !=
                            null && (
                            <>
                              <br />
                              평균:{" "}
                              <strong>
                                {formatWon(
                                  lead.estimate_average
                                )}
                              </strong>
                            </>
                          )}
                        </div>

                        {photoPaths.length > 0 && (
                          <div
                            style={{
                              marginBottom: "12px",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: "bold",
                                marginBottom: "7px",
                              }}
                            >
                              📷 고객사진{" "}
                              {photoPaths.length}장
                            </div>

                            {!photoUrls.length ? (
                              <div
                                style={{
                                  padding: "13px",
                                  borderRadius: "10px",
                                  background: "#eff6ff",
                                  textAlign: "center",
                                }}
                              >
                                <div
                                  style={{
                                    marginBottom: "8px",
                                    color: "#1e40af",
                                    fontSize: "12px",
                                    lineHeight: 1.6,
                                  }}
                                >
                                  사진을 자동으로
                                  다운로드하지 않아
                                  트래픽을 절약합니다.
                                </div>

                                <button
                                  type="button"
                                  disabled={
                                    loadingLeadPhotos
                                  }
                                  onClick={() =>
                                    loadLeadPhotos(
                                      lead
                                    )
                                  }
                                  style={
                                    secondaryButtonStyle
                                  }
                                >
                                  {loadingLeadPhotos
                                    ? "사진 불러오는 중..."
                                    : `고객사진 불러오기 (${photoPaths.length}장)`}
                                </button>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(2,1fr)",
                                  gap: "7px",
                                }}
                              >
                                {photoUrls.map(
                                  (url, index) => (
                                    <img
                                      key={`${lead.id}-${index}`}
                                      src={url}
                                      alt={`고객사진 ${
                                        index + 1
                                      }`}
                                      loading="lazy"
                                      decoding="async"
                                      onClick={() =>
                                        setPreviewPhoto(
                                          url
                                        )
                                      }
                                      style={{
                                        width: "100%",
                                        height: "150px",
                                        objectFit:
                                          "cover",
                                        borderRadius:
                                          "9px",
                                        cursor:
                                          "pointer",
                                        background:
                                          "#e5e7eb",
                                      }}
                                    />
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <label
                          style={{
                            display: "block",
                            fontWeight: "bold",
                            marginBottom: "5px",
                          }}
                        >
                          상담 상태
                        </label>

                        <select
                          value={
                            lead.status || "new"
                          }
                          onChange={(e) =>
                            updateLeadStatus(
                              lead.id,
                              e.target.value
                            )
                          }
                          style={{
                            ...inputStyle,
                            marginBottom: "9px",
                          }}
                        >
                          <option value="new">
                            신규
                          </option>
                          <option value="contacted">
                            연락완료
                          </option>
                          <option value="scheduled">
                            방문/시공예정
                          </option>
                          <option value="completed">
                            완료
                          </option>
                          <option value="cancelled">
                            취소
                          </option>
                        </select>

                        <label
                          style={{
                            display: "block",
                            fontWeight: "bold",
                            marginBottom: "5px",
                          }}
                        >
                          관리자 메모
                        </label>

                        <textarea
                          defaultValue={
                            lead.memo || ""
                          }
                          rows={3}
                          onBlur={(e) =>
                            updateLeadMemo(
                              lead.id,
                              e.target.value
                            )
                          }
                          placeholder="통화내용, 방문일정 등"
                          style={{
                            ...inputStyle,
                            resize: "vertical",
                            marginBottom: "10px",
                          }}
                        />

                        <LeadQuoteEditor
                          key={`quote-${lead.id}`}
                          lead={lead}
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
                            onClick={() =>
                              toggleLeadRead(lead)
                            }
                            style={
                              secondaryButtonStyle
                            }
                          >
                            {lead.is_read
                              ? "미확인으로 변경"
                              : "확인완료"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              deleteLead(lead)
                            }
                            style={{
                              ...secondaryButtonStyle,
                              color: "#dc2626",
                              borderColor:
                                "#fecaca",
                            }}
                          >
                            상담 삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {leadTotalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "8px",
                marginTop: "14px",
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
                style={{
                  ...secondaryButtonStyle,
                  width: "auto",
                }}
              >
                이전
              </button>

              <div
                style={{
                  minWidth: "70px",
                  textAlign: "center",
                  fontSize: "13px",
                  fontWeight: "bold",
                }}
              >
                {leadPage} / {leadTotalPages}
              </div>

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
                style={{
                  ...secondaryButtonStyle,
                  width: "auto",
                }}
              >
                다음
              </button>
            </div>
          )}
        </section>
      )}

      {/* =========================
          전체화면 사진
      ========================= */}

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
            onClick={() =>
              setPreviewPhoto(null)
            }
            style={{
              position: "fixed",
              top: "15px",
              right: "15px",
              zIndex: 10000,
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              border: 0,
              background: "#fff",
              color: "#111827",
              fontSize: "22px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            ×
          </button>

          <img
            src={previewPhoto}
            alt="사진 크게 보기"
            decoding="async"
            onClick={(e) =>
              e.stopPropagation()
            }
            style={{
              maxWidth: "100%",
              maxHeight: "92vh",
              objectFit: "contain",
              borderRadius: "10px",
            }}
          />
        </div>
      )}
    </main>
  );
                            }
