"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const JOB_PAGE_SIZE = 10;
const LEAD_PAGE_SIZE = 20;
const SIGNED_URL_SECONDS = 60 * 30;

const PROJECT_ID = "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

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

  const [similarityThreshold, setSimilarityThreshold] = useState(0.65);
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
     사용자 로그 분석
  ========================================================= */

  const [usageStats, setUsageStats] = useState({
    today: 0,
    sevenDays: 0,
    total: 0,
    sessions: 0,
    leads: 0,
    converted: 0,
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
     공통 함수
  ========================================================= */

  function formatWon(value) {
    if (value === null || value === undefined || value === "") {
      return "-";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "-";
    }

    return `${number.toLocaleString("ko-KR")}원`;
  }

  function formatDate(value) {
    if (!value) return "-";

    try {
      return new Date(value).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
      });
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
     신규 상담 실시간 알림
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
    try {
      if (!("Notification" in window)) {
        alert("이 브라우저는 알림 기능을 지원하지 않습니다.");
        return;
      }

      const permission = await Notification.requestPermission();

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

      alert(`알림 설정 오류: ${error?.message || "실패"}`);
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
      const threshold = Number(similarityThreshold);

      if (
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        threshold > 1
      ) {
        throw new Error("유사도 기준은 0~1 사이 숫자로 입력해주세요.");
      }

      const { error } = await supabase
        .from("app_settings")
        .update({
          similarity_threshold: threshold,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;

      setSettingMessage(
        `✅ AI 유사도 기준 ${Math.round(threshold * 100)}% 저장 완료`
      );
    } catch (error) {
      setSettingMessage(
        `❌ 설정 저장 오류: ${error?.message || "실패"}`
      );
    } finally {
      setSettingLoading(false);
    }
  }

  /* =========================================================
     사용자 로그 분석
     실제 estimate_usage 테이블 기준
  ========================================================= */

  async function loadUsageStats() {
    setUsageLoading(true);
    setUsageMessage("");

    try {
      /*
        실제 estimate_usage 컬럼

        id
        session_id
        category
        sub_category
        photo_count
        estimate_min
        estimate_max
        estimate_average
        converted_to_lead
        created_at
      */

      const [
        usageResult,
        leadResult,
      ] = await Promise.all([
        supabase
          .from("estimate_usage")
          .select(`
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
          `)
          .order("created_at", {
            ascending: false,
          })
          .limit(5000),

        supabase
          .from("customer_leads")
          .select("id", {
            count: "exact",
            head: true,
          }),
      ]);

      if (usageResult.error) {
        console.error(
          "estimate_usage 조회 오류:",
          usageResult.error
        );

        throw new Error(
          `estimate_usage 조회 실패: ${
            usageResult.error.message || "RLS/SELECT 권한을 확인해주세요."
          }`
        );
      }

      if (leadResult.error) {
        console.error(
          "customer_leads 조회 오류:",
          leadResult.error
        );

        throw leadResult.error;
      }

      const rows = Array.isArray(usageResult.data)
        ? usageResult.data
        : [];

      /*
        한국시간 오늘 00:00 계산
      */

      const now = new Date();

      const kstFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const parts = kstFormatter.formatToParts(now);

      const year = parts.find((part) => part.type === "year")?.value;
      const month = parts.find((part) => part.type === "month")?.value;
      const day = parts.find((part) => part.type === "day")?.value;

      const todayStart = new Date(
        `${year}-${month}-${day}T00:00:00+09:00`
      );

      /*
        오늘 포함 최근 7일
      */

      const sevenDaysStart = new Date(
        todayStart.getTime() -
          6 * 24 * 60 * 60 * 1000
      );

      const todayCount = rows.filter((row) => {
        if (!row.created_at) return false;

        const createdAt = new Date(row.created_at);

        return (
          !Number.isNaN(createdAt.getTime()) &&
          createdAt >= todayStart
        );
      }).length;

      const sevenDaysCount = rows.filter((row) => {
        if (!row.created_at) return false;

        const createdAt = new Date(row.created_at);

        return (
          !Number.isNaN(createdAt.getTime()) &&
          createdAt >= sevenDaysStart
        );
      }).length;

      /*
        session_id 중복 제거
      */

      const sessionIds = new Set();

      for (const row of rows) {
        const sessionId = String(row.session_id || "").trim();

        if (sessionId) {
          sessionIds.add(sessionId);
        }
      }

      /*
        실제 자동견적 → 상세상담 전환

        customer_leads 전체 개수를 전환율 계산에 사용하지 않는다.

        estimate_usage.converted_to_lead === true
        인 로그만 전환으로 계산한다.
      */

      const convertedCount = rows.filter(
        (row) => row.converted_to_lead === true
      ).length;

      const total = rows.length;

      const conversion =
        total > 0
          ? Math.round((convertedCount / total) * 1000) / 10
          : 0;

      setUsageStats({
        today: todayCount,
        sevenDays: sevenDaysCount,
        total,
        sessions: sessionIds.size,
        leads: leadResult.count || 0,
        converted: convertedCount,
        conversion,
      });

      /*
        최근 실행 30건만 화면 표시
      */

      setUsageRecent(rows.slice(0, 30));

      if (rows.length === 0) {
        setUsageMessage(
          "⚠️ estimate_usage 조회는 성공했지만 현재 로그인 계정에서 보이는 로그가 0건입니다. 실제 테이블에 데이터가 있다면 RLS SELECT 정책을 확인해야 합니다."
        );
      } else {
        setUsageMessage(
          `✅ 자동견적 로그 ${rows.length.toLocaleString(
            "ko-KR"
          )}건 확인 · 상세상담 전환표시 ${convertedCount.toLocaleString(
            "ko-KR"
          )}건`
        );
      }
    } catch (error) {
      console.error("사용자 로그 통계 오류:", error);

      setUsageStats({
        today: 0,
        sevenDays: 0,
        total: 0,
        sessions: 0,
        leads: 0,
        converted: 0,
        conversion: 0,
      });

      setUsageRecent([]);

      setUsageMessage(
        `❌ 사용자 로그 조회 오류\n${
          error?.message || "estimate_usage 조회에 실패했습니다."
        }\n\nSupabase의 estimate_usage RLS/SELECT 권한을 확인해주세요.`
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
      const from = (page - 1) * JOB_PAGE_SIZE;
      const to = from + JOB_PAGE_SIZE - 1;

      const safeKeyword = sanitizeSearchKeyword(keyword);

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

      const { data, error, count } = await query
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
        `❌ 시공 DB 오류: ${error?.message || "불러오기 실패"}`
      );
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
        .select(`
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
        `)
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
        `❌ 사진정보 오류: ${error?.message || "실패"}`
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
      const { data, error } = await supabase.storage
        .from("work-photos")
        .createSignedUrl(
          photo.storage_path,
          SIGNED_URL_SECONDS
        );

      if (error) throw error;

      const url = data?.signedUrl;

      if (!url) {
        throw new Error("사진 주소를 만들 수 없습니다.");
      }

      setJobPhotoUrls((current) => ({
        ...current,
        [photo.id]: url,
      }));

      return url;
    } catch (error) {
      setJobsMessage(
        `❌ 사진 오류: ${error?.message || "실패"}`
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

    setEditCategory(job.category || "");

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

          sub_category:
            editSubCategory.trim() ||
            editCategory.trim(),

          actual_cost: cost,

          memo:
            editMemo.trim() ||
            null,

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
        `❌ 수정 오류: ${error?.message || "실패"}`
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

    const response = await fetch("/api/embedding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
      }),
    });

    let result = {};

    try {
      result = await response.json();
    } catch {}

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

      const embedding = await createEmbedding(
        searchText
      );

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
      setJobsMessage(
        `❌ 사진 수정 오류: ${error?.message || "실패"}`
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
        const { error } = await supabase.storage
          .from("work-photos")
          .remove([photo.storage_path]);

        if (error) {
          console.error(error);
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
          (item) =>
            item.id !== photo.id
        ),
      }));

      setJobPhotoUrls((current) => {
        const next = {
          ...current,
        };

        delete next[photo.id];

        return next;
      });

      setJobsMessage(
        "✅ 사진이 삭제되었습니다."
      );
    } catch (error) {
      setJobsMessage(
        `❌ 사진 삭제 오류: ${error?.message || "실패"}`
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
        .select("id,storage_path")
        .eq("work_item_id", job.id);

      if (photosError) {
        throw photosError;
      }

      const paths = (photos || [])
        .map(
          (photo) =>
            photo.storage_path
        )
        .filter(Boolean);

      if (paths.length) {
        const { error } = await supabase.storage
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
        const next = {
          ...current,
        };

        delete next[job.id];

        return next;
      });

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
        `❌ 시공 삭제 오류: ${error?.message || "실패"}`
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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          let width =
            image.naturalWidth ||
            image.width;

          let height =
            image.naturalHeight ||
            image.height;

          const longest = Math.max(
            width,
            height
          );

          if (longest > maxSize) {
            const ratio =
              maxSize / longest;

            width = Math.round(
              width * ratio
            );

            height = Math.round(
              height * ratio
            );
          }

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext(
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

          ctx.fillStyle = "#ffffff";

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

        image.src = reader.result;
      };

      reader.onerror = () =>
        reject(
          new Error(
            "사진 파일을 읽지 못했습니다."
          )
        );

      reader.readAsDataURL(file);
    });
  }

  /* =========================================================
     SHA-256
  ========================================================= */

  async function getImageHash(file) {
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

  /* =========================================================
     AI 분석
  ========================================================= */

  async function analyzeImage(
    file,
    photoType
  ) {
    const formData = new FormData();

    formData.append(
      "image",
      file
    );

    formData.append(
      "photo_type",
      photoType
    );

    const response = await fetch(
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
        result?.analysis?.category ||
        "",

      sub_category:
        result?.sub_category ||
        result?.subcategory ||
        result?.analysis?.sub_category ||
        "",

      description:
        result?.description ||
        result?.ai_description ||
        result?.analysis?.description ||
        "",

      tags:
        Array.isArray(result?.tags)
          ? result.tags
          : Array.isArray(result?.ai_tags)
          ? result.ai_tags
          : Array.isArray(
              result?.analysis?.tags
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
      const formData = new FormData();

      beforeFiles.forEach((file) => {
        formData.append(
          "before",
          file
        );
      });

      afterFiles.forEach((file) => {
        formData.append(
          "after",
          file
        );
      });

      const response = await fetch(
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
          result?.analysis?.description ||
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

     중요:
     1. 사진을 먼저 1200px / JPEG 70%로 압축
     2. 실제 저장될 압축파일 기준 SHA-256 생성
     3. 고객사진은 중복검사 대상에서 제외
     4. 과거 시공 DB끼리만 중복검사
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
      photo_type = customer 는 제외.

      NULL photo_type도 과거 시공 데이터일 수 있으므로
      neq만 사용하지 않고 OR 조건 사용.
    */

    const {
      data: duplicates,
      error: duplicateError,
    } = await supabase
      .from("work_photos")
      .select("id,photo_type")
      .eq("image_hash", imageHash)
      .or(
        "photo_type.is.null,photo_type.neq.customer"
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
      /*
        photo_url 컬럼이 NOT NULL이므로
        private bucket이어도 문자열 값은 반드시 저장.
      */

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
      String(actualCost).replace(
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

    let workItemId = null;

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
        index < allPhotos.length;
        index++
      ) {
        const item =
          allPhotos[index];

        setMessage(
          `${
            item.type === "before"
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
          const { count } =
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
     ↓↓↓ 2/2 코드는 바로 이 아래부터 이어집니다.
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

      if (error) {
        console.error("미확인 상담 개수:", error);
        return;
      }

      setUnreadCount(count || 0);
    } catch (error) {
      console.error("미확인 상담 개수:", error);
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

      let query = supabase
        .from("customer_leads")
        .select("*", {
          count: "exact",
        });

      if (
        filter &&
        filter !== "all"
      ) {
        query =
          query.eq(
            "status",
            filter
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

      if (error) {
        throw error;
      }

      setLeads(
        data || []
      );

      setLeadTotal(
        count || 0
      );

      setLeadPage(page);

      await loadUnreadCount();
    } catch (error) {
      console.error(
        "고객상담:",
        error
      );

      setLeadsMessage(
        `❌ 고객상담 오류: ${
          error?.message ||
          "불러오기 실패"
        }`
      );
    } finally {
      setLeadsLoading(false);
    }
  }

  function changeLeadFilter(
    value
  ) {
    setLeadFilter(value);
    setOpenLeadId(null);
    loadLeads(1, value);
  }

  async function markLeadRead(
    lead
  ) {
    if (!lead?.id) {
      return;
    }

    if (
      lead.is_read === true
    ) {
      return;
    }

    try {
      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .update({
            is_read: true,
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
                    is_read:
                      true,
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
      console.error(
        "읽음처리:",
        error
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
      setOpenLeadId(
        null
      );
      return;
    }

    setOpenLeadId(
      lead.id
    );

    await markLeadRead(
      lead
    );
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
                : lead
          )
      );

      setLeadsMessage(
        "✅ 상담 상태가 변경되었습니다."
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
      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .update({
            admin_memo:
              value || null,
          })
          .eq(
            "id",
            leadId
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
                    admin_memo:
                      value,
                  }
                : lead
          )
      );

      setLeadsMessage(
        "✅ 관리자 메모 저장 완료"
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

  async function loadLeadPhoto(
    lead,
    path
  ) {
    if (!path) {
      return null;
    }

    const key =
      `${lead.id}:${path}`;

    if (
      leadPhotoUrls[key]
    ) {
      return leadPhotoUrls[
        key
      ];
    }

    setLeadPhotoLoadingId(
      key
    );

    try {
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
        throw error;
      }

      if (
        !data?.signedUrl
      ) {
        throw new Error(
          "사진 주소를 만들 수 없습니다."
        );
      }

      setLeadPhotoUrls(
        (current) => ({
          ...current,
          [key]:
            data.signedUrl,
        })
      );

      return data.signedUrl;
    } catch (error) {
      setLeadsMessage(
        `❌ 고객사진 오류: ${
          error?.message ||
          "실패"
        }`
      );

      return null;
    } finally {
      setLeadPhotoLoadingId(
        null
      );
    }
  }

  async function openLeadPhoto(
    lead,
    path
  ) {
    const key =
      `${lead.id}:${path}`;

    let url =
      leadPhotoUrls[key];

    if (!url) {
      url =
        await loadLeadPhoto(
          lead,
          path
        );
    }

    if (url) {
      setPreviewPhoto(
        url
      );
    }
  }

  /* =========================================================
     최종 견적
  ========================================================= */

  function updateLeadLocal(
    leadId,
    field,
    value
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
              : lead
        )
    );
  }

  async function saveFinalQuote(
    lead
  ) {
    try {
      const price =
        Number(
          String(
            lead.final_price ||
              ""
          ).replace(
            /,/g,
            ""
          )
        );

      if (
        !Number.isFinite(
          price
        ) ||
        price <= 0
      ) {
        throw new Error(
          "최종 견적금액을 입력해주세요."
        );
      }

      const createdAt =
        new Date().toISOString();

      const {
        error,
      } =
        await supabase
          .from(
            "customer_leads"
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
              createdAt,
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
                      price,

                    quote_created_at:
                      createdAt,
                  }
                : item
          )
      );

      setLeadsMessage(
        "✅ 최종 견적이 저장되었습니다."
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 최종 견적 저장 오류: ${
          error?.message ||
          "실패"
        }`
      );
    }
  }

  function wrapCanvasText(
    ctx,
    text,
    x,
    y,
    maxWidth,
    lineHeight
  ) {
    const value =
      String(
        text || ""
      ).trim();

    if (!value) {
      return y;
    }

    const paragraphs =
      value.split("\n");

    let currentY = y;

    for (
      const paragraph of
      paragraphs
    ) {
      if (
        paragraph === ""
      ) {
        currentY +=
          lineHeight;
        continue;
      }

      let line = "";

      for (
        const char of
        paragraph
      ) {
        const testLine =
          line + char;

        const width =
          ctx.measureText(
            testLine
          ).width;

        if (
          width >
            maxWidth &&
          line
        ) {
          ctx.fillText(
            line,
            x,
            currentY
          );

          line = char;

          currentY +=
            lineHeight;
        } else {
          line =
            testLine;
        }
      }

      if (line) {
        ctx.fillText(
          line,
          x,
          currentY
        );

        currentY +=
          lineHeight;
      }
    }

    return currentY;
  }

  function getQuoteDate(
    lead
  ) {
    const value =
      lead.quote_created_at ||
      new Date().toISOString();

    return new Date(
      value
    ).toLocaleDateString(
      "ko-KR",
      {
        timeZone:
          "Asia/Seoul",
      }
    );
  }

  async function createQuoteImage(
    lead
  ) {
    const price =
      Number(
        String(
          lead.final_price ||
            ""
        ).replace(
          /,/g,
          ""
        )
      );

    if (
      !Number.isFinite(
        price
      ) ||
      price <= 0
    ) {
      throw new Error(
        "먼저 최종 견적금액을 입력하고 저장해주세요."
      );
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      1080;

    canvas.height =
      1500;

    const ctx =
      canvas.getContext(
        "2d"
      );

    if (!ctx) {
      throw new Error(
        "견적 이미지 생성 실패"
      );
    }

    /*
      배경
    */

    ctx.fillStyle =
      "#f7f3ed";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    /*
      상단 제목
    */

    ctx.fillStyle =
      "#34261f";

    ctx.font =
      "bold 58px sans-serif";

    ctx.fillText(
      "기분좋은공간",
      80,
      110
    );

    ctx.font =
      "bold 38px sans-serif";

    ctx.fillText(
      "인테리어필름 견적서",
      80,
      175
    );

    ctx.strokeStyle =
      "#9b7a61";

    ctx.lineWidth =
      3;

    ctx.beginPath();

    ctx.moveTo(
      80,
      215
    );

    ctx.lineTo(
      1000,
      215
    );

    ctx.stroke();

    let y = 285;

    function drawLabel(
      label,
      value
    ) {
      ctx.fillStyle =
        "#6b5749";

      ctx.font =
        "bold 25px sans-serif";

      ctx.fillText(
        label,
        80,
        y
      );

      ctx.fillStyle =
        "#222222";

      ctx.font =
        "30px sans-serif";

      ctx.fillText(
        String(
          value || "-"
        ),
        300,
        y
      );

      y += 62;
    }

    drawLabel(
      "고객명",
      lead.customer_name ||
        "-"
    );

    drawLabel(
      "연락처",
      lead.phone ||
        "-"
    );

    drawLabel(
      "지역",
      lead.region ||
        lead.address ||
        "-"
    );

    drawLabel(
      "견적일",
      getQuoteDate(
        lead
      )
    );

    y += 20;

    /*
      최종금액 박스
    */

    ctx.fillStyle =
      "#ffffff";

    ctx.fillRect(
      70,
      y,
      940,
      150
    );

    ctx.strokeStyle =
      "#9b7a61";

    ctx.lineWidth =
      3;

    ctx.strokeRect(
      70,
      y,
      940,
      150
    );

    ctx.fillStyle =
      "#6b5749";

    ctx.font =
      "bold 27px sans-serif";

    ctx.fillText(
      "최종 견적금액",
      110,
      y + 55
    );

    ctx.fillStyle =
      "#34261f";

    ctx.font =
      "bold 48px sans-serif";

    ctx.textAlign =
      "right";

    ctx.fillText(
      `${price.toLocaleString(
        "ko-KR"
      )}원`,
      960,
      y + 105
    );

    ctx.textAlign =
      "left";

    y += 210;

    /*
      시공내용
    */

    ctx.fillStyle =
      "#6b5749";

    ctx.font =
      "bold 27px sans-serif";

    ctx.fillText(
      "시공 내용",
      80,
      y
    );

    y += 45;

    ctx.fillStyle =
      "#222222";

    ctx.font =
      "28px sans-serif";

    y =
      wrapCanvasText(
        ctx,
        lead.quote_work_details ||
          lead.category ||
          lead.sub_category ||
          "상담 후 확정",
        80,
        y,
        920,
        42
      );

    y += 30;

    /*
      사용 자재
    */

    ctx.fillStyle =
      "#6b5749";

    ctx.font =
      "bold 27px sans-serif";

    ctx.fillText(
      "사용 자재",
      80,
      y
    );

    y += 45;

    ctx.fillStyle =
      "#222222";

    ctx.font =
      "28px sans-serif";

    y =
      wrapCanvasText(
        ctx,
        lead.quote_material ||
          "상담 후 확정",
        80,
        y,
        920,
        42
      );

    y += 30;

    /*
      안내사항
    */

    ctx.fillStyle =
      "#6b5749";

    ctx.font =
      "bold 27px sans-serif";

    ctx.fillText(
      "안내 사항",
      80,
      y
    );

    y += 45;

    ctx.fillStyle =
      "#222222";

    ctx.font =
      "27px sans-serif";

    y =
      wrapCanvasText(
        ctx,
        lead.quote_note ||
          "현장 상태 및 추가 작업 발생 시 금액이 변경될 수 있습니다.",
        80,
        y,
        920,
        40
      );

    /*
      하단
    */

    ctx.fillStyle =
      "#6b5749";

    ctx.font =
      "24px sans-serif";

    ctx.fillText(
      "기분좋은공간 · 인테리어필름 시공",
      80,
      1400
    );

    ctx.fillText(
      "담당 : 정근호",
      80,
      1445
    );

    const blob =
      await new Promise(
        (resolve) =>
          canvas.toBlob(
            resolve,
            "image/jpeg",
            0.92
          )
      );

    if (!blob) {
      throw new Error(
        "견적 이미지 생성 실패"
      );
    }

    const fileName =
      `기분좋은공간_견적서_${
        lead.customer_name ||
        "고객"
      }_${Date.now()}.jpg`;

    return new File(
      [blob],
      fileName,
      {
        type:
          "image/jpeg",
      }
    );
  }

  async function downloadQuoteImage(
    lead
  ) {
    try {
      const file =
        await createQuoteImage(
          lead
        );

      const url =
        URL.createObjectURL(
          file
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;
      link.download =
        file.name;

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();

      setTimeout(
        () =>
          URL.revokeObjectURL(
            url
          ),
        1000
      );

      setLeadsMessage(
        "✅ 견적 이미지가 만들어졌습니다. 확인 후 고객에게 전송할 수 있습니다."
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 견적 이미지 오류: ${
          error?.message ||
          "실패"
        }`
      );
    }
  }

  async function shareQuoteImage(
    lead
  ) {
    try {
      const file =
        await createQuoteImage(
          lead
        );

      if (
        navigator.share
      ) {
        const shareData = {
          title:
            "기분좋은공간 견적서",

          text:
            `${
              lead.customer_name ||
              "고객"
            }님 기분좋은공간 인테리어필름 견적서입니다.`,

          files: [file],
        };

        if (
          !navigator.canShare ||
          navigator.canShare({
            files: [file],
          })
        ) {
          await navigator.share(
            shareData
          );

          setLeadsMessage(
            "✅ 공유창을 열었습니다. 메시지 앱을 선택해 고객에게 전송해주세요."
          );

          return;
        }
      }

      /*
        공유가 지원되지 않는 경우
        자동 다운로드
      */

      const url =
        URL.createObjectURL(
          file
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;
      link.download =
        file.name;

      document.body.appendChild(
        link
      );

      link.click();
      link.remove();

      setTimeout(
        () =>
          URL.revokeObjectURL(
            url
          ),
        1000
      );

      setLeadsMessage(
        "⚠️ 이 브라우저에서는 직접 공유가 지원되지 않아 견적 이미지를 저장했습니다."
      );
    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        setLeadsMessage(
          "공유가 취소되었습니다."
        );

        return;
      }

      setLeadsMessage(
        `❌ 고객 전송 오류: ${
          error?.message ||
          "실패"
        }`
      );
    }
  }

  /* =========================================================
     사진 카드
  ========================================================= */

  function PhotoCard({
    photo,
  }) {
    const url =
      jobPhotoUrls[
        photo.id
      ];

    const isLoading =
      loadingPhotoId ===
      photo.id;

    return (
      <div
        style={{
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "12px",
          padding:
            "12px",
          marginBottom:
            "12px",
          background:
            "#fafafa",
        }}
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
            marginBottom:
              "10px",
          }}
        >
          <div>
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

            <div
              style={{
                fontSize:
                  "13px",
                color:
                  "#6b7280",
                marginTop:
                  "4px",
              }}
            >
              {photo.category ||
                "-"}{" "}
              /{" "}
              {photo.sub_category ||
                "-"}
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              openJobPhoto(
                photo
              )
            }
            style={{
              padding:
                "8px 11px",
              border:
                "none",
              borderRadius:
                "8px",
              background:
                "#111827",
              color:
                "white",
              fontWeight:
                "bold",
              cursor:
                "pointer",
            }}
          >
            {isLoading
              ? "불러오는 중..."
              : "사진 보기"}
          </button>
        </div>

        {url && (
          <img
            src={url}
            alt="시공사진"
            loading="lazy"
            onClick={() =>
              setPreviewPhoto(
                url
              )
            }
            style={{
              width:
                "100%",
              maxHeight:
                "300px",
              objectFit:
                "cover",
              borderRadius:
                "10px",
              cursor:
                "pointer",
              marginBottom:
                "10px",
            }}
          />
        )}

        {editingPhotoId ===
        photo.id ? (
          <div
            style={{
              display:
                "grid",
              gap: "8px",
            }}
          >
            <select
              value={
                editPhotoType
              }
              onChange={(e) =>
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
            </select>

            <input
              value={
                editPhotoCategory
              }
              onChange={(e) =>
                setEditPhotoCategory(
                  e.target
                    .value
                )
              }
              placeholder="카테고리"
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
                  e.target
                    .value
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
                  e.target
                    .value
                )
              }
              placeholder="AI 설명"
              rows={4}
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
                : "사진정보 저장"}
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
        ) : (
          <>
            {photo.ai_description && (
              <div
                style={{
                  fontSize:
                    "14px",
                  lineHeight:
                    1.6,
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
                    fontSize:
                      "13px",
                    color:
                      "#6b7280",
                    marginBottom:
                      "10px",
                  }}
                >
                  #
                  {photo.ai_tags.join(
                    " #"
                  )}
                </div>
              )}

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
                    "#b91c1c",
                }}
              >
                사진 삭제
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* =========================================================
     렌더링
  ========================================================= */

  const totalJobPages =
    Math.max(
      1,
      Math.ceil(
        jobTotal /
          JOB_PAGE_SIZE
      )
    );

  const totalLeadPages =
    Math.max(
      1,
      Math.ceil(
        leadTotal /
          LEAD_PAGE_SIZE
      )
    );

  return (
    <main
      style={{
        maxWidth:
          "1100px",
        margin:
          "0 auto",
        padding:
          "16px",
        fontFamily:
          "Arial, sans-serif",
        color:
          "#111827",
      }}
    >
      <h1
        style={{
          fontSize:
            "24px",
          marginBottom:
            "6px",
        }}
      >
        기분좋은공간 관리자
      </h1>

      <div
        style={{
          color:
            "#6b7280",
          marginBottom:
            "18px",
          fontSize:
            "14px",
        }}
      >
        AI 견적 · 시공 DB ·
        고객 상담 관리
      </div>

      {/* 탭 */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(4, minmax(0, 1fr))",
          gap: "6px",
          marginBottom:
            "18px",
        }}
      >
        {[
          [
            "jobs",
            "시공 DB",
          ],
          [
            "register",
            "시공 등록",
          ],
          [
            "usage",
            "로그 분석",
          ],
          [
            "leads",
            `고객 상담${
              unreadCount >
              0
                ? ` (${unreadCount})`
                : ""
            }`,
          ],
        ].map(
          ([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                changeTab(
                  key
                )
              }
              style={{
                padding:
                  "12px 4px",
                border:
                  "1px solid #d1d5db",
                borderRadius:
                  "10px",
                background:
                  activeTab ===
                  key
                    ? "#111827"
                    : "#ffffff",
                color:
                  activeTab ===
                  key
                    ? "#ffffff"
                    : "#111827",
                fontWeight:
                  "bold",
                fontSize:
                  "13px",
                cursor:
                  "pointer",
              }}
            >
              {label}
            </button>
          )
        )}
      </div>

      {/* =====================================================
          시공 DB
      ===================================================== */}

      {activeTab ===
        "jobs" && (
        <>
          <section
            style={
              sectionStyle
            }
          >
            <h2>
              시공 DB
            </h2>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "1fr auto",
                gap: "8px",
              }}
            >
              <input
                value={
                  jobSearch
                }
                onChange={(e) =>
                  setJobSearch(
                    e.target
                      .value
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
                placeholder="시공부위 / 메모 검색"
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
                    "0 18px",
                  border:
                    "none",
                  borderRadius:
                    "10px",
                  background:
                    "#111827",
                  color:
                    "white",
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
                  marginTop:
                    "8px",
                }}
              >
                검색 초기화
              </button>
            )}

            <div
              style={{
                marginTop:
                  "12px",
                fontSize:
                  "14px",
                color:
                  "#6b7280",
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
                  whiteSpace:
                    "pre-wrap",
                  marginTop:
                    "12px",
                  padding:
                    "12px",
                  borderRadius:
                    "10px",
                  background:
                    "#f3f4f6",
                }}
              >
                {
                  jobsMessage
                }
              </div>
            )}
          </section>

          {jobsLoading ? (
            <section
              style={
                sectionStyle
              }
            >
              불러오는 중...
            </section>
          ) : (
            jobs.map(
              (job) => (
                <section
                  key={
                    job.id
                  }
                  style={
                    sectionStyle
                  }
                >
                  {editingId ===
                  job.id ? (
                    <div
                      style={{
                        display:
                          "grid",
                        gap: "8px",
                      }}
                    >
                      <input
                        value={
                          editCategory
                        }
                        onChange={(e) =>
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
                        onChange={(e) =>
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
                        onChange={(e) =>
                          setEditCost(
                            e
                              .target
                              .value
                          )
                        }
                        inputMode="numeric"
                        placeholder="실제 시공금액"
                        style={
                          inputStyle
                        }
                      />

                      <textarea
                        value={
                          editMemo
                        }
                        onChange={(e) =>
                          setEditMemo(
                            e
                              .target
                              .value
                          )
                        }
                        rows={4}
                        placeholder="메모"
                        style={
                          inputStyle
                        }
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
                        style={
                          secondaryButtonStyle
                        }
                      >
                        취소
                      </button>
                    </div>
                  ) : (
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
                                "18px",
                            }}
                          >
                            {job.category ||
                              "-"}
                          </div>

                          <div
                            style={{
                              fontSize:
                                "14px",
                              color:
                                "#6b7280",
                              marginTop:
                                "4px",
                            }}
                          >
                            {job.sub_category ||
                              "-"}
                          </div>
                        </div>

                        <strong>
                          {formatWon(
                            job.actual_cost
                          )}
                        </strong>
                      </div>

                      {job.memo && (
                        <div
                          style={{
                            whiteSpace:
                              "pre-wrap",
                            marginTop:
                              "10px",
                            fontSize:
                              "14px",
                          }}
                        >
                          {
                            job.memo
                          }
                        </div>
                      )}

                      <div
                        style={{
                          color:
                            "#9ca3af",
                          fontSize:
                            "12px",
                          marginTop:
                            "8px",
                        }}
                      >
                        {formatDate(
                          job.created_at
                        )}
                      </div>

                      <div
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "1fr 1fr",
                          gap:
                            "8px",
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
                          style={
                            secondaryButtonStyle
                          }
                        >
                          {openJobId ===
                          job.id
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
                          style={
                            secondaryButtonStyle
                          }
                        >
                          수정
                        </button>
                      </div>

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
                            "8px",
                          color:
                            "#b91c1c",
                        }}
                      >
                        시공건 삭제
                      </button>

                      {openJobId ===
                        job.id && (
                        <div
                          style={{
                            marginTop:
                              "16px",
                          }}
                        >
                          {jobPhotoLoadingId ===
                          job.id ? (
                            <div>
                              사진정보
                              불러오는 중...
                            </div>
                          ) : (
                            <>
                              {(
                                jobPhotos[
                                  job.id
                                ] ||
                                []
                              ).length ===
                              0 ? (
                                <div
                                  style={{
                                    color:
                                      "#6b7280",
                                  }}
                                >
                                  연결된
                                  사진이
                                  없습니다.
                                </div>
                              ) : (
                                (
                                  jobPhotos[
                                    job.id
                                  ] ||
                                  []
                                ).map(
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
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </section>
              )
            )
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
              marginBottom:
                "30px",
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

            <div
              style={{
                textAlign:
                  "center",
                fontSize:
                  "14px",
              }}
            >
              {jobPage} /{" "}
              {
                totalJobPages
              }
            </div>

            <button
              type="button"
              disabled={
                jobPage >=
                totalJobPages
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
        </>
      )}

      {/* =====================================================
          시공 등록
      ===================================================== */}

      {activeTab ===
        "register" && (
        <>
          <section
            style={
              sectionStyle
            }
          >
            <h2>
              AI 설정
            </h2>

            <label>
              유사도 기준
            </label>

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
                  e.target
                    .value
                )
              }
              style={{
                ...inputStyle,
                marginTop:
                  "8px",
              }}
            />

            <div
              style={{
                fontSize:
                  "13px",
                color:
                  "#6b7280",
                marginTop:
                  "6px",
              }}
            >
              현재 기준 약{" "}
              {Math.round(
                Number(
                  similarityThreshold ||
                    0
                ) * 100
              )}
              %
            </div>

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
                : "AI 설정 저장"}
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

          <section
            style={
              sectionStyle
            }
          >
            <h2>
              시공사례 등록
            </h2>

            <div
              style={{
                display:
                  "grid",
                gap: "12px",
              }}
            >
              <input
                value={
                  category
                }
                onChange={(e) =>
                  setCategory(
                    e.target
                      .value
                  )
                }
                placeholder="시공 부위 예: 문·문틀 / 싱크대 / 중문"
                style={
                  inputStyle
                }
              />

              <input
                value={
                  actualCost
                }
                onChange={(e) =>
                  setActualCost(
                    e.target
                      .value
                  )
                }
                inputMode="numeric"
                placeholder="실제 시공금액 예: 180000"
                style={
                  inputStyle
                }
              />

              <input
                value={
                  material
                }
                onChange={(e) =>
                  setMaterial(
                    e.target
                      .value
                  )
                }
                placeholder="사용 자재 예: 현대 GS245"
                style={
                  inputStyle
                }
              />

              <textarea
                value={
                  memo
                }
                onChange={(e) =>
                  setMemo(
                    e.target
                      .value
                  )
                }
                placeholder="메모"
                rows={3}
                style={
                  inputStyle
                }
              />

              <div>
                <strong>
                  시공 전 사진
                </strong>

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) =>
                    setBeforeImages(
                      Array.from(
                        e.target
                          .files ||
                          []
                      )
                    )
                  }
                  style={{
                    ...inputStyle,
                    marginTop:
                      "8px",
                  }}
                />

                <div
                  style={{
                    marginTop:
                      "5px",
                    fontSize:
                      "13px",
                    color:
                      "#6b7280",
                  }}
                >
                  선택{" "}
                  {
                    beforeImages.length
                  }
                  장
                </div>
              </div>

              <div>
                <strong>
                  시공 후 사진
                </strong>

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) =>
                    setAfterImages(
                      Array.from(
                        e.target
                          .files ||
                          []
                      )
                    )
                  }
                  style={{
                    ...inputStyle,
                    marginTop:
                      "8px",
                  }}
                />

                <div
                  style={{
                    marginTop:
                      "5px",
                    fontSize:
                      "13px",
                    color:
                      "#6b7280",
                  }}
                >
                  선택{" "}
                  {
                    afterImages.length
                  }
                  장
                </div>
              </div>

              <button
                type="button"
                disabled={
                  loading
                }
                onClick={
                  handleSave
                }
                style={
                  primaryButtonStyle
                }
              >
                {loading
                  ? "AI 분석 + 저장 중..."
                  : "시공사례 저장"}
              </button>
            </div>

            {message && (
              <div
                style={{
                  whiteSpace:
                    "pre-wrap",
                  marginTop:
                    "14px",
                  padding:
                    "12px",
                  background:
                    "#f3f4f6",
                  borderRadius:
                    "10px",
                }}
              >
                {message}
              </div>
            )}
          </section>
        </>
      )}

      {/* =====================================================
          로그 분석
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
                  }}
                >
                  자동견적 로그
                  분석
                </h2>

                <div
                  style={{
                    fontSize:
                      "13px",
                    color:
                      "#6b7280",
                  }}
                >
                  estimate_usage
                  실제 데이터 기준
                </div>
              </div>

              <button
                type="button"
                onClick={
                  loadUsageStats
                }
                disabled={
                  usageLoading
                }
                style={{
                  padding:
                    "10px 14px",
                  border:
                    "none",
                  borderRadius:
                    "9px",
                  background:
                    "#111827",
                  color:
                    "#ffffff",
                  fontWeight:
                    "bold",
                  cursor:
                    "pointer",
                }}
              >
                {usageLoading
                  ? "조회 중..."
                  : "새로고침"}
              </button>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: "10px",
                marginTop:
                  "18px",
              }}
            >
              {[
                [
                  "오늘 자동견적",
                  usageStats.today,
                ],

                [
                  "최근 7일",
                  usageStats.sevenDays,
                ],

                [
                  "전체 자동견적",
                  usageStats.total,
                ],

                [
                  "예상 사용자",
                  usageStats.sessions,
                ],

                [
                  "전체 상세상담",
                  usageStats.leads,
                ],

                [
                  "자동견적→상담",
                  usageStats.converted,
                ],
              ].map(
                ([
                  label,
                  value,
                ]) => (
                  <div
                    key={
                      label
                    }
                    style={{
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "12px",
                      padding:
                        "14px",
                      background:
                        "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          "13px",
                        color:
                          "#6b7280",
                      }}
                    >
                      {
                        label
                      }
                    </div>

                    <div
                      style={{
                        fontSize:
                          "26px",
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
                    </div>
                  </div>
                )
              )}
            </div>

            <div
              style={{
                marginTop:
                  "10px",
                padding:
                  "15px",
                borderRadius:
                  "12px",
                background:
                  "#34261f",
                color:
                  "#ffffff",
              }}
            >
              <div
                style={{
                  fontSize:
                    "13px",
                  opacity:
                    0.8,
                }}
              >
                자동견적 → 상세상담
                전환율
              </div>

              <div
                style={{
                  fontSize:
                    "32px",
                  fontWeight:
                    "bold",
                  marginTop:
                    "4px",
                }}
              >
                {
                  usageStats.conversion
                }
                %
              </div>

              <div
                style={{
                  fontSize:
                    "12px",
                  opacity:
                    0.75,
                  marginTop:
                    "5px",
                }}
              >
                estimate_usage의
                converted_to_lead=true
                기준
              </div>
            </div>

            {usageMessage && (
              <div
                style={{
                  whiteSpace:
                    "pre-wrap",
                  marginTop:
                    "12px",
                  padding:
                    "12px",
                  background:
                    usageMessage.startsWith(
                      "❌"
                    )
                      ? "#fef2f2"
                      : "#f3f4f6",
                  borderRadius:
                    "10px",
                  fontSize:
                    "14px",
                  lineHeight:
                    1.6,
                }}
              >
                {
                  usageMessage
                }
              </div>
            )}
          </section>

          <section
            style={
              sectionStyle
            }
          >
            <h2>
              최근 자동견적
            </h2>

            {usageLoading ? (
              <div>
                불러오는 중...
              </div>
            ) : usageRecent.length ===
              0 ? (
              <div
                style={{
                  color:
                    "#6b7280",
                }}
              >
                표시할 자동견적
                로그가 없습니다.
              </div>
            ) : (
              usageRecent.map(
                (row) => {
                  let amount =
                    "견적금액 미기록";

                  if (
                    row.estimate_average !==
                      null &&
                    row.estimate_average !==
                      undefined
                  ) {
                    amount =
                      `평균 ${formatWon(
                        row.estimate_average
                      )}`;
                  } else if (
                    row.estimate_min !==
                      null &&
                    row.estimate_max !==
                      null &&
                    row.estimate_min !==
                      undefined &&
                    row.estimate_max !==
                      undefined
                  ) {
                    amount =
                      `${formatWon(
                        row.estimate_min
                      )} ~ ${formatWon(
                        row.estimate_max
                      )}`;
                  }

                  return (
                    <div
                      key={
                        row.id
                      }
                      style={{
                        borderTop:
                          "1px solid #e5e7eb",
                        padding:
                          "14px 0",
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
                        }}
                      >
                        <strong>
                          {row.category ||
                            "미분류"}
                        </strong>

                        <span
                          style={{
                            fontSize:
                              "12px",
                            color:
                              row.converted_to_lead
                                ? "#047857"
                                : "#6b7280",
                          }}
                        >
                          {row.converted_to_lead
                            ? "상담 전환"
                            : "자동견적"}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize:
                            "14px",
                          color:
                            "#4b5563",
                          marginTop:
                            "5px",
                        }}
                      >
                        세부:{" "}
                        {row.sub_category ||
                          "-"}
                      </div>

                      <div
                        style={{
                          fontSize:
                            "14px",
                          marginTop:
                            "5px",
                        }}
                      >
                        사진{" "}
                        {Number(
                          row.photo_count ||
                            0
                        )}
                        장 ·{" "}
                        {amount}
                      </div>

                      <div
                        style={{
                          fontSize:
                            "12px",
                          color:
                            "#9ca3af",
                          marginTop:
                            "5px",
                          wordBreak:
                            "break-all",
                        }}
                      >
                        {formatDate(
                          row.created_at
                        )}
                        <br />
                        session:{" "}
                        {row.session_id ||
                          "-"}
                      </div>
                    </div>
                  );
                }
              )
            )}
          </section>
        </>
      )}

      {/* =====================================================
          고객 상담
      ===================================================== */}

      {activeTab ===
        "leads" && (
        <>
          {newLeadAlert && (
            <section
              style={{
                ...sectionStyle,
                background:
                  "#fff7ed",
                border:
                  "2px solid #fb923c",
              }}
            >
              <strong>
                🔔 신규 상담이
                들어왔습니다.
              </strong>

              <div
                style={{
                  marginTop:
                    "8px",
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

                  document.title =
                    "기분좋은공간 관리자";

                  loadLeads(
                    1,
                    leadFilter
                  );
                }}
                style={{
                  ...primaryButtonStyle,
                  marginTop:
                    "10px",
                }}
              >
                확인
              </button>
            </section>
          )}

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
                    margin: 0,
                  }}
                >
                  고객 상담
                </h2>

                <div
                  style={{
                    fontSize:
                      "13px",
                    color:
                      "#6b7280",
                    marginTop:
                      "5px",
                  }}
                >
                  미확인{" "}
                  {unreadCount}
                  건
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
                  border:
                    "1px solid #d1d5db",
                  borderRadius:
                    "9px",
                  background:
                    notificationEnabled
                      ? "#ecfdf5"
                      : "#ffffff",
                  fontWeight:
                    "bold",
                }}
              >
                {notificationEnabled
                  ? "🔔 알림 ON"
                  : "알림 켜기"}
              </button>
            </div>

            <select
              value={
                leadFilter
              }
              onChange={(e) =>
                changeLeadFilter(
                  e.target
                    .value
                )
              }
              style={{
                ...inputStyle,
                marginTop:
                  "14px",
              }}
            >
              <option value="all">
                전체
              </option>

              {STATUS_OPTIONS.map(
                (status) => (
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

            <div
              style={{
                marginTop:
                  "10px",
                color:
                  "#6b7280",
                fontSize:
                  "14px",
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
                  whiteSpace:
                    "pre-wrap",
                  marginTop:
                    "10px",
                  padding:
                    "12px",
                  background:
                    "#f3f4f6",
                  borderRadius:
                    "10px",
                }}
              >
                {
                  leadsMessage
                }
              </div>
            )}
          </section>

          {leadsLoading ? (
            <section
              style={
                sectionStyle
              }
            >
              불러오는 중...
            </section>
          ) : (
            leads.map(
              (lead) => {
                const photoPaths =
                  getLeadPhotoPaths(
                    lead
                  );

                return (
                  <section
                    key={
                      lead.id
                    }
                    style={{
                      ...sectionStyle,
                      border:
                        lead.is_read ===
                        false
                          ? "2px solid #fb923c"
                          : sectionStyle.border,
                    }}
                  >
                    <div
                      onClick={() =>
                        toggleLeadDetail(
                          lead
                        )
                      }
                      style={{
                        cursor:
                          "pointer",
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
                        }}
                      >
                        <div>
                          <strong
                            style={{
                              fontSize:
                                "17px",
                            }}
                          >
                            {lead.customer_name ||
                              "이름 미입력"}
                          </strong>

                          {lead.is_read ===
                            false && (
                            <span
                              style={{
                                marginLeft:
                                  "7px",
                                color:
                                  "#ea580c",
                                fontSize:
                                  "12px",
                                fontWeight:
                                  "bold",
                              }}
                            >
                              NEW
                            </span>
                          )}
                        </div>

                        <span
                          style={{
                            fontSize:
                              "13px",
                            color:
                              "#6b7280",
                          }}
                        >
                          {lead.status ||
                            "신규문의"}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop:
                            "7px",
                          fontSize:
                            "14px",
                        }}
                      >
                        {lead.phone ||
                          "-"}
                      </div>

                      <div
                        style={{
                          marginTop:
                            "4px",
                          color:
                            "#6b7280",
                          fontSize:
                            "13px",
                        }}
                      >
                        {lead.region ||
                          lead.address ||
                          "-"}
                      </div>

                      <div
                        style={{
                          marginTop:
                            "5px",
                          color:
                            "#9ca3af",
                          fontSize:
                            "12px",
                        }}
                      >
                        {formatDate(
                          lead.created_at
                        )}
                      </div>
                    </div>

                    {openLeadId ===
                      lead.id && (
                      <div
                        style={{
                          marginTop:
                            "16px",
                          borderTop:
                            "1px solid #e5e7eb",
                          paddingTop:
                            "16px",
                        }}
                      >
                        <label>
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
                          style={{
                            ...inputStyle,
                            marginTop:
                              "6px",
                            marginBottom:
                              "12px",
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

                        {lead.message && (
                          <div
                            style={{
                              marginBottom:
                                "12px",
                            }}
                          >
                            <strong>
                              고객 요청사항
                            </strong>

                            <div
                              style={{
                                whiteSpace:
                                  "pre-wrap",
                                marginTop:
                                  "5px",
                                padding:
                                  "10px",
                                background:
                                  "#f9fafb",
                                borderRadius:
                                  "8px",
                              }}
                            >
                              {
                                lead.message
                              }
                            </div>
                          </div>
                        )}

                        {(lead.category ||
                          lead.sub_category) && (
                          <div
                            style={{
                              marginBottom:
                                "12px",
                            }}
                          >
                            <strong>
                              AI 분석
                            </strong>

                            <div
                              style={{
                                marginTop:
                                  "5px",
                              }}
                            >
                              {lead.category ||
                                "-"}{" "}
                              /{" "}
                              {lead.sub_category ||
                                "-"}
                            </div>
                          </div>
                        )}

                        {(lead.estimate_min !==
                          null ||
                          lead.estimate_max !==
                            null ||
                          lead.estimate_average !==
                            null) && (
                          <div
                            style={{
                              padding:
                                "12px",
                              background:
                                "#f9fafb",
                              borderRadius:
                                "10px",
                              marginBottom:
                                "12px",
                            }}
                          >
                            <strong>
                              AI 자동견적
                            </strong>

                            <div
                              style={{
                                marginTop:
                                  "7px",
                              }}
                            >
                              {lead.estimate_min !==
                                null &&
                              lead.estimate_max !==
                                null
                                ? `${formatWon(
                                    lead.estimate_min
                                  )} ~ ${formatWon(
                                    lead.estimate_max
                                  )}`
                                : formatWon(
                                    lead.estimate_average
                                  )}
                            </div>
                          </div>
                        )}

                        {photoPaths.length >
                          0 && (
                          <div
                            style={{
                              marginBottom:
                                "16px",
                            }}
                          >
                            <strong>
                              고객사진{" "}
                              {
                                photoPaths.length
                              }
                              장
                            </strong>

                            <div
                              style={{
                                display:
                                  "grid",
                                gridTemplateColumns:
                                  "repeat(2, minmax(0, 1fr))",
                                gap:
                                  "8px",
                                marginTop:
                                  "8px",
                              }}
                            >
                              {photoPaths.map(
                                (
                                  path,
                                  index
                                ) => {
                                  const key =
                                    `${lead.id}:${path}`;

                                  const url =
                                    leadPhotoUrls[
                                      key
                                    ];

                                  return (
                                    <div
                                      key={
                                        key
                                      }
                                    >
                                      {url ? (
                                        <img
                                          src={
                                            url
                                          }
                                          alt={`고객사진 ${
                                            index +
                                            1
                                          }`}
                                          loading="lazy"
                                          onClick={() =>
                                            setPreviewPhoto(
                                              url
                                            )
                                          }
                                          style={{
                                            width:
                                              "100%",
                                            height:
                                              "140px",
                                            objectFit:
                                              "cover",
                                            borderRadius:
                                              "10px",
                                            cursor:
                                              "pointer",
                                          }}
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openLeadPhoto(
                                              lead,
                                              path
                                            )
                                          }
                                          style={{
                                            ...secondaryButtonStyle,
                                            minHeight:
                                              "100px",
                                          }}
                                        >
                                          {leadPhotoLoadingId ===
                                          key
                                            ? "불러오는 중..."
                                            : `사진 ${
                                                index +
                                                1
                                              } 보기`}
                                        </button>
                                      )}
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          </div>
                        )}

                        <div
                          style={{
                            marginBottom:
                              "18px",
                          }}
                        >
                          <strong>
                            관리자 메모
                          </strong>

                          <textarea
                            value={
                              lead.admin_memo ||
                              ""
                            }
                            onChange={(e) =>
                              updateLeadLocal(
                                lead.id,
                                "admin_memo",
                                e
                                  .target
                                  .value
                              )
                            }
                            rows={4}
                            placeholder="상담 내용, 방문 일정 등"
                            style={{
                              ...inputStyle,
                              marginTop:
                                "7px",
                            }}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              saveLeadMemo(
                                lead.id,
                                lead.admin_memo ||
                                  ""
                              )
                            }
                            style={{
                              ...secondaryButtonStyle,
                              marginTop:
                                "7px",
                            }}
                          >
                            메모 저장
                          </button>
                        </div>

                        {/* 최종 견적 */}

                        <div
                          style={{
                            padding:
                              "15px",
                            background:
                              "#f7f3ed",
                            borderRadius:
                              "12px",
                            border:
                              "1px solid #d6c5b6",
                          }}
                        >
                          <h3
                            style={{
                              margin:
                                "0 0 12px",
                              color:
                                "#34261f",
                            }}
                          >
                            최종 견적
                          </h3>

                          <input
                            value={
                              lead.final_price !==
                                null &&
                              lead.final_price !==
                                undefined
                                ? Number(
                                    lead.final_price
                                  ).toLocaleString(
                                    "ko-KR"
                                  )
                                : ""
                            }
                            onChange={(e) => {
                              const raw =
                                e.target.value.replace(
                                  /[^0-9]/g,
                                  ""
                                );

                              updateLeadLocal(
                                lead.id,
                                "final_price",
                                raw
                                  ? Number(
                                      raw
                                    )
                                  : ""
                              );
                            }}
                            inputMode="numeric"
                            placeholder="최종 견적금액"
                            style={
                              inputStyle
                            }
                          />

                          <textarea
                            value={
                              lead.quote_work_details ||
                              ""
                            }
                            onChange={(e) =>
                              updateLeadLocal(
                                lead.id,
                                "quote_work_details",
                                e
                                  .target
                                  .value
                              )
                            }
                            rows={4}
                            placeholder="시공 내용 예: 방문 3개 + 문틀 3세트"
                            style={{
                              ...inputStyle,
                              marginTop:
                                "8px",
                            }}
                          />

                          <input
                            value={
                              lead.quote_material ||
                              ""
                            }
                            onChange={(e) =>
                              updateLeadLocal(
                                lead.id,
                                "quote_material",
                                e
                                  .target
                                  .value
                              )
                            }
                            placeholder="사용 자재 예: 현대 L&C GS245"
                            style={{
                              ...inputStyle,
                              marginTop:
                                "8px",
                            }}
                          />

                          <textarea
                            value={
                              lead.quote_note ||
                              ""
                            }
                            onChange={(e) =>
                              updateLeadLocal(
                                lead.id,
                                "quote_note",
                                e
                                  .target
                                  .value
                              )
                            }
                            rows={3}
                            placeholder="고객 안내사항"
                            style={{
                              ...inputStyle,
                              marginTop:
                                "8px",
                            }}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              saveFinalQuote(
                                lead
                              )
                            }
                            style={{
                              ...primaryButtonStyle,
                              background:
                                "#6b4f3b",
                              marginTop:
                                "10px",
                            }}
                          >
                            최종 견적 저장
                          </button>

                          {lead.quote_created_at && (
                            <div
                              style={{
                                fontSize:
                                  "12px",
                                color:
                                  "#6b7280",
                                marginTop:
                                  "8px",
                              }}
                            >
                              최종 저장:{" "}
                              {formatDate(
                                lead.quote_created_at
                              )}
                            </div>
                          )}

                          <div
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                "1fr 1fr",
                              gap:
                                "8px",
                              marginTop:
                                "12px",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                downloadQuoteImage(
                                  lead
                                )
                              }
                              style={{
                                ...secondaryButtonStyle,
                                background:
                                  "#ffffff",
                              }}
                            >
                              견적 이미지 만들기
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                shareQuoteImage(
                                  lead
                                )
                              }
                              style={{
                                ...primaryButtonStyle,
                                background:
                                  "#6b4f3b",
                              }}
                            >
                              고객에게 전송
                            </button>
                          </div>

                          <div
                            style={{
                              marginTop:
                                "8px",
                              fontSize:
                                "12px",
                              lineHeight:
                                1.5,
                              color:
                                "#6b7280",
                            }}
                          >
                            견적 이미지를 먼저
                            확인한 뒤 고객에게
                            전송하세요. 전송 버튼은
                            휴대폰 공유창을 엽니다.
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                );
              }
            )
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
              marginBottom:
                "30px",
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

            <div
              style={{
                textAlign:
                  "center",
                fontSize:
                  "14px",
              }}
            >
              {leadPage} /{" "}
              {
                totalLeadPages
              }
            </div>

            <button
              type="button"
              disabled={
                leadPage >=
                totalLeadPages
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
        </>
      )}

      {/* 사진 크게보기 */}

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
              "rgba(0,0,0,0.88)",
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
          <div
            style={{
              position:
                "relative",
              maxWidth:
                "100%",
              maxHeight:
                "100%",
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
                right:
                  "5px",
                top:
                  "5px",
                zIndex:
                  2,
                border:
                  "none",
                borderRadius:
                  "999px",
                width:
                  "42px",
                height:
                  "42px",
                background:
                  "rgba(0,0,0,0.65)",
                color:
                  "#ffffff",
                fontSize:
                  "22px",
                cursor:
                  "pointer",
              }}
            >
              ×
            </button>

            <img
              src={
                previewPhoto
              }
              alt="확대사진"
              onClick={(e) =>
                e.stopPropagation()
              }
              style={{
                maxWidth:
                  "100%",
                maxHeight:
                  "90vh",
                objectFit:
                  "contain",
                borderRadius:
                  "10px",
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
