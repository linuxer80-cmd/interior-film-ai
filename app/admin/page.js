"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const JOB_PAGE_SIZE = 10;
const LEAD_PAGE_SIZE = 20;
const SIGNED_URL_SECONDS = 60 * 30;

const PROJECT_ID =
  "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

const STATUS_OPTIONS = [
  "신규문의",
  "상담중",
  "방문견적",
  "계약완료",
  "미계약",
];

export default function AdminPage() {
  /* =========================================================
     탭
  ========================================================= */

  const [activeTab, setActiveTab] = useState("jobs");
  const activeTabRef = useRef("jobs");

  /* =========================================================
     AI 설정
  ========================================================= */

  const [similarityThreshold, setSimilarityThreshold] =
    useState(0.65);

  const [settingMessage, setSettingMessage] = useState("");
  const [settingLoading, setSettingLoading] = useState(false);

  /* =========================================================
     시공 등록
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
  const [jobPhotoLoadingId, setJobPhotoLoadingId] =
    useState(null);

  const [jobPhotoUrls, setJobPhotoUrls] = useState({});
  const [loadingPhotoId, setLoadingPhotoId] =
    useState(null);

  /* =========================================================
     시공 수정
  ========================================================= */

  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] =
    useState("");
  const [editCost, setEditCost] = useState("");
  const [editMemo, setEditMemo] = useState("");

  /* =========================================================
     사진 수정
  ========================================================= */

  const [previewPhoto, setPreviewPhoto] = useState(null);

  const [editingPhotoId, setEditingPhotoId] =
    useState(null);

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
  const [leadPhotoLoadingId, setLeadPhotoLoadingId] =
    useState(null);

  const [newLeadAlert, setNewLeadAlert] = useState(null);

  const [
    notificationEnabled,
    setNotificationEnabled,
  ] = useState(false);

  /* =========================================================
     사용자 로그 분석
  ========================================================= */

  const [usageStats, setUsageStats] = useState({
    today: 0,
    sevenDays: 0,
    total: 0,
    sessions: 0,
    leads: 0,
    conversion: 0,
  });

  const [usageRecent, setUsageRecent] = useState([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageMessage, setUsageMessage] = useState("");

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
    fontSize: "15px",
    cursor: "pointer",
  };

  const secondaryButtonStyle = {
    width: "100%",
    padding: "11px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: "bold",
    cursor: "pointer",
  };

  /* =========================================================
     공통
  ========================================================= */

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

  function sanitizeSearchKeyword(value) {
    return String(value || "")
      .replace(/[,()]/g, " ")
      .trim();
  }

  function getLeadPhotoPaths(lead) {
    const paths = [];

    if (Array.isArray(lead?.customer_photo_paths)) {
      for (const path of lead.customer_photo_paths) {
        if (path && !paths.includes(path)) {
          paths.push(path);
        }
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

    if (tab === "usage") {
      loadUsageStats();
    }

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

  /* =========================================================
     신규상담 실시간
  ========================================================= */

  function handleRealtimeLead(lead) {
    setUnreadCount((current) => current + 1);

    setNewLeadAlert({
      id: lead.id,
      customer_name: lead.customer_name,
      phone: lead.phone,
      region: lead.region,
      created_at: lead.created_at,
    });

    if (typeof document !== "undefined") {
      document.title =
        "🔴 신규 상담 | 기분좋은공간";
    }

    try {
      navigator.vibrate?.([250, 120, 250]);
    } catch {}

    try {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification(
          "🔔 신규 상담이 들어왔습니다.",
          {
            body: `${lead.customer_name || "고객"} ${
              lead.phone || ""
            }`,
          }
        );
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
    try {
      if (!("Notification" in window)) {
        alert(
          "이 브라우저는 알림 기능을 지원하지 않습니다."
        );
        return;
      }

      const permission =
        await Notification.requestPermission();

      if (permission !== "granted") {
        setNotificationEnabled(false);
        alert("알림 권한을 허용해주세요.");
        return;
      }

      setNotificationEnabled(true);

      new Notification("기분좋은공간", {
        body: "신규 상담 알림이 활성화되었습니다.",
      });
    } catch (error) {
      console.error(error);

      alert(
        `알림 설정 오류: ${
          error?.message || "실패"
        }`
      );
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
        setSimilarityThreshold(
          Number(data.similarity_threshold)
        );
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
          similarity_threshold:
            Number(similarityThreshold),
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
      setSettingMessage(
        `❌ 설정 저장 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setSettingLoading(false);
    }
  }

  /* =========================================================
     사용자 로그 분석
  ========================================================= */

  async function loadUsageStats() {
    setUsageLoading(true);
    setUsageMessage("");

    try {
      const now = new Date();

      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).toISOString();

      const sevenStart = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const [
        todayRes,
        sevenRes,
        totalRes,
        leadRes,
        recentRes,
      ] = await Promise.all([
        supabase
          .from("estimate_usage")
          .select("id", {
            count: "exact",
            head: true,
          })
          .gte("created_at", todayStart),

        supabase
          .from("estimate_usage")
          .select("id", {
            count: "exact",
            head: true,
          })
          .gte("created_at", sevenStart),

        supabase
          .from("estimate_usage")
          .select("session_id", {
            count: "exact",
          }),

        supabase
          .from("customer_leads")
          .select("id", {
            count: "exact",
            head: true,
          }),

        supabase
          .from("estimate_usage")
          .select(
            `
            id,
            session_id,
            category,
            sub_category,
            photo_count,
            estimate_min,
            estimate_max,
            estimate_average,
            converted_to_lead,
            created_at
          `
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(30),
      ]);

      const firstError =
        todayRes.error ||
        sevenRes.error ||
        totalRes.error ||
        leadRes.error ||
        recentRes.error;

      if (firstError) throw firstError;

      const rows = totalRes.data || [];

      const sessions = new Set(
        rows
          .map((row) => row.session_id)
          .filter(Boolean)
      ).size;

      const total =
        totalRes.count || rows.length || 0;

      const leads = leadRes.count || 0;

      const conversion =
        total > 0
          ? Math.round((leads / total) * 1000) /
            10
          : 0;

      const recentConverted = (
        recentRes.data || []
      ).filter(
        (row) => row.converted_to_lead
      ).length;

      setUsageStats({
        today: todayRes.count || 0,
        sevenDays: sevenRes.count || 0,
        total,
        sessions,
        leads,
        conversion,
      });

      setUsageRecent(recentRes.data || []);

      if (recentConverted > 0) {
        setUsageMessage(
          `최근 30건 중 상세상담 전환 ${recentConverted}건`
        );
      }
    } catch (error) {
      console.error(
        "사용자 로그 통계 오류:",
        error
      );

      setUsageRecent([]);

      setUsageMessage(
        `⚠️ 사용자 로그를 불러오지 못했습니다. estimate_usage 테이블을 확인해주세요. ${
          error?.message || ""
        }`
      );
    } finally {
      setUsageLoading(false);
    }
  }

  /* =========================================================
     시공 DB
  ========================================================= */

  async function loadJobs(
    page = 1,
    keyword = jobSearchApplied
  ) {
    setJobsLoading(true);
    setJobsMessage("");

    try {
      const from =
        (page - 1) * JOB_PAGE_SIZE;

      const to =
        from + JOB_PAGE_SIZE - 1;

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
      setOpenJobId(null);
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
    const keyword =
      sanitizeSearchKeyword(jobSearch);

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
          `
          id,
          work_item_id,
          project_id,
          photo_type,
          category,
          sub_category,
          storage_path,
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

      setJobPhotos((current) => ({
        ...current,
        [workItemId]: data || [],
      }));
    } catch (error) {
      setJobsMessage(
        `❌ 사진정보 오류: ${
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

  async function loadSingleJobPhoto(photo) {
    if (!photo?.storage_path) return null;

    if (jobPhotoUrls[photo.id]) {
      return jobPhotoUrls[photo.id];
    }

    setLoadingPhotoId(photo.id);

    try {
      const { data, error } =
        await supabase.storage
          .from("work-photos")
          .createSignedUrl(
            photo.storage_path,
            SIGNED_URL_SECONDS
          );

      if (error) throw error;

      const url = data?.signedUrl;

      if (!url) {
        throw new Error(
          "사진 주소를 만들 수 없습니다."
        );
      }

      setJobPhotoUrls((current) => ({
        ...current,
        [photo.id]: url,
      }));

      return url;
    } catch (error) {
      setJobsMessage(
        `❌ 사진 오류: ${
          error?.message || "실패"
        }`
      );

      return null;
    } finally {
      setLoadingPhotoId(null);
    }
  }

  async function openJobPhoto(photo) {
    let url = jobPhotoUrls[photo.id];

    if (!url) {
      url = await loadSingleJobPhoto(photo);
    }

    if (url) {
      setPreviewPhoto(url);
    }
  }

  /* =========================================================
     시공 수정
  ========================================================= */

  function startEdit(job) {
    setEditingId(job.id);

    setEditCategory(
      job.category || ""
    );

    setEditSubCategory(
      job.sub_category ||
        job.category ||
        ""
    );

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
    const cost = Number(
      String(editCost).replace(/,/g, "")
    );

    if (!editCategory.trim()) {
      setJobsMessage(
        "⚠️ 시공 부위를 입력해주세요."
      );
      return;
    }

    if (
      !Number.isFinite(cost) ||
      cost <= 0
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

          actual_cost: cost,

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
      setJobsMessage(
        `❌ 수정 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  /* =========================================================
     임베딩
  ========================================================= */

  async function createEmbedding(text) {
    if (!String(text || "").trim()) {
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

    return result.embedding || null;
  }

  /* =========================================================
     사진정보 수정
  ========================================================= */

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
      let tags =
        Array.isArray(photo.ai_tags)
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

      const searchText = [
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
            : "시공 사진"
        }`,
        `사진 설명: ${editPhotoDescription.trim()}`,
        `특징: ${tags.join(", ")}`,
      ].join("\n");

      const embedding =
        await createEmbedding(
          searchText
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
      setJobsMessage(
        `❌ 사진 수정 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setPhotoEditLoading(false);
    }
  }

  async function deletePhoto(photo) {
    if (
      !window.confirm(
        "이 사진을 완전히 삭제하시겠습니까?"
      )
    ) {
      return;
    }

    try {
      if (photo.storage_path) {
        const { error } =
          await supabase.storage
            .from("work-photos")
            .remove([
              photo.storage_path,
            ]);

        if (error) {
          console.error(error);
        }
      }

      const { error } =
        await supabase
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

      setJobPhotoUrls(
        (current) => {
          const next = {
            ...current,
          };

          delete next[photo.id];

          return next;
        }
      );

      setJobsMessage(
        "✅ 사진이 삭제되었습니다."
      );
    } catch (error) {
      setJobsMessage(
        `❌ 사진 삭제 오류: ${
          error?.message || "실패"
        }`
      );
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
      const {
        data: photos,
        error: photosError,
      } = await supabase
        .from("work_photos")
        .select(
          "id,storage_path"
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

      if (paths.length) {
        const { error } =
          await supabase.storage
            .from("work-photos")
            .remove(paths);

        if (error) {
          console.error(error);
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

      const { error } =
        await supabase
          .from("work_items")
          .delete()
          .eq("id", job.id);

      if (error) throw error;

      setOpenJobId(null);

      setJobPhotos(
        (current) => {
          const next = {
            ...current,
          };

          delete next[job.id];

          return next;
        }
      );

      setJobsMessage(
        "✅ 시공건이 삭제되었습니다."
      );

      const targetPage =
        jobs.length === 1 &&
        jobPage > 1
          ? jobPage - 1
          : jobPage;

      await loadJobs(
        targetPage,
        jobSearchApplied
      );
    } catch (error) {
      setJobsMessage(
        `❌ 시공 삭제 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  /* =========================================================
     이미지 압축
     1200px / JPEG 70%
  ========================================================= */

  async function resizeImage(
    file,
    maxSize = 1200,
    quality = 0.7
  ) {
    return new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload = () => {
          const image =
            new Image();

          image.onload = () => {
            let width =
              image.naturalWidth ||
              image.width;

            let height =
              image.naturalHeight ||
              image.height;

            const longest =
              Math.max(
                width,
                height
              );

            if (
              longest > maxSize
            ) {
              const ratio =
                maxSize /
                longest;

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
            canvas.height =
              height;

            const ctx =
              canvas.getContext(
                "2d",
                {
                  alpha: false,
                }
              );

            if (!ctx) {
              reject(
                new Error(
                  "이미지 변환 실패"
                )
              );
              return;
            }

            ctx.fillStyle =
              "#ffffff";

            ctx.fillRect(
              0,
              0,
              width,
              height
            );

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
                      "사진 압축 실패"
                    )
                  );
                  return;
                }

                resolve(
                  new File(
                    [blob],
                    `${String(
                      file.name ||
                        "photo"
                    ).replace(
                      /\.[^.]+$/,
                      ""
                    )}.jpg`,
                    {
                      type:
                        "image/jpeg",
                    }
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
                "사진을 불러오지 못했습니다."
              )
            );

          image.src =
            reader.result;
        };

        reader.onerror = () =>
          reject(
            new Error(
              "사진 파일을 읽지 못했습니다."
            )
          );

        reader.readAsDataURL(
          file
        );
      }
    );
  }

  /* =========================================================
     SHA-256
  ========================================================= */

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
      new Uint8Array(
        hashBuffer
      )
    )
      .map((byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
      )
      .join("");
  }

  /* =========================================================
     AI 분석
  ========================================================= */

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
      "photo_type",
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

    let result = {};

    try {
      result =
        await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(
        result?.error ||
          "AI 사진 분석 실패"
      );
    }

    return {
      category:
        result?.category ||
        result?.analysis
          ?.category ||
        "",

      sub_category:
        result?.sub_category ||
        result?.subcategory ||
        result?.analysis
          ?.sub_category ||
        "",

      description:
        result?.description ||
        result?.ai_description ||
        result?.analysis
          ?.description ||
        "",

      tags:
        Array.isArray(
          result?.tags
        )
          ? result.tags
          : Array.isArray(
              result?.ai_tags
            )
          ? result.ai_tags
          : Array.isArray(
              result?.analysis
                ?.tags
            )
          ? result.analysis.tags
          : [],
    };
  }

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
            "before",
            file
          );
        }
      );

      afterFiles.forEach(
        (file) => {
          formData.append(
            "after",
            file
          );
        }
      );

      const response =
        await fetch(
          "/api/analyze",
          {
            method: "POST",
            body: formData,
          }
        );

      if (!response.ok) {
        return null;
      }

      const result =
        await response.json();

      return {
        description:
          result?.comparison ||
          result?.description ||
          result?.analysis
            ?.description ||
          "",
      };
    } catch (error) {
      console.error(
        "전후 비교:",
        error
      );

      return null;
    }
  }

  /* =========================================================
     시공사진 저장
     압축본 HASH = 실제 Storage 파일 HASH
  ========================================================= */

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
    const compressed =
      await resizeImage(
        file,
        1200,
        0.7
      );

    const imageHash =
      await getImageHash(
        compressed
      );

    /*
      고객문의 사진과 같다는 이유로
      과거 시공사진 등록을 막지 않는다.
      과거 시공 DB끼리만 중복검사.
    */

    const {
      data: duplicates,
      error: duplicateError,
    } = await supabase
      .from("work_photos")
      .select(
        "id,photo_type"
      )
      .eq(
        "image_hash",
        imageHash
      )
      .neq(
        "photo_type",
        "customer"
      )
      .limit(1);

    if (duplicateError) {
      throw duplicateError;
    }

    if (
      duplicates &&
      duplicates.length > 0
    ) {
      return {
        skipped: true,
        reason: "duplicate",
      };
    }

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

    if (
      photoType === "before"
    ) {
      tags.push("시공전");
    }

    if (
      photoType === "after"
    ) {
      tags.push("시공후");
    }

    if (comparison) {
      tags.push("전후비교");
    }

    tags = [...new Set(tags)];

    const finalCategory =
      categoryValue ||
      analysis?.category ||
      "기타";

    const finalSubCategory =
      subCategoryValue ||
      analysis?.sub_category ||
      finalCategory;

    const searchText = [
      `시공 부위: ${finalCategory}`,
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
      comparison?.description
        ? `전후 비교: ${comparison.description}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    let embedding = null;

    try {
      embedding =
        await createEmbedding(
          searchText
        );
    } catch (error) {
      console.error(
        "임베딩:",
        error
      );
    }

    const storagePath =
      `history/${projectId}/${workItemId}/${photoType}/${Date.now()}-${crypto.randomUUID()}.jpg`;

    const { error: uploadError } =
      await supabase.storage
        .from("work-photos")
        .upload(
          storagePath,
          compressed,
          {
            contentType:
              "image/jpeg",
            cacheControl:
              "3600",
            upsert: false,
          }
        );

    if (uploadError) {
      throw uploadError;
    }

    try {
      const { data: publicData } =
        supabase.storage
          .from("work-photos")
          .getPublicUrl(
            storagePath
          );

      const photoUrl =
        publicData?.publicUrl ||
        storagePath;

      const { error } =
        await supabase
          .from("work_photos")
          .insert({
            work_item_id:
              workItemId,

            project_id:
              projectId,

            photo_type:
              photoType,

            category:
              finalCategory,

            sub_category:
              finalSubCategory,

            storage_path:
              storagePath,

            photo_url:
              photoUrl,

            ai_description:
              description,

            ai_tags:
              tags,

            embedding,

            image_hash:
              imageHash,
          });

      if (error) throw error;

      return {
        skipped: false,
      };
    } catch (error) {
      try {
        await supabase.storage
          .from("work-photos")
          .remove([
            storagePath,
          ]);
      } catch {}

      throw error;
    }
  }

  /* =========================================================
     시공사례 등록
  ========================================================= */

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

    const cost = Number(
      String(
        actualCost
      ).replace(
        /,/g,
        ""
      )
    );

    if (
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      setMessage(
        "⚠️ 실제 시공금액을 정확히 입력해주세요."
      );
      return;
    }

    setLoading(true);

    setMessage(
      "시공 데이터를 생성하고 있습니다..."
    );

    let workItemId =
      null;

    try {
      const combinedMemo = [
        material.trim()
          ? `자재: ${material.trim()}`
          : "",
        memo.trim(),
      ]
        .filter(Boolean)
        .join("\n");

      const {
        data: workItem,
        error,
      } = await supabase
        .from("work_items")
        .insert({
          project_id:
            PROJECT_ID,

          category:
            category.trim(),

          sub_category:
            category.trim(),

          actual_cost:
            cost,

          memo:
            combinedMemo ||
            null,
        })
        .select()
        .single();

      if (error) throw error;

      workItemId =
        workItem.id;

      setMessage(
        "AI가 시공 전/후 사진을 비교하고 있습니다..."
      );

      const comparison =
        await compareMultipleBeforeAfter(
          beforeImages,
          afterImages
        );

      const allPhotos = [
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

      let saved = 0;
      let duplicate = 0;

      for (
        let index = 0;
        index <
        allPhotos.length;
        index++
      ) {
        const item =
          allPhotos[index];

        setMessage(
          `${
            item.type ===
            "before"
              ? "시공 전"
              : "시공 후"
          } 사진 ${
            index + 1
          }/${
            allPhotos.length
          } AI 분석 + 저장 중...`
        );

        let analysis = {};

        try {
          analysis =
            await analyzeImage(
              item.file,
              item.type
            );
        } catch (error) {
          console.error(
            "AI 분석:",
            error
          );
        }

        const result =
          await savePhoto({
            file:
              item.file,

            workItemId:
              workItem.id,

            projectId:
              PROJECT_ID,

            photoType:
              item.type,

            categoryValue:
              category.trim(),

            subCategoryValue:
              category.trim(),

            analysis,
            comparison,
          });

        if (result?.skipped) {
          duplicate++;
        } else {
          saved++;
        }
      }

      if (saved === 0) {
        await supabase
          .from("work_items")
          .delete()
          .eq(
            "id",
            workItem.id
          );

        workItemId = null;

        throw new Error(
          "선택한 사진이 모두 이미 시공 DB에 등록되어 있습니다."
        );
      }

      setBeforeImages([]);
      setAfterImages([]);
      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");

      setMessage(
        duplicate > 0
          ? `✅ 시공사례 저장 완료!\n사진 ${saved}장 저장 / 중복 ${duplicate}장 제외`
          : `✅ 시공사례 저장 완료!\n사진 ${saved}장 + AI 분석 + 임베딩 저장`
      );

      await loadJobs(
        1,
        ""
      );
    } catch (error) {
      console.error(error);

      if (workItemId) {
        try {
          const {
            count,
          } =
            await supabase
              .from(
                "work_photos"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .eq(
                "work_item_id",
                workItemId
              );

          if (!count) {
            await supabase
              .from(
                "work_items"
              )
              .delete()
              .eq(
                "id",
                workItemId
              );
          }
        } catch {}
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

  /* =========================================================
     고객 상담
  ========================================================= */

  async function loadUnreadCount() {
    try {
      const {
        count,
        error,
      } = await supabase
        .from(
          "customer_leads"
        )
        .select(
          "id",
          {
            count: "exact",
            head: true,
          }
        )
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

  async function loadLeads(
    page = 1,
    filter = leadFilter
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

      let query =
        supabase
          .from(
            "customer_leads"
          )
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
              count:
                "exact",
            }
          );

      if (
        filter ===
        "unread"
      ) {
        query =
          query.eq(
            "is_read",
            false
          );
      }

      if (
        filter ===
        "read"
      ) {
        query =
          query.eq(
            "is_read",
            true
          );
      }

      const {
        data,
        error,
        count,
      } = await query
        .order(
          "is_read",
          {
            ascending:
              true,
          }
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        )
        .range(
          from,
          to
        );

      if (error) throw error;

      setLeads(
        data || []
      );

      setLeadTotal(
        count || 0
      );

      setLeadPage(page);

      await loadUnreadCount();
    } catch (error) {
      setLeadsMessage(
        `❌ 상담목록 오류: ${
          error?.message ||
          "불러오기 실패"
        }`
      );
    } finally {
      setLeadsLoading(false);
    }
  }

  async function markLeadRead(
    lead
  ) {
    if (
      !lead ||
      lead.is_read
    ) {
      return;
    }

    try {
      const readAt =
        new Date().toISOString();

      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .update({
            is_read:
              true,

            read_at:
              readAt,
          })
          .eq(
            "id",
            lead.id
          );

      if (error) throw error;

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
                    read_at:
                      readAt,
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
    } catch (error) {
      console.error(error);
    }
  }

  async function markLeadUnread(
    lead
  ) {
    try {
      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .update({
            is_read:
              false,
            read_at:
              null,
          })
          .eq(
            "id",
            lead.id
          );

      if (error) throw error;

      setLeads(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              lead.id
                ? {
                    ...item,
                    is_read:
                      false,
                    read_at:
                      null,
                  }
                : item
          )
      );

      setUnreadCount(
        (current) =>
          current + 1
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 미확인 처리 오류: ${
          error?.message ||
          "실패"
        }`
      );
    }
  }

  async function toggleLeadDetail(
    lead
  ) {
    if (
      openLeadId ===
      lead.id
    ) {
      setOpenLeadId(null);
      return;
    }

    setOpenLeadId(
      lead.id
    );

    await markLeadRead(
      lead
    );

    /*
      중요:
      상세보기만 눌러서는 고객사진 다운로드 안 함.
      사진보기 버튼을 눌러야 signed URL 생성.
    */
  }

  async function loadLeadPhotos(
    lead
  ) {
    const paths =
      getLeadPhotoPaths(
        lead
      );

    if (
      paths.length === 0
    ) {
      return;
    }

    if (
      Array.isArray(
        leadPhotoUrls[
          lead.id
        ]
      )
    ) {
      return;
    }

    setLeadPhotoLoadingId(
      lead.id
    );

    try {
      const urls =
        await Promise.all(
          paths.map(
            async (
              path
            ) => {
              const {
                data,
                error,
              } =
                await supabase.storage
                  .from(
                    "work-photos"
                  )
                  .createSignedUrl(
                    path,
                    SIGNED_URL_SECONDS
                  );

              if (error) {
                console.error(
                  error
                );

                return null;
              }

              return (
                data?.signedUrl ||
                null
              );
            }
          )
        );

      setLeadPhotoUrls(
        (current) => ({
          ...current,
          [lead.id]:
            urls.filter(
              Boolean
            ),
        })
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 고객사진 오류: ${
          error?.message ||
          "실패"
        }`
      );
    } finally {
      setLeadPhotoLoadingId(
        null
      );
    }
  }

  async function updateLeadStatus(
    leadId,
    status
  ) {
    try {
      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .update({
            status,
          })
          .eq(
            "id",
            leadId
          );

      if (error) throw error;

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
                : lead
          )
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 상태 변경 오류: ${
          error?.message ||
          "실패"
        }`
      );
    }
  }

  async function saveLeadMemo(
    leadId,
    value
  ) {
    try {
      const finalMemo =
        String(
          value || ""
        ).trim();

      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .update({
            memo:
              finalMemo ||
              null,
          })
          .eq(
            "id",
            leadId
          );

      if (error) throw error;

      setLeads(
        (current) =>
          current.map(
            (lead) =>
              lead.id ===
              leadId
                ? {
                    ...lead,
                    memo:
                      finalMemo ||
                      null,
                  }
                : lead
          )
      );

      setLeadsMessage(
        "✅ 상담 메모가 저장되었습니다."
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 메모 저장 오류: ${
          error?.message ||
          "실패"
        }`
      );
    }
  }

  async function deleteLead(
    lead
  ) {
    if (
      !window.confirm(
        `${lead.customer_name || "고객"} 상담과 고객사진을 삭제하시겠습니까?`
      )
    ) {
      return;
    }

    try {
      const paths =
        getLeadPhotoPaths(
          lead
        );

      if (paths.length) {
        const { error } =
          await supabase.storage
            .from(
              "work-photos"
            )
            .remove(
              paths
            );

        if (error) {
          console.error(
            error
          );
        }
      }

      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .delete()
          .eq(
            "id",
            lead.id
          );

      if (error) throw error;

      setOpenLeadId(null);

      setLeadsMessage(
        "✅ 상담이 삭제되었습니다."
      );

      const targetPage =
        leads.length === 1 &&
        leadPage > 1
          ? leadPage - 1
          : leadPage;

      await loadLeads(
        targetPage,
        leadFilter
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 상담 삭제 오류: ${
          error?.message ||
          "실패"
        }`
      );
    }
  }

  /* =========================================================
     시공사진 카드
  ========================================================= */

  function PhotoCard({
    photo,
  }) {
    const url =
      jobPhotoUrls[
        photo.id
      ];

    const editing =
      editingPhotoId ===
      photo.id;

    return (
      <div
        style={{
          padding: "10px",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "10px",
          background:
            "#f9fafb",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            gap: "8px",
          }}
        >
          <strong>
            {photo.photo_type ===
            "before"
              ? "시공 전"
              : photo.photo_type ===
                "after"
              ? "시공 후"
              : "사진"}
          </strong>

          <span
            style={{
              fontSize:
                "11px",
              color:
                "#6b7280",
            }}
          >
            {photo.category ||
              "-"}
          </span>
        </div>

        {url ? (
          <img
            src={url}
            alt="시공사진"
            loading="lazy"
            decoding="async"
            onClick={() =>
              setPreviewPhoto(
                url
              )
            }
            style={{
              width:
                "100%",
              maxHeight:
                "320px",
              objectFit:
                "cover",
              borderRadius:
                "9px",
              marginTop:
                "8px",
              cursor:
                "pointer",
            }}
          />
        ) : (
          <button
            type="button"
            disabled={
              loadingPhotoId ===
              photo.id
            }
            onClick={() =>
              openJobPhoto(
                photo
              )
            }
            style={{
              ...secondaryButtonStyle,
              marginTop:
                "8px",
            }}
          >
            {loadingPhotoId ===
            photo.id
              ? "사진 불러오는 중..."
              : "📷 사진 보기"}
          </button>
        )}

        {!editing ? (
          <>
            <div
              style={{
                marginTop:
                  "8px",
                fontSize:
                  "12px",
                lineHeight:
                  1.6,
                whiteSpace:
                  "pre-wrap",
              }}
            >
              <strong>
                세부:
              </strong>{" "}
              {photo.sub_category ||
                "-"}
              <br />

              <strong>
                AI:
              </strong>{" "}
              {photo.ai_description ||
                "-"}
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "6px",
                marginTop:
                  "8px",
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
                  color:
                    "#dc2626",
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
              gap: "7px",
              marginTop:
                "8px",
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
              style={
                inputStyle
              }
            />

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
        )}
      </div>
    );
  }

  /* =========================================================
     최종 견적
  ========================================================= */

  function LeadQuoteEditor({
    lead,
  }) {
    const [price, setPrice] =
      useState(
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
      quoteMaterial,
      setQuoteMaterial,
    ] = useState(
      lead.quote_material ||
        ""
    );

    const [
      quoteNote,
      setQuoteNote,
    ] = useState(
      lead.quote_note ||
        ""
    );

    const [saving, setSaving] =
      useState(false);

    const [
      quoteMessage,
      setQuoteMessage,
    ] = useState("");

    async function saveFinalQuote() {
      const priceNumber =
        Number(
          String(
            price
          ).replace(
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
                quoteMaterial.trim() ||
                null,

              quote_note:
                quoteNote.trim() ||
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
                        quoteMaterial.trim() ||
                        null,

                      quote_note:
                        quoteNote.trim() ||
                        null,

                      quote_created_at:
                        now,
                    }
                  : item
            )
        );

        setQuoteMessage(
          "✅ 최종 견적이 저장되었습니다."
        );
      } catch (error) {
        setQuoteMessage(
          `❌ 견적 저장 오류: ${
            error?.message ||
            "실패"
          }`
        );
      } finally {
        setSaving(false);
      }
    }

    async function createQuoteImageBlob() {
      const priceNumber =
        Number(
          String(
            price
          ).replace(
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
        throw new Error(
          "최종 견적금액을 입력해주세요."
        );
      }

      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width = 1080;
      canvas.height = 1450;

      const ctx =
        canvas.getContext(
          "2d"
        );

      if (!ctx) {
        throw new Error(
          "견적 이미지 생성 실패"
        );
      }

      ctx.fillStyle =
        "#ffffff";

      ctx.fillRect(
        0,
        0,
        1080,
        1450
      );

      ctx.fillStyle =
        "#4b3621";

      ctx.fillRect(
        0,
        0,
        1080,
        190
      );

      ctx.fillStyle =
        "#ffffff";

      ctx.font =
        "bold 58px sans-serif";

      ctx.fillText(
        "기분좋은공간",
        70,
        90
      );

      ctx.font =
        "30px sans-serif";

      ctx.fillText(
        "인테리어필름 최종 견적서",
        70,
        145
      );

      ctx.fillStyle =
        "#111827";

      ctx.font =
        "bold 34px sans-serif";

      ctx.fillText(
        `고객명: ${
          lead.customer_name ||
          "-"
        }`,
        70,
        270
      );

      ctx.font =
        "28px sans-serif";

      ctx.fillText(
        `연락처: ${
          lead.phone ||
          "-"
        }`,
        70,
        325
      );

      ctx.fillText(
        `지역: ${
          lead.region ||
          "-"
        }`,
        70,
        375
      );

      ctx.fillStyle =
        "#111827";

      ctx.font =
        "bold 32px sans-serif";

      ctx.fillText(
        "시공 내용",
        70,
        470
      );

      ctx.font =
        "27px sans-serif";

      const details =
        workDetails
          .trim()
          .slice(
            0,
            70
          );

      ctx.fillText(
        details ||
          "-",
        70,
        520
      );

      if (
        quoteMaterial.trim()
      ) {
        ctx.fillText(
          `자재: ${quoteMaterial.trim().slice(
            0,
            60
          )}`,
          70,
          580
        );
      }

      ctx.fillStyle =
        "#f5f0e8";

      ctx.fillRect(
        60,
        650,
        960,
        170
      );

      ctx.fillStyle =
        "#4b3621";

      ctx.font =
        "bold 32px sans-serif";

      ctx.fillText(
        "최종 견적금액",
        90,
        710
      );

      ctx.font =
        "bold 54px sans-serif";

      ctx.fillText(
        `${priceNumber.toLocaleString(
          "ko-KR"
        )}원`,
        90,
        780
      );

      ctx.fillStyle =
        "#111827";

      ctx.font =
        "bold 30px sans-serif";

      ctx.fillText(
        "안내사항",
        70,
        910
      );

      ctx.font =
        "26px sans-serif";

      ctx.fillText(
        (
          quoteNote.trim() ||
          "현장 상태 및 추가 작업에 따라 금액이 달라질 수 있습니다."
        ).slice(
          0,
          75
        ),
        70,
        960
      );

      ctx.fillStyle =
        "#6b7280";

      ctx.font =
        "24px sans-serif";

      ctx.fillText(
        `견적일: ${new Date().toLocaleDateString(
          "ko-KR"
        )}`,
        70,
        1320
      );

      ctx.fillStyle =
        "#4b3621";

      ctx.font =
        "bold 28px sans-serif";

      ctx.fillText(
        "기분좋은공간 · 인테리어필름",
        70,
        1380
      );

      return await new Promise(
        (
          resolve,
          reject
        ) => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(
                  blob
                );
              } else {
                reject(
                  new Error(
                    "견적 이미지 생성 실패"
                  )
                );
              }
            },
            "image/jpeg",
            0.9
          );
        }
      );
    }

    async function shareQuoteImage() {
      try {
        const blob =
          await createQuoteImageBlob();

        const file =
          new File(
            [blob],
            `기분좋은공간-견적-${
              lead.customer_name ||
              "고객"
            }.jpg`,
            {
              type:
                "image/jpeg",
            }
          );

        if (
          navigator.share &&
          (!navigator.canShare ||
            navigator.canShare({
              files: [
                file,
              ],
            }))
        ) {
          await navigator.share({
            title:
              "기분좋은공간 최종 견적",

            text: `${
              lead.customer_name ||
              "고객"
            }님 최종 견적입니다.`,

            files: [
              file,
            ],
          });

          setQuoteMessage(
            "✅ 공유창을 열었습니다. 메시지를 선택해 전송해주세요."
          );
        } else {
          const url =
            URL.createObjectURL(
              blob
            );

          const link =
            document.createElement(
              "a"
            );

          link.href = url;
          link.download =
            file.name;

          link.click();

          setTimeout(
            () =>
              URL.revokeObjectURL(
                url
              ),
            1000
          );

          setQuoteMessage(
            "✅ 견적 이미지를 저장했습니다."
          );
        }
      } catch (error) {
        if (
          error?.name !==
          "AbortError"
        ) {
          setQuoteMessage(
            `❌ 견적 이미지 오류: ${
              error?.message ||
              "실패"
            }`
          );
        }
      }
    }

    return (
      <div
        style={{
          marginBottom:
            "14px",
          padding:
            "14px",
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
          AI 예상견적은 참고용입니다. 고객에게 보낼 확정 금액과 내용을 직접 입력해주세요.
        </div>

        <label>
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
          placeholder="최종 견적금액"
          style={{
            ...inputStyle,
            marginTop:
              "5px",
          }}
        />

        {price && (
          <div
            style={{
              marginTop:
                "5px",
              fontWeight:
                "bold",
              color:
                "#92400e",
            }}
          >
            {formatWon(
              price
            )}
          </div>
        )}

        <textarea
          value={
            workDetails
          }
          onChange={(e) =>
            setWorkDetails(
              e.target.value
            )
          }
          rows={4}
          placeholder="시공내용"
          style={{
            ...inputStyle,
            marginTop:
              "8px",
          }}
        />

        <input
          value={
            quoteMaterial
          }
          onChange={(e) =>
            setQuoteMaterial(
              e.target.value
            )
          }
          placeholder="사용 자재"
          style={{
            ...inputStyle,
            marginTop:
              "8px",
          }}
        />

        <textarea
          value={
            quoteNote
          }
          onChange={(e) =>
            setQuoteNote(
              e.target.value
            )
          }
          rows={3}
          placeholder="안내사항"
          style={{
            ...inputStyle,
            marginTop:
              "8px",
          }}
        />

        <button
          type="button"
          disabled={
            saving
          }
          onClick={
            saveFinalQuote
          }
          style={{
            ...primaryButtonStyle,
            marginTop:
              "9px",
            background:
              "#92400e",
          }}
        >
          {saving
            ? "저장 중..."
            : "최종 견적 저장"}
        </button>

        <button
          type="button"
          onClick={
            shareQuoteImage
          }
          style={{
            ...primaryButtonStyle,
            marginTop:
              "7px",
            background:
              "#16a34a",
          }}
        >
          📤 견적 이미지 만들기 / 고객에게 전송
        </button>

        {lead.quote_created_at && (
          <div
            style={{
              marginTop:
                "7px",
              fontSize:
                "12px",
              color:
                "#6b7280",
            }}
          >
            최근 저장:{" "}
            {formatDate(
              lead.quote_created_at
            )}
          </div>
        )}

        {quoteMessage && (
          <div
            style={{
              marginTop:
                "8px",
              fontSize:
                "13px",
              whiteSpace:
                "pre-wrap",
            }}
          >
            {quoteMessage}
          </div>
        )}
      </div>
    );
  }

  /* =========================================================
     페이지 계산
  ========================================================= */

  const jobTotalPages =
    Math.max(
      1,
      Math.ceil(
        jobTotal /
          JOB_PAGE_SIZE
      )
    );

  const leadTotalPages =
    Math.max(
      1,
      Math.ceil(
        leadTotal /
          LEAD_PAGE_SIZE
      )
    );

  /* =========================================================
     화면
  ========================================================= */

  return (
    <main
      style={{
        maxWidth:
          "900px",
        margin:
          "0 auto",
        padding:
          "14px",
        minHeight:
          "100vh",
        background:
          "#f3f4f6",
        color:
          "#111827",
      }}
    >
      <h1
        style={{
          margin:
            "4px 0 14px",
          fontSize:
            "25px",
        }}
      >
        기분좋은공간 관리자
      </h1>

      {/* 탭 */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(2,1fr)",
          gap: "6px",
          marginBottom:
            "15px",
        }}
      >
        {[
          [
            "jobs",
            "🗂️ 시공 DB",
          ],
          [
            "register",
            "📷 시공 등록",
          ],
          [
            "usage",
            "📊 로그 분석",
          ],
          [
            "leads",
            unreadCount
              ? `📞 고객 상담 (${unreadCount})`
              : "📞 고객 상담",
          ],
        ].map(
          ([
            tab,
            label,
          ]) => (
            <button
              key={tab}
              type="button"
              onClick={() =>
                changeTab(
                  tab
                )
              }
              style={{
                padding:
                  "12px 5px",
                borderRadius:
                  "9px",
                border: 0,
                fontWeight:
                  "bold",

                background:
                  activeTab ===
                  tab
                    ? "#111827"
                    : "#ffffff",

                color:
                  activeTab ===
                  tab
                    ? "#ffffff"
                    : "#111827",
              }}
            >
              {label}
            </button>
          )
        )}
      </div>

      {/* 신규 상담 알림 */}

      {newLeadAlert && (
        <section
          style={{
            ...sectionStyle,
            background:
              "#fef2f2",
            borderColor:
              "#fecaca",
          }}
        >
          <strong>
            🔔 신규 상담이 들어왔습니다.
          </strong>

          <div
            style={{
              marginTop:
                "6px",
              fontSize:
                "13px",
            }}
          >
            {newLeadAlert.customer_name ||
              "고객"}{" "}
            ·{" "}
            {newLeadAlert.phone ||
              "-"}
          </div>

          <button
            type="button"
            onClick={() => {
              setNewLeadAlert(
                null
              );

              changeTab(
                "leads"
              );
            }}
            style={{
              ...primaryButtonStyle,
              marginTop:
                "9px",
              background:
                "#dc2626",
            }}
          >
            상담 확인
          </button>
        </section>
      )}

      {/* =====================================================
          시공 DB
      ===================================================== */}

      {activeTab ===
        "jobs" && (
        <section
          style={
            sectionStyle
          }
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
            🗂️ 시공 DB
          </h2>

          <div
            style={{
              display:
                "flex",
              gap: "6px",
              marginBottom:
                "10px",
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
              placeholder="시공 부위 / 메모 검색"
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
                ...primaryButtonStyle,
                width:
                  "80px",
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

          {jobsMessage && (
            <div
              style={{
                marginBottom:
                  "10px",
                whiteSpace:
                  "pre-wrap",
                fontSize:
                  "13px",
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
                  "25px",
                textAlign:
                  "center",
                color:
                  "#6b7280",
              }}
            >
              등록된 시공 데이터가 없습니다.
            </div>
          ) : (
            jobs.map(
              (job) => {
                const isOpen =
                  openJobId ===
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
                      padding:
                        "12px",
                      marginBottom:
                        "9px",
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "11px",
                      background:
                        "#fff",
                    }}
                  >
                    <strong>
                      {job.category ||
                        "시공"}
                    </strong>

                    <div
                      style={{
                        marginTop:
                          "5px",
                        fontSize:
                          "13px",
                        lineHeight:
                          1.6,
                      }}
                    >
                      {job.sub_category ||
                        "-"}
                      <br />

                      {formatWon(
                        job.actual_cost
                      )}
                      <br />

                      {formatDate(
                        job.created_at
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        toggleJobDetail(
                          job.id
                        )
                      }
                      style={{
                        ...secondaryButtonStyle,
                        marginTop:
                          "8px",
                      }}
                    >
                      {isOpen
                        ? "닫기"
                        : "상세보기"}
                    </button>

                    {isOpen && (
                      <div
                        style={{
                          marginTop:
                            "12px",
                        }}
                      >
                        {editingId ===
                        job.id ? (
                          <>
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
                              placeholder="실제 시공금액"
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
                              rows={
                                3
                              }
                              placeholder="메모"
                              style={{
                                ...inputStyle,
                                marginBottom:
                                  "7px",
                              }}
                            />

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
                              style={{
                                ...secondaryButtonStyle,
                                marginTop:
                                  "6px",
                              }}
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <div
                              style={{
                                padding:
                                  "10px",
                                background:
                                  "#f9fafb",
                                borderRadius:
                                  "9px",
                                whiteSpace:
                                  "pre-wrap",
                                fontSize:
                                  "13px",
                              }}
                            >
                              메모:{" "}
                              {job.memo ||
                                "-"}
                            </div>

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
                                  "7px",
                              }}
                            >
                              시공정보 수정
                            </button>
                          </>
                        )}

                        <div
                          style={{
                            marginTop:
                              "13px",
                            fontWeight:
                              "bold",
                          }}
                        >
                          📷 시공사진
                        </div>

                        {jobPhotoLoadingId ===
                        job.id ? (
                          <div>
                            사진정보 불러오는 중...
                          </div>
                        ) : photos.length ? (
                          <div
                            style={{
                              display:
                                "grid",
                              gap:
                                "8px",
                              marginTop:
                                "8px",
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
                        ) : (
                          <div
                            style={{
                              marginTop:
                                "8px",
                              color:
                                "#6b7280",
                              fontSize:
                                "12px",
                            }}
                          >
                            사진이 없습니다.
                          </div>
                        )}

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
                              "12px",
                            color:
                              "#dc2626",
                          }}
                        >
                          시공 전체 삭제
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
            )
          )}

          {jobTotalPages >
            1 && (
            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "1fr auto 1fr",
                gap: "7px",
                alignItems:
                  "center",
                marginTop:
                  "12px",
              }}
            >
              <button
                type="button"
                disabled={
                  jobPage <= 1
                }
                onClick={() =>
                  loadJobs(
                    jobPage -
                      1,
                    jobSearchApplied
                  )
                }
                style={
                  secondaryButtonStyle
                }
              >
                이전
              </button>

              <strong>
                {jobPage}/
                {jobTotalPages}
              </strong>

              <button
                type="button"
                disabled={
                  jobPage >=
                  jobTotalPages
                }
                onClick={() =>
                  loadJobs(
                    jobPage +
                      1,
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
          )}
        </section>
      )}

      {/* =====================================================
          시공사례 등록 - 사진 먼저
      ===================================================== */}

      {activeTab ===
        "register" && (
        <section
          style={
            sectionStyle
          }
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
            📷 시공사례 등록
          </h2>

          <div
            style={{
              padding:
                "12px",
              background:
                "#eff6ff",
              color:
                "#1e3a8a",
              borderRadius:
                "10px",
              fontSize:
                "13px",
              marginBottom:
                "14px",
            }}
          >
            사진을 먼저 선택하고 아래에서 시공정보를 입력하세요.
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
            ① 시공 전 사진
          </label>

          <label
            htmlFor="before-images"
            style={{
              ...primaryButtonStyle,
              display:
                "block",
              textAlign:
                "center",
              boxSizing:
                "border-box",
              marginBottom:
                "6px",
            }}
          >
            📷 갤러리에서 시공 전 사진 선택
          </label>

          <input
            id="before-images"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              setBeforeImages(
                Array.from(
                  e.target.files ||
                    []
                )
              );

              e.target.value =
                "";
            }}
            style={{
              display:
                "none",
            }}
          />

          <div
            style={{
              marginBottom:
                "15px",
              color:
                beforeImages.length
                  ? "#16a34a"
                  : "#6b7280",
              fontWeight:
                beforeImages.length
                  ? "bold"
                  : "normal",
            }}
          >
            {beforeImages.length
              ? `✅ ${beforeImages.length}장 선택됨`
              : "선택된 시공 전 사진 없음"}
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
            ② 시공 후 사진
          </label>

          <label
            htmlFor="after-images"
            style={{
              ...primaryButtonStyle,
              display:
                "block",
              textAlign:
                "center",
              boxSizing:
                "border-box",
              marginBottom:
                "6px",
            }}
          >
            📷 갤러리에서 시공 후 사진 선택
          </label>

          <input
            id="after-images"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              setAfterImages(
                Array.from(
                  e.target.files ||
                    []
                )
              );

              e.target.value =
                "";
            }}
            style={{
              display:
                "none",
            }}
          />

          <div
            style={{
              marginBottom:
                "15px",
              color:
                afterImages.length
                  ? "#16a34a"
                  : "#6b7280",
              fontWeight:
                afterImages.length
                  ? "bold"
                  : "normal",
            }}
          >
            {afterImages.length
              ? `✅ ${afterImages.length}장 선택됨`
              : "선택된 시공 후 사진 없음"}
          </div>

          <label>
            <strong>
              ③ 시공 부위
            </strong>
          </label>

          <input
            value={
              category
            }
            onChange={(e) =>
              setCategory(
                e.target.value
              )
            }
            placeholder="예: 문·문틀 / 싱크대 / 중문 / 방화문"
            style={{
              ...inputStyle,
              marginTop:
                "6px",
              marginBottom:
                "11px",
            }}
          />

          <label>
            <strong>
              ④ 실제 시공금액
            </strong>
          </label>

          <input
            value={
              actualCost
            }
            inputMode="numeric"
            onChange={(e) =>
              setActualCost(
                e.target.value.replace(
                  /[^0-9]/g,
                  ""
                )
              )
            }
            placeholder="실제 시공금액"
            style={{
              ...inputStyle,
              marginTop:
                "6px",
            }}
          />

          {actualCost && (
            <div
              style={{
                margin:
                  "5px 0 11px",
                fontWeight:
                  "bold",
                color:
                  "#92400e",
              }}
            >
              {formatWon(
                actualCost
              )}
            </div>
          )}

          <label>
            <strong>
              ⑤ 사용 자재
            </strong>
          </label>

          <input
            value={
              material
            }
            onChange={(e) =>
              setMaterial(
                e.target.value
              )
            }
            placeholder="예: 현대L&C GS245"
            style={{
              ...inputStyle,
              marginTop:
                "6px",
              marginBottom:
                "11px",
            }}
          />

          <label>
            <strong>
              ⑥ 메모
            </strong>
          </label>

          <textarea
            value={memo}
            onChange={(e) =>
              setMemo(
                e.target.value
              )
            }
            rows={3}
            placeholder="현장 특징 / 참고사항"
            style={{
              ...inputStyle,
              marginTop:
                "6px",
              marginBottom:
                "11px",
            }}
          />

          <button
            type="button"
            disabled={
              loading
            }
            onClick={
              handleSave
            }
            style={{
              ...primaryButtonStyle,

              background:
                loading
                  ? "#9ca3af"
                  : "#111827",
            }}
          >
            {loading
              ? "AI 분석 + 저장 중..."
              : `⑦ 시공사례 저장 ${
                  beforeImages.length +
                  afterImages.length >
                0
                    ? `(${
                        beforeImages.length +
                        afterImages.length
                      }장)`
                    : ""
                }`}
          </button>

          {message && (
            <div
              style={{
                marginTop:
                  "10px",
                padding:
                  "10px",
                borderRadius:
                  "9px",
                background:
                  "#f9fafb",
                whiteSpace:
                  "pre-wrap",
                fontSize:
                  "13px",
              }}
            >
              {message}
            </div>
          )}

          <hr
            style={{
              border: 0,
              borderTop:
                "1px solid #e5e7eb",
              margin:
                "20px 0",
            }}
          />

          <strong>
            AI 유사도 기준
          </strong>

          <div
            style={{
              display:
                "flex",
              gap: "7px",
              marginTop:
                "7px",
            }}
          >
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={
                similarityThreshold
              }
              onChange={(e) =>
                setSimilarityThreshold(
                  e.target.value
                )
              }
              style={
                inputStyle
              }
            />

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
                width:
                  "100px",
              }}
            >
              저장
            </button>
          </div>

          {settingMessage && (
            <div
              style={{
                marginTop:
                  "7px",
                fontSize:
                  "12px",
              }}
            >
              {settingMessage}
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          사용자 로그 분석
      ===================================================== */}

      {activeTab ===
        "usage" && (
        <>
          <section
            style={
              sectionStyle
            }
          >
            <div
              style={{
                display:
                  "flex",
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
                      "0 0 5px",
                    fontSize:
                      "20px",
                  }}
                >
                  📊 사용자 로그 분석
                </h2>

                <div
                  style={{
                    fontSize:
                      "13px",
                    color:
                      "#6b7280",
                  }}
                >
                  자동견적 결과를 실제로 확인한 사용량을 기준으로 봅니다.
                </div>
              </div>

              <button
                type="button"
                onClick={
                  loadUsageStats
                }
                style={{
                  ...secondaryButtonStyle,
                  width:
                    "auto",
                }}
              >
                새로고침
              </button>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(2,minmax(0,1fr))",
                gap: "8px",
                marginTop:
                  "14px",
              }}
            >
              {[
                [
                  "오늘 자동견적",
                  usageStats.today,
                  "건",
                ],
                [
                  "최근 7일",
                  usageStats.sevenDays,
                  "건",
                ],
                [
                  "전체 자동견적",
                  usageStats.total,
                  "건",
                ],
                [
                  "예상 사용자",
                  usageStats.sessions,
                  "명",
                ],
                [
                  "상세 상담",
                  usageStats.leads,
                  "건",
                ],
                [
                  "상담 전환율",
                  usageStats.conversion,
                  "%",
                ],
              ].map(
                ([
                  label,
                  value,
                  unit,
                ]) => (
                  <div
                    key={
                      label
                    }
                    style={{
                      padding:
                        "14px",
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "12px",
                      background:
                        "#f9fafb",
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          "12px",
                        color:
                          "#6b7280",
                      }}
                    >
                      {label}
                    </div>

                    <div
                      style={{
                        fontSize:
                          "22px",
                        fontWeight:
                          "bold",
                        marginTop:
                          "5px",
                      }}
                    >
                      {Number(
                        value ||
                          0
                      ).toLocaleString(
                        "ko-KR"
                      )}
                      {unit}
                    </div>
                  </div>
                )
              )}
            </div>

            {usageMessage && (
              <div
                style={{
                  marginTop:
                    "10px",
                  fontSize:
                    "13px",
                  whiteSpace:
                    "pre-wrap",
                }}
              >
                {usageMessage}
              </div>
            )}
          </section>

          <section
            style={
              sectionStyle
            }
          >
            <h2
              style={{
                marginTop: 0,
                fontSize:
                  "18px",
              }}
            >
              최근 자동견적 실행
            </h2>

            {usageLoading ? (
              <div>
                불러오는 중...
              </div>
            ) : usageRecent.length ===
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
                아직 기록이 없거나 estimate_usage 테이블을 확인해야 합니다.
              </div>
            ) : (
              <div
                style={{
                  display:
                    "grid",
                  gap: "8px",
                }}
              >
                {usageRecent.map(
                  (item) => (
                    <div
                      key={
                        item.id
                      }
                      style={{
                        padding:
                          "12px",
                        border:
                          "1px solid #e5e7eb",
                        borderRadius:
                          "11px",
                      }}
                    >
                      <strong>
                        {item.category ||
                          "미분류"}

                        {item.sub_category
                          ? ` / ${item.sub_category}`
                          : ""}
                      </strong>

                      <div
                        style={{
                          marginTop:
                            "5px",
                          fontSize:
                            "13px",
                          lineHeight:
                            1.6,
                        }}
                      >
                        📷{" "}
                        {item.photo_count ||
                          0}
                        장
                        <br />

                        예상금액:{" "}
                        {formatWon(
                          item.estimate_average
                        )}
                        <br />

                        {item.converted_to_lead
                          ? "✅ 상세상담 전환"
                          : "자동견적만 확인"}
                        <br />

                        {formatDate(
                          item.created_at
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* =====================================================
          고객 상담
      ===================================================== */}

      {activeTab ===
        "leads" && (
        <section
          style={
            sectionStyle
          }
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
            📞 고객 상담
          </h2>

          <div
            style={{
              marginBottom:
                "10px",
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

          <button
            type="button"
            onClick={
              enableNotifications
            }
            style={{
              ...secondaryButtonStyle,
              marginBottom:
                "10px",
            }}
          >
            {notificationEnabled
              ? "🔔 상담 알림 활성화됨"
              : "🔔 이 휴대폰에 상담 알림 켜기"}
          </button>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(3,1fr)",
              gap: "5px",
              marginBottom:
                "10px",
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
                      "9px",
                    border: 0,
                    borderRadius:
                      "8px",

                    background:
                      leadFilter ===
                      value
                        ? "#111827"
                        : "#e5e7eb",

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

          {leadsMessage && (
            <div
              style={{
                marginBottom:
                  "10px",
                whiteSpace:
                  "pre-wrap",
                fontSize:
                  "13px",
              }}
            >
              {leadsMessage}
            </div>
          )}

          {leadsLoading ? (
            <div>
              불러오는 중...
            </div>
          ) : leads.length ===
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
              상담 내역이 없습니다.
            </div>
          ) : (
            leads.map(
              (lead) => {
                const isOpen =
                  openLeadId ===
                  lead.id;

                const paths =
                  getLeadPhotoPaths(
                    lead
                  );

                const photoUrls =
                  leadPhotoUrls[
                    lead.id
                  ] || [];

                return (
                  <div
                    key={
                      lead.id
                    }
                    style={{
                      padding:
                        "12px",
                      marginBottom:
                        "9px",

                      border:
                        lead.is_read
                          ? "1px solid #e5e7eb"
                          : "2px solid #ef4444",

                      borderRadius:
                        "11px",
                      background:
                        "#ffffff",
                    }}
                  >
                    <strong>
                      {lead.customer_name ||
                        "고객"}
                    </strong>

                    {!lead.is_read && (
                      <span
                        style={{
                          marginLeft:
                            "6px",
                          color:
                            "#dc2626",
                          fontSize:
                            "11px",
                          fontWeight:
                            "bold",
                        }}
                      >
                        NEW
                      </span>
                    )}

                    <div
                      style={{
                        marginTop:
                          "5px",
                        fontSize:
                          "13px",
                        lineHeight:
                          1.6,
                      }}
                    >
                      📱{" "}
                      {lead.phone ||
                        "-"}
                      <br />

                      📍{" "}
                      {lead.region ||
                        "-"}
                      <br />

                      🛠️{" "}
                      {lead.category ||
                        "-"}
                      <br />

                      AI 예상:{" "}
                      {lead.estimate_min !=
                        null &&
                      lead.estimate_max !=
                        null
                        ? `${formatWon(
                            lead.estimate_min
                          )} ~ ${formatWon(
                            lead.estimate_max
                          )}`
                        : "-"}
                    </div>

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
                          "8px",
                      }}
                    >
                      {isOpen
                        ? "닫기"
                        : "상세보기"}
                    </button>

                    {isOpen && (
                      <div
                        style={{
                          marginTop:
                            "12px",
                        }}
                      >
                        {/* 고객사진 */}

                        <div
                          style={{
                            marginBottom:
                              "14px",
                          }}
                        >
                          <strong>
                            📷 고객사진
                          </strong>

                          {paths.length ===
                          0 ? (
                            <div
                              style={{
                                marginTop:
                                  "7px",
                                padding:
                                  "12px",
                                background:
                                  "#f3f4f6",
                                borderRadius:
                                  "9px",
                                color:
                                  "#6b7280",
                              }}
                            >
                              저장된 고객사진이 없습니다.
                            </div>
                          ) : photoUrls.length ===
                            0 ? (
                            <button
                              type="button"
                              disabled={
                                leadPhotoLoadingId ===
                                lead.id
                              }
                              onClick={() =>
                                loadLeadPhotos(
                                  lead
                                )
                              }
                              style={{
                                ...secondaryButtonStyle,
                                marginTop:
                                  "7px",
                              }}
                            >
                              {leadPhotoLoadingId ===
                              lead.id
                                ? "사진 불러오는 중..."
                                : `📷 고객사진 ${paths.length}장 보기`}
                            </button>
                          ) : (
                            <div
                              style={{
                                display:
                                  "grid",
                                gridTemplateColumns:
                                  "repeat(2,minmax(0,1fr))",
                                gap:
                                  "7px",
                                marginTop:
                                  "7px",
                              }}
                            >
                              {photoUrls.map(
                                (
                                  url,
                                  index
                                ) => (
                                  <img
                                    key={
                                      index
                                    }
                                    src={
                                      url
                                    }
                                    alt={`고객사진 ${
                                      index +
                                      1
                                    }`}
                                    loading="lazy"
                                    decoding="async"
                                    onClick={() =>
                                      setPreviewPhoto(
                                        url
                                      )
                                    }
                                    style={{
                                      width:
                                        "100%",
                                      aspectRatio:
                                        "1 / 1",
                                      objectFit:
                                        "cover",
                                      borderRadius:
                                        "9px",
                                    }}
                                  />
                                )
                              )}
                            </div>
                          )}
                        </div>

                        {/* AI 분석 */}

                        <div
                          style={{
                            padding:
                              "11px",
                            background:
                              "#f9fafb",
                            borderRadius:
                              "9px",
                            whiteSpace:
                              "pre-wrap",
                            fontSize:
                              "13px",
                            marginBottom:
                              "12px",
                          }}
                        >
                          <strong>
                            🤖 AI 분석
                          </strong>
                          <br />

                          {lead.ai_description ||
                            "AI 분석 내용이 없습니다."}
                        </div>

                        {/* 최종 견적 */}

                        <LeadQuoteEditor
                          lead={
                            lead
                          }
                        />

                        {/* 상담 상태 */}

                        <label>
                          <strong>
                            상담 상태
                          </strong>
                        </label>

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
                              "6px",
                          }}
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
                                {option}
                              </option>
                            )
                          )}
                        </select>

                        <textarea
                          defaultValue={
                            lead.memo ||
                            ""
                          }
                          onBlur={(e) =>
                            saveLeadMemo(
                              lead.id,
                              e
                                .target
                                .value
                            )
                          }
                          rows={3}
                          placeholder="관리자 메모"
                          style={{
                            ...inputStyle,
                            marginTop:
                              "8px",
                          }}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            lead.is_read
                              ? markLeadUnread(
                                  lead
                                )
                              : markLeadRead(
                                  lead
                                )
                          }
                          style={{
                            ...secondaryButtonStyle,
                            marginTop:
                              "8px",
                          }}
                        >
                          {lead.is_read
                            ? "다시 미확인으로 표시"
                            : "확인 처리"}
                        </button>

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
                              "#dc2626",
                          }}
                        >
                          상담 삭제
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
            )
          )}

          {leadTotalPages >
            1 && (
            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "1fr auto 1fr",
                gap: "7px",
                alignItems:
                  "center",
                marginTop:
                  "12px",
              }}
            >
              <button
                type="button"
                disabled={
                  leadPage <= 1
                }
                onClick={() =>
                  loadLeads(
                    leadPage -
                      1,
                    leadFilter
                  )
                }
                style={
                  secondaryButtonStyle
                }
              >
                이전
              </button>

              <strong>
                {leadPage}/
                {leadTotalPages}
              </strong>

              <button
                type="button"
                disabled={
                  leadPage >=
                  leadTotalPages
                }
                onClick={() =>
                  loadLeads(
                    leadPage +
                      1,
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
          )}
        </section>
      )}

      {/* =====================================================
          사진 크게보기
      ===================================================== */}

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
            zIndex:
              9999,
            background:
              "rgba(0,0,0,.92)",
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
              top:
                "18px",
              right:
                "18px",
              width:
                "45px",
              height:
                "45px",
              borderRadius:
                "50%",
              border: 0,
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
            }}
          />
        </div>
      )}
    </main>
  );
      }
