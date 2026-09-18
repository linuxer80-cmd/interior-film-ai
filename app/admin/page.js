"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatDate,
  formatWon,
  getLeadPhotoPaths,
  getUsagePhotoPaths,
  sanitizeSearchKeyword,
} from "./adminUtils";
import {
  inputStyle,
  sectionStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from "./adminStyles";
import {
  JOB_PAGE_SIZE,
  LEAD_PAGE_SIZE,
  SIGNED_URL_SECONDS,
  PROJECT_ID,
  STATUS_OPTIONS,
} from "./adminConstants";
import {
  resizeImage,
  getImageHash,
} from "./imageUtils";

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

  /*
    자동견적 사진용 상태

    중요:
    목록을 열었다고 사진 URL을 만들지 않습니다.
    관리자가 "사진 보기" 버튼을 눌렀을 때만
    private bucket signed URL을 생성합니다.
  */

  const [openUsagePhotoId, setOpenUsagePhotoId] = useState(null);

  const [usagePhotoUrls, setUsagePhotoUrls] = useState({});

  const [usagePhotoLoadingId, setUsagePhotoLoadingId] = useState(null);

  /* =========================================================
     스타일
  ========================================================= */

  

  /* =========================================================
     공통 함수
  ========================================================= */

  

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
     자동견적 사진 보기

     estimate_usage.photo_paths에 저장된 경로를 사용합니다.

     중요:
     이 함수는 "사진 보기" 버튼을 눌렀을 때만 실행됩니다.
     따라서 로그 목록을 보는 것만으로는 사진 트래픽이 발생하지 않습니다.
  ========================================================= */

  async function toggleUsagePhotos(row) {
    if (!row?.id) {
      return;
    }

    /*
      이미 열려 있으면 닫기
    */

    if (openUsagePhotoId === row.id) {
      setOpenUsagePhotoId(null);
      return;
    }

    const paths = getUsagePhotoPaths(row);

    if (paths.length === 0) {
      setUsageMessage(
        "⚠️ 이 자동견적에는 저장된 사진 경로가 없습니다."
      );
      return;
    }

    /*
      이미 signed URL을 만든 적이 있으면
      다시 Storage 요청하지 않고 바로 표시
    */

    const cached = usagePhotoUrls[row.id];

    if (
      Array.isArray(cached) &&
      cached.length > 0
    ) {
      setOpenUsagePhotoId(row.id);
      return;
    }

    setUsagePhotoLoadingId(row.id);

    try {
      const urls = [];

      for (const path of paths) {
        const { data, error } = await supabase.storage
          .from("work-photos")
          .createSignedUrl(path, SIGNED_URL_SECONDS);

        if (error) {
          console.error(
            "자동견적 사진 Signed URL 오류:",
            path,
            error
          );

          continue;
        }

        if (data?.signedUrl) {
          urls.push({
            path,
            url: data.signedUrl,
          });
        }
      }

      if (urls.length === 0) {
        throw new Error(
          "저장된 사진을 불러올 수 없습니다. Storage 경로 또는 권한을 확인해주세요."
        );
      }

      setUsagePhotoUrls((current) => ({
        ...current,
        [row.id]: urls,
      }));

      setOpenUsagePhotoId(row.id);

      if (urls.length < paths.length) {
        setUsageMessage(
          `⚠️ 사진 ${paths.length}장 중 ${urls.length}장만 불러왔습니다.`
        );
      }
    } catch (error) {
      console.error("자동견적 사진 보기:", error);

      setUsageMessage(
        `❌ 자동견적 사진 오류: ${
          error?.message || "사진을 불러오지 못했습니다."
        }`
      );
    } finally {
      setUsagePhotoLoadingId(null);
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
        photo_paths까지 같이 조회합니다.

        사진 자체는 여기서 다운로드하지 않습니다.
        Storage 경로 문자열만 조회합니다.
      */

      const [usageResult, leadResult] = await Promise.all([
        supabase
          .from("estimate_usage")
          .select(`
            id,
            session_id,
            category,
            sub_category,
            photo_count,
            photo_paths,
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
            usageResult.error.message ||
            "RLS/SELECT 권한을 확인해주세요."
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
        한국시간 오늘 00:00
      */

      const now = new Date();

      const kstFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const parts = kstFormatter.formatToParts(now);

      const year = parts.find(
        (part) => part.type === "year"
      )?.value;

      const month = parts.find(
        (part) => part.type === "month"
      )?.value;

      const day = parts.find(
        (part) => part.type === "day"
      )?.value;

      const todayStart = new Date(
        `${year}-${month}-${day}T00:00:00+09:00`
      );

      /*
        오늘 포함 최근 7일
      */

      const sevenDaysStart = new Date(
        todayStart.getTime() - 6 * 24 * 60 * 60 * 1000
      );

      const todayCount = rows.filter((row) => {
        if (!row.created_at) {
          return false;
        }

        const createdAt = new Date(row.created_at);

        return (
          !Number.isNaN(createdAt.getTime()) &&
          createdAt >= todayStart
        );
      }).length;

      const sevenDaysCount = rows.filter((row) => {
        if (!row.created_at) {
          return false;
        }

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
        자동견적 → 상세상담 전환
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
        최근 30건
      */

      setUsageRecent(rows.slice(0, 30));

      /*
        새로고침할 때 이전에 열었던 사진은 닫습니다.
        URL 캐시는 그대로 두므로 같은 사진을 다시 누르면
        추가 요청 없이 표시할 수 있습니다.
      */

      setOpenUsagePhotoId(null);

      if (rows.length === 0) {
        setUsageMessage(
          "⚠️ estimate_usage 조회는 성공했지만 현재 로그인 계정에서 보이는 로그가 0건입니다. 실제 테이블에 데이터가 있다면 RLS SELECT 정책을 확인해야 합니다."
        );
      } else {
        const photoLogCount = rows.filter(
          (row) => getUsagePhotoPaths(row).length > 0
        ).length;

        setUsageMessage(
          `✅ 자동견적 로그 ${rows.length.toLocaleString(
            "ko-KR"
          )}건 확인 · 사진 저장 로그 ${photoLogCount.toLocaleString(
            "ko-KR"
          )}건 · 상세상담 전환 ${convertedCount.toLocaleString(
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

     ★ 여기까지 1/2
     ★ 다음 2/2의 첫 줄을 바로 아래에 이어서 붙이세요.
     ★ 중간에 } 를 추가하지 마세요.
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
        console.error("미확인 상담 수:", error);
        return;
      }

      setUnreadCount(count || 0);
    } catch (error) {
      console.error("미확인 상담 수:", error);
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
          }
        );

      if (
        filter &&
        filter !== "all"
      ) {
        query = query.eq(
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
        }`
      );
    } finally {
      setLeadsLoading(false);
    }
  }

  async function markLeadRead(
    lead
  ) {
    if (!lead?.id) return;

    if (lead.is_read === true) {
      return;
    }

    try {
      const { error } =
        await supabase
          .from("customer_leads")
          .update({
            is_read: true,
          })
          .eq("id", lead.id);

      if (error) throw error;

      setLeads((current) =>
        current.map((item) =>
          item.id === lead.id
            ? {
                ...item,
                is_read: true,
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
        "읽음 처리:",
        error
      );
    }
  }

  async function toggleLeadDetail(
    lead
  ) {
    if (openLeadId === lead.id) {
      setOpenLeadId(null);
      return;
    }

    setOpenLeadId(lead.id);

    await markLeadRead(lead);
  }

  async function loadLeadPhotos(
    lead
  ) {
    const paths =
      getLeadPhotoPaths(lead);

    if (paths.length === 0) {
      setLeadsMessage(
        "⚠️ 저장된 고객 사진이 없습니다."
      );
      return;
    }

    if (
      Array.isArray(
        leadPhotoUrls[lead.id]
      ) &&
      leadPhotoUrls[lead.id]
        .length > 0
    ) {
      return;
    }

    setLeadPhotoLoadingId(
      lead.id
    );

    try {
      const urls = [];

      for (const path of paths) {
        const { data, error } =
          await supabase.storage
            .from("work-photos")
            .createSignedUrl(
              path,
              SIGNED_URL_SECONDS
            );

        if (error) {
          console.error(
            "고객 사진:",
            error
          );
          continue;
        }

        if (data?.signedUrl) {
          urls.push({
            path,
            url: data.signedUrl,
          });
        }
      }

      if (urls.length === 0) {
        throw new Error(
          "고객 사진을 불러오지 못했습니다."
        );
      }

      setLeadPhotoUrls(
        (current) => ({
          ...current,
          [lead.id]: urls,
        })
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 고객 사진 오류: ${
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
    memo
  ) {
    try {
      const { error } =
        await supabase
          .from("customer_leads")
          .update({
            admin_memo:
              memo || null,
          })
          .eq("id", leadId);

      if (error) throw error;

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

  function updateLeadLocal(
    leadId,
    field,
    value
  ) {
    setLeads((current) =>
      current.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              [field]: value,
            }
          : lead
      )
    );
  }

  async function saveFinalQuote(
    lead
  ) {
    const price = Number(
      String(
        lead.final_price || ""
      ).replace(/,/g, "")
    );

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      setLeadsMessage(
        "⚠️ 최종 견적금액을 입력해주세요."
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
            final_price: price,

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
          .eq("id", lead.id);

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

  /* =========================================================
     견적 이미지
  ========================================================= */

  function wrapCanvasText(
    ctx,
    text,
    maxWidth
  ) {
    const words =
      String(text || "")
        .split(/\s+/)
        .filter(Boolean);

    const lines = [];

    let current = "";

    for (const word of words) {
      const test =
        current
          ? `${current} ${word}`
          : word;

      if (
        ctx.measureText(test)
          .width > maxWidth &&
        current
      ) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines.length
      ? lines
      : [""];
  }

  async function createQuoteBlob(
    lead
  ) {
    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width = 1080;
    canvas.height = 1500;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      throw new Error(
        "견적 이미지를 만들 수 없습니다."
      );
    }

    ctx.fillStyle = "#f7f4ef";
    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.fillStyle = "#5d4037";
    ctx.fillRect(
      0,
      0,
      canvas.width,
      210
    );

    ctx.fillStyle = "#ffffff";
    ctx.font =
      "bold 54px sans-serif";

    ctx.fillText(
      "기분좋은공간",
      70,
      95
    );

    ctx.font =
      "30px sans-serif";

    ctx.fillText(
      "인테리어필름 최종 견적서",
      70,
      150
    );

    let y = 290;

    ctx.fillStyle = "#111827";
    ctx.font =
      "bold 32px sans-serif";

    ctx.fillText(
      "고객 정보",
      70,
      y
    );

    y += 55;

    ctx.font =
      "28px sans-serif";

    ctx.fillText(
      `고객명 : ${
        lead.customer_name ||
        "-"
      }`,
      70,
      y
    );

    y += 45;

    ctx.fillText(
      `지역 : ${
        lead.region ||
        lead.address ||
        "-"
      }`,
      70,
      y
    );

    y += 75;

    ctx.strokeStyle = "#d6d3d1";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(70, y);
    ctx.lineTo(1010, y);
    ctx.stroke();

    y += 70;

    ctx.font =
      "bold 32px sans-serif";

    ctx.fillText(
      "시공 내용",
      70,
      y
    );

    y += 50;

    ctx.font =
      "27px sans-serif";

    const workLines =
      wrapCanvasText(
        ctx,
        lead.quote_work_details ||
          "상담 후 확정",
        900
      );

    for (const line of workLines) {
      ctx.fillText(
        line,
        70,
        y
      );

      y += 42;
    }

    y += 35;

    ctx.font =
      "bold 32px sans-serif";

    ctx.fillText(
      "사용 자재",
      70,
      y
    );

    y += 50;

    ctx.font =
      "27px sans-serif";

    const materialLines =
      wrapCanvasText(
        ctx,
        lead.quote_material ||
          "협의",
        900
      );

    for (
      const line of
      materialLines
    ) {
      ctx.fillText(
        line,
        70,
        y
      );

      y += 42;
    }

    y += 45;

    ctx.fillStyle = "#5d4037";

    ctx.fillRect(
      70,
      y,
      940,
      150
    );

    ctx.fillStyle = "#ffffff";

    ctx.font =
      "bold 31px sans-serif";

    ctx.fillText(
      "최종 견적금액",
      110,
      y + 58
    );

    ctx.font =
      "bold 46px sans-serif";

    ctx.textAlign = "right";

    ctx.fillText(
      formatWon(
        lead.final_price
      ),
      960,
      y + 108
    );

    ctx.textAlign = "left";

    y += 220;

    ctx.fillStyle = "#111827";

    ctx.font =
      "bold 30px sans-serif";

    ctx.fillText(
      "안내사항",
      70,
      y
    );

    y += 48;

    ctx.font =
      "25px sans-serif";

    const noteLines =
      wrapCanvasText(
        ctx,
        lead.quote_note ||
          "현장 상태 및 추가 작업 발생 시 금액이 변경될 수 있습니다.",
        900
      );

    for (
      const line of
      noteLines
    ) {
      ctx.fillText(
        line,
        70,
        y
      );

      y += 39;
    }

    ctx.fillStyle = "#78716c";

    ctx.font =
      "23px sans-serif";

    ctx.fillText(
      `견적일 : ${new Date().toLocaleDateString(
        "ko-KR"
      )}`,
      70,
      1390
    );

    ctx.fillText(
      "기분좋은공간 · 대표 정근호",
      70,
      1435
    );

    return await new Promise(
      (resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(
                new Error(
                  "견적 이미지 생성 실패"
                )
              );

              return;
            }

            resolve(blob);
          },
          "image/jpeg",
          0.92
        );
      }
    );
  }

  async function shareQuote(
    lead
  ) {
    const price = Number(
      String(
        lead.final_price || ""
      ).replace(/,/g, "")
    );

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      setLeadsMessage(
        "⚠️ 먼저 최종 견적금액을 저장해주세요."
      );

      return;
    }

    try {
      const blob =
        await createQuoteBlob(
          lead
        );

      const file =
        new File(
          [blob],
          `기분좋은공간_견적_${
            lead.customer_name ||
            "고객"
          }.jpg`,
          {
            type: "image/jpeg",
          }
        );

      if (
        navigator.share &&
        (!navigator.canShare ||
          navigator.canShare({
            files: [file],
          }))
      ) {
        await navigator.share({
          title:
            "기분좋은공간 견적서",

          text:
            "기분좋은공간 인테리어필름 견적서입니다.",

          files: [file],
        });

        return;
      }

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href = url;

      anchor.download =
        file.name;

      document.body.appendChild(
        anchor
      );

      anchor.click();

      anchor.remove();

      setTimeout(() => {
        URL.revokeObjectURL(
          url
        );
      }, 1000);

      setLeadsMessage(
        "✅ 견적 이미지를 저장했습니다. 문자에서 사진을 첨부해 전송해주세요."
      );
    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        return;
      }

      setLeadsMessage(
        `❌ 견적 이미지 오류: ${
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
      jobPhotoUrls[photo.id];

    const loadingPhoto =
      loadingPhotoId ===
      photo.id;

    const editing =
      editingPhotoId ===
      photo.id;

    return (
      <div
        style={{
          border:
            "1px solid #e5e7eb",
          borderRadius: "12px",
          padding: "12px",
          marginBottom: "10px",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            fontWeight: "bold",
            marginBottom: "8px",
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

        {url ? (
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            onClick={() =>
              setPreviewPhoto(
                url
              )
            }
            style={{
              width: "100%",
              maxHeight: "300px",
              objectFit:
                "contain",
              borderRadius:
                "10px",
              cursor:
                "pointer",
              background:
                "#111827",
              marginBottom:
                "10px",
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() =>
              loadSingleJobPhoto(
                photo
              )
            }
            disabled={
              loadingPhoto
            }
            style={
              secondaryButtonStyle
            }
          >
            {loadingPhoto
              ? "사진 불러오는 중..."
              : "📷 사진 보기"}
          </button>
        )}

        {!editing ? (
          <>
            <div
              style={{
                fontSize:
                  "14px",
                marginTop:
                  "10px",
                lineHeight:
                  1.6,
              }}
            >
              <div>
                <b>분류:</b>{" "}
                {photo.category ||
                  "-"}
              </div>

              <div>
                <b>세부:</b>{" "}
                {photo.sub_category ||
                  "-"}
              </div>

              <div>
                <b>AI 설명:</b>{" "}
                {photo.ai_description ||
                  "-"}
              </div>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "8px",
                marginTop:
                  "10px",
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
              marginTop:
                "10px",
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

              <option value="history">
                기타 시공사진
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
              placeholder="카테고리"
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
              placeholder="세부 분류"
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
              placeholder="AI 설명"
              rows={4}
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
                gap: "8px",
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

  /* =========================================================
     화면
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
        maxWidth: "900px",
        margin: "0 auto",
        padding:
          "16px 14px 80px",
        background:
          "#f8fafc",
        minHeight:
          "100vh",
        color:
          "#111827",
      }}
    >
      {newLeadAlert && (
        <div
          style={{
            position:
              "fixed",
            top: "16px",
            left: "50%",
            transform:
              "translateX(-50%)",
            width:
              "calc(100% - 28px)",
            maxWidth:
              "600px",
            background:
              "#991b1b",
            color:
              "#ffffff",
            padding:
              "16px",
            borderRadius:
              "14px",
            zIndex:
              9999,
            boxShadow:
              "0 8px 30px rgba(0,0,0,.25)",
          }}
        >
          <div
            style={{
              fontWeight:
                "bold",
              fontSize:
                "17px",
            }}
          >
            🔔 신규 상담이
            들어왔습니다.
          </div>

          <div
            style={{
              marginTop:
                "6px",
              fontSize:
                "14px",
            }}
          >
            {newLeadAlert.customer_name ||
              "고객"}{" "}
            ·{" "}
            {newLeadAlert.phone ||
              "-"}
          </div>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "1fr auto",
              gap: "8px",
              marginTop:
                "12px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setNewLeadAlert(
                  null
                );

                document.title =
                  "기분좋은공간";

                changeTab(
                  "leads"
                );
              }}
              style={{
                ...primaryButtonStyle,
                background:
                  "#ffffff",
                color:
                  "#991b1b",
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
                border:
                  "1px solid rgba(255,255,255,.5)",
                background:
                  "transparent",
                color:
                  "#ffffff",
                borderRadius:
                  "10px",
                padding:
                  "0 14px",
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <h1
        style={{
          fontSize: "24px",
          margin:
            "8px 0 16px",
        }}
      >
        기분좋은공간 관리자
      </h1>

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(4, 1fr)",
          gap: "6px",
          marginBottom:
            "18px",
        }}
      >
        <button
          type="button"
          onClick={() =>
            changeTab("jobs")
          }
          style={{
            padding:
              "11px 4px",
            border:
              "1px solid #d1d5db",
            borderRadius:
              "9px",
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
              "13px",
          }}
        >
          시공 DB
        </button>

        <button
          type="button"
          onClick={() =>
            changeTab(
              "register"
            )
          }
          style={{
            padding:
              "11px 4px",
            border:
              "1px solid #d1d5db",
            borderRadius:
              "9px",
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
            fontWeight:
              "bold",
            fontSize:
              "13px",
          }}
        >
          시공 등록
        </button>

        <button
          type="button"
          onClick={() =>
            changeTab(
              "usage"
            )
          }
          style={{
            padding:
              "11px 4px",
            border:
              "1px solid #d1d5db",
            borderRadius:
              "9px",
            background:
              activeTab ===
              "usage"
                ? "#111827"
                : "#ffffff",
            color:
              activeTab ===
              "usage"
                ? "#ffffff"
                : "#111827",
            fontWeight:
              "bold",
            fontSize:
              "13px",
          }}
        >
          로그 분석
        </button>

        <button
          type="button"
          onClick={() =>
            changeTab(
              "leads"
            )
          }
          style={{
            position:
              "relative",
            padding:
              "11px 4px",
            border:
              "1px solid #d1d5db",
            borderRadius:
              "9px",
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
              "13px",
          }}
        >
          고객 상담

          {unreadCount >
            0 && (
            <span
              style={{
                marginLeft:
                  "4px",
                color:
                  activeTab ===
                  "leads"
                    ? "#fde68a"
                    : "#dc2626",
              }}
            >
              (
              {unreadCount}
              )
            </span>
          )}
        </button>
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
            <h2
              style={{
                marginTop:
                  0,
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
                placeholder="부위, 세부부위, 메모 검색"
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
                  border:
                    "none",
                  borderRadius:
                    "10px",
                  padding:
                    "0 18px",
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
          </section>

          {jobsMessage && (
            <pre
              style={{
                whiteSpace:
                  "pre-wrap",
                background:
                  "#ffffff",
                padding:
                  "12px",
                borderRadius:
                  "10px",
                border:
                  "1px solid #e5e7eb",
              }}
            >
              {jobsMessage}
            </pre>
          )}

          {jobsLoading ? (
            <section
              style={
                sectionStyle
              }
            >
              불러오는 중...
            </section>
          ) : jobs.length ===
            0 ? (
            <section
              style={
                sectionStyle
              }
            >
              등록된 시공
              데이터가
              없습니다.
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
                            "8px",
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
                            "8px",
                        }}
                      />

                      <input
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
                        inputMode="numeric"
                        placeholder="실제 시공금액"
                        style={{
                          ...inputStyle,
                          marginBottom:
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
                        rows={4}
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
                            "8px",
                          marginTop:
                            "8px",
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
                          저장
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
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          gap:
                            "12px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize:
                                "18px",
                              fontWeight:
                                "bold",
                            }}
                          >
                            {job.category ||
                              "-"}
                          </div>

                          <div
                            style={{
                              color:
                                "#6b7280",
                              fontSize:
                                "14px",
                              marginTop:
                                "4px",
                            }}
                          >
                            {job.sub_category ||
                              "-"}
                          </div>
                        </div>

                        <div
                          style={{
                            fontWeight:
                              "bold",
                            textAlign:
                              "right",
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
                              "10px",
                            whiteSpace:
                              "pre-wrap",
                            fontSize:
                              "14px",
                          }}
                        >
                          {job.memo}
                        </div>
                      )}

                      <div
                        style={{
                          marginTop:
                            "10px",
                          fontSize:
                            "12px",
                          color:
                            "#9ca3af",
                        }}
                      >
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
                            "12px",
                        }}
                      >
                        {openJobId ===
                        job.id
                          ? "사진 닫기"
                          : "📷 사진 / 상세 보기"}
                      </button>

                      <div
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "1fr 1fr",
                          gap:
                            "8px",
                          marginTop:
                            "8px",
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
                            color:
                              "#b91c1c",
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  )}

                  {openJobId ===
                    job.id && (
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
                      {jobPhotoLoadingId ===
                      job.id ? (
                        <div>
                          사진정보
                          불러오는
                          중...
                        </div>
                      ) : (
                        <>
                          {(jobPhotos[
                            job.id
                          ] ||
                            [])
                            .length ===
                          0 ? (
                            <div>
                              연결된
                              사진이
                              없습니다.
                            </div>
                          ) : (
                            (
                              jobPhotos[
                                job.id
                              ] || []
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
              {totalJobPages}
            </div>

            <button
              type="button"
              disabled={
                jobPage >=
                totalJobPages
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
            <h2
              style={{
                marginTop:
                  0,
              }}
            >
              시공사례 등록
            </h2>

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
              시공 부위
            </label>

            <input
              value={category}
              onChange={(e) =>
                setCategory(
                  e.target.value
                )
              }
              placeholder="예: 문·문틀, 싱크대, 중문"
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
                  "6px",
              }}
            >
              실제 시공금액
            </label>

            <input
              value={
                actualCost
              }
              onChange={(e) =>
                setActualCost(
                  e.target.value
                )
              }
              inputMode="numeric"
              placeholder="예: 180000"
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
                  "6px",
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
              placeholder="예: 현대 L&C GS245"
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
                  "6px",
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
              placeholder="특이사항"
              rows={4}
              style={{
                ...inputStyle,
                resize:
                  "vertical",
                marginBottom:
                  "14px",
              }}
            />

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
                marginBottom:
                  "8px",
              }}
            />

            <div
              style={{
                fontSize:
                  "13px",
                color:
                  "#6b7280",
                marginBottom:
                  "14px",
              }}
            >
              선택{" "}
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
                marginBottom:
                  "8px",
              }}
            />

            <div
              style={{
                fontSize:
                  "13px",
                color:
                  "#6b7280",
                marginBottom:
                  "14px",
              }}
            >
              선택{" "}
              {
                afterImages.length
              }
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
                ? "AI 분석 + 저장 중..."
                : "시공사례 저장"}
            </button>
          </section>

          {message && (
            <pre
              style={{
                whiteSpace:
                  "pre-wrap",
                background:
                  "#ffffff",
                border:
                  "1px solid #e5e7eb",
                borderRadius:
                  "12px",
                padding:
                  "14px",
              }}
            >
              {message}
            </pre>
          )}

          <section
            style={
              sectionStyle
            }
          >
            <h3
              style={{
                marginTop:
                  0,
              }}
            >
              AI 검색 설정
            </h3>

            <div
              style={{
                fontSize:
                  "14px",
                color:
                  "#6b7280",
                marginBottom:
                  "8px",
              }}
            >
              현재 유사도
              기준:{" "}
              {Math.round(
                Number(
                  similarityThreshold
                ) * 100
              )}
              %
            </div>

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
              style={{
                ...inputStyle,
                marginBottom:
                  "8px",
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
                : "유사도 설정 저장"}
            </button>

            {settingMessage && (
              <div
                style={{
                  marginTop:
                    "10px",
                  whiteSpace:
                    "pre-wrap",
                }}
              >
                {settingMessage}
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
              <h2
                style={{
                  margin: 0,
                }}
              >
                자동견적 로그 분석
              </h2>

              <button
                type="button"
                onClick={
                  loadUsageStats
                }
                disabled={
                  usageLoading
                }
                style={{
                  border:
                    "1px solid #d1d5db",
                  borderRadius:
                    "9px",
                  background:
                    "#ffffff",
                  padding:
                    "9px 12px",
                  fontWeight:
                    "bold",
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
                  "16px",
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
                  "견적→상담 전환",
                  usageStats.converted,
                  "건",
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
                          "13px",
                        color:
                          "#6b7280",
                      }}
                    >
                      {label}
                    </div>

                    <div
                      style={{
                        fontSize:
                          "25px",
                        fontWeight:
                          "bold",
                        marginTop:
                          "4px",
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

            <div
              style={{
                marginTop:
                  "10px",
                padding:
                  "14px",
                borderRadius:
                  "12px",
                background:
                  "#5d4037",
                color:
                  "#ffffff",
              }}
            >
              <div
                style={{
                  fontSize:
                    "13px",
                  opacity:
                    0.85,
                }}
              >
                자동견적 → 상세상담
                전환율
              </div>

              <div
                style={{
                  fontSize:
                    "30px",
                  fontWeight:
                    "bold",
                  marginTop:
                    "4px",
                }}
              >
                {usageStats.conversion}
                %
              </div>
            </div>

            {usageMessage && (
              <div
                style={{
                  marginTop:
                    "12px",
                  whiteSpace:
                    "pre-wrap",
                  fontSize:
                    "14px",
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
            <h3
              style={{
                marginTop:
                  0,
              }}
            >
              최근 자동견적
            </h3>

            {usageLoading ? (
              <div>
                로그 불러오는
                중...
              </div>
            ) : usageRecent.length ===
              0 ? (
              <div
                style={{
                  color:
                    "#6b7280",
                }}
              >
                자동견적 기록이
                없습니다.
              </div>
            ) : (
              usageRecent.map(
                (row) => {
                  const paths =
                    getUsagePhotoPaths(
                      row
                    );

                  const urls =
                    usagePhotoUrls[
                      row.id
                    ] || [];

                  const isOpen =
                    openUsagePhotoId ===
                    row.id;

                  const photoLoading =
                    usagePhotoLoadingId ===
                    row.id;

                  return (
                    <div
                      key={
                        row.id
                      }
                      style={{
                        padding:
                          "15px 0",
                        borderBottom:
                          "1px solid #e5e7eb",
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
                              fontWeight:
                                "bold",
                              fontSize:
                                "16px",
                            }}
                          >
                            {row.category ||
                              "미분류"}
                          </div>

                          <div
                            style={{
                              marginTop:
                                "4px",
                              fontSize:
                                "14px",
                              color:
                                "#4b5563",
                            }}
                          >
                            {row.sub_category ||
                              "-"}
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize:
                              "12px",
                            color:
                              "#6b7280",
                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          자동견적
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop:
                            "8px",
                          fontSize:
                            "14px",
                          lineHeight:
                            1.6,
                        }}
                      >
                        사진{" "}
                        {row.photo_count ||
                          paths.length ||
                          0}
                        장

                        {row.estimate_average !==
                          null &&
                          row.estimate_average !==
                            undefined && (
                          <>
                            {" "}
                            · 평균{" "}
                            <b>
                              {formatWon(
                                row.estimate_average
                              )}
                            </b>
                          </>
                        )}
                      </div>

                      {(row.estimate_min !==
                        null ||
                        row.estimate_max !==
                          null) && (
                        <div
                          style={{
                            marginTop:
                              "3px",
                            fontSize:
                              "13px",
                            color:
                              "#6b7280",
                          }}
                        >
                          예상 범위:{" "}
                          {formatWon(
                            row.estimate_min
                          )}{" "}
                          ~{" "}
                          {formatWon(
                            row.estimate_max
                          )}
                        </div>
                      )}

                      <div
                        style={{
                          marginTop:
                            "7px",
                          fontSize:
                            "12px",
                          color:
                            "#9ca3af",
                          wordBreak:
                            "break-all",
                        }}
                      >
                        {formatDate(
                          row.created_at
                        )}
                        <br />
                        세션:{" "}
                        {row.session_id ||
                          "-"}
                      </div>

                      {/* =====================================
                          자동견적 사진 보기 핵심 부분
                      ===================================== */}

                      {paths.length >
                      0 ? (
                        <button
                          type="button"
                          disabled={
                            photoLoading
                          }
                          onClick={() =>
                            toggleUsagePhotos(
                              row
                            )
                          }
                          style={{
                            ...secondaryButtonStyle,
                            marginTop:
                              "10px",
                            background:
                              isOpen
                                ? "#f3f4f6"
                                : "#ffffff",
                          }}
                        >
                          {photoLoading
                            ? "📷 사진 불러오는 중..."
                            : isOpen
                            ? "사진 닫기"
                            : `📷 사진 보기 (${paths.length})`}
                        </button>
                      ) : (
                        <div
                          style={{
                            marginTop:
                              "9px",
                            fontSize:
                              "12px",
                            color:
                              "#9ca3af",
                          }}
                        >
                          사진 저장 없음
                        </div>
                      )}

                      {isOpen &&
                        urls.length >
                          0 && (
                          <div
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                urls.length ===
                                1
                                  ? "1fr"
                                  : "repeat(2, minmax(0, 1fr))",
                              gap:
                                "8px",
                              marginTop:
                                "10px",
                            }}
                          >
                            {urls.map(
                              (
                                item,
                                index
                              ) => (
                                <img
                                  key={`${item.path}-${index}`}
                                  src={
                                    item.url
                                  }
                                  alt={`자동견적 사진 ${
                                    index +
                                    1
                                  }`}
                                  loading="lazy"
                                  decoding="async"
                                  onClick={() =>
                                    setPreviewPhoto(
                                      item.url
                                    )
                                  }
                                  style={{
                                    width:
                                      "100%",
                                    height:
                                      urls.length ===
                                      1
                                        ? "320px"
                                        : "180px",
                                    objectFit:
                                      "contain",
                                    background:
                                      "#111827",
                                    borderRadius:
                                      "10px",
                                    cursor:
                                      "pointer",
                                  }}
                                />
                              )
                            )}
                          </div>
                        )}

                      {row.converted_to_lead ===
                        true && (
                        <div
                          style={{
                            display:
                              "inline-block",
                            marginTop:
                              "9px",
                            padding:
                              "4px 8px",
                            borderRadius:
                              "999px",
                            background:
                              "#dcfce7",
                            color:
                              "#166534",
                            fontSize:
                              "12px",
                            fontWeight:
                              "bold",
                          }}
                        >
                          상세상담 전환
                        </div>
                      )}
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
                gap:
                  "10px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                }}
              >
                고객 상담
              </h2>

              <button
                type="button"
                onClick={
                  enableNotifications
                }
                style={{
                  border:
                    "1px solid #d1d5db",
                  background:
                    notificationEnabled
                      ? "#dcfce7"
                      : "#ffffff",
                  borderRadius:
                    "9px",
                  padding:
                    "8px 10px",
                  fontSize:
                    "12px",
                  fontWeight:
                    "bold",
                }}
              >
                {notificationEnabled
                  ? "🔔 알림 ON"
                  : "🔕 알림 켜기"}
              </button>
            </div>

            <select
              value={
                leadFilter
              }
              onChange={(e) => {
                const next =
                  e.target.value;

                setLeadFilter(
                  next
                );

                loadLeads(
                  1,
                  next
                );
              }}
              style={{
                ...inputStyle,
                marginTop:
                  "14px",
              }}
            >
              <option value="all">
                전체 상담
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
                    {status}
                  </option>
                )
              )}
            </select>

            <div
              style={{
                marginTop:
                  "10px",
                fontSize:
                  "14px",
                color:
                  "#6b7280",
              }}
            >
              총{" "}
              {leadTotal.toLocaleString(
                "ko-KR"
              )}
              건 · 미확인{" "}
              {unreadCount}건
            </div>
          </section>

          {leadsMessage && (
            <div
              style={{
                ...sectionStyle,
                whiteSpace:
                  "pre-wrap",
              }}
            >
              {leadsMessage}
            </div>
          )}

          {leadsLoading ? (
            <section
              style={
                sectionStyle
              }
            >
              상담 목록
              불러오는 중...
            </section>
          ) : leads.length ===
            0 ? (
            <section
              style={
                sectionStyle
              }
            >
              상담 내역이
              없습니다.
            </section>
          ) : (
            leads.map(
              (lead) => {
                const photoPaths =
                  getLeadPhotoPaths(
                    lead
                  );

                const photos =
                  leadPhotoUrls[
                    lead.id
                  ] || [];

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
                          ? "2px solid #dc2626"
                          : "1px solid #e5e7eb",
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
                        <div
                          style={{
                            fontSize:
                              "18px",
                            fontWeight:
                              "bold",
                          }}
                        >
                          {lead.is_read ===
                            false &&
                            "🔴 "}
                          {lead.customer_name ||
                            "고객"}
                        </div>

                        <div
                          style={{
                            marginTop:
                              "4px",
                            fontSize:
                              "14px",
                            color:
                              "#4b5563",
                          }}
                        >
                          {lead.phone ||
                            "-"}
                        </div>
                      </div>

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
                          border:
                            "1px solid #d1d5db",
                          borderRadius:
                            "8px",
                          padding:
                            "7px",
                          background:
                            "#ffffff",
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

                    <div
                      style={{
                        marginTop:
                          "10px",
                        fontSize:
                          "14px",
                        lineHeight:
                          1.6,
                      }}
                    >
                      <div>
                        <b>
                          지역:
                        </b>{" "}
                        {lead.region ||
                          lead.address ||
                          "-"}
                      </div>

                      <div>
                        <b>
                          희망일:
                        </b>{" "}
                        {lead.preferred_date ||
                          "-"}
                      </div>

                      <div>
                        <b>
                          AI 평균:
                        </b>{" "}
                        {formatWon(
                          lead.estimate_average
                        )}
                      </div>

                      <div>
                        <b>
                          접수:
                        </b>{" "}
                        {formatDate(
                          lead.created_at
                        )}
                      </div>
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
                          "12px",
                      }}
                    >
                      {openLeadId ===
                      lead.id
                        ? "상세 닫기"
                        : "상세 보기"}
                    </button>

                    {openLeadId ===
                      lead.id && (
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
                        <div
                          style={{
                            whiteSpace:
                              "pre-wrap",
                            fontSize:
                              "14px",
                            lineHeight:
                              1.7,
                          }}
                        >
                          <b>
                            고객 요청
                          </b>
                          <br />
                          {lead.request_text ||
                            "-"}
                        </div>

                        {photoPaths.length >
                        0 ? (
                          <>
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
                                  "12px",
                              }}
                            >
                              {leadPhotoLoadingId ===
                              lead.id
                                ? "사진 불러오는 중..."
                                : `📷 고객 사진 보기 (${photoPaths.length})`}
                            </button>

                            {photos.length >
                              0 && (
                              <div
                                style={{
                                  display:
                                    "grid",
                                  gridTemplateColumns:
                                    photos.length ===
                                    1
                                      ? "1fr"
                                      : "repeat(2, minmax(0, 1fr))",
                                  gap:
                                    "8px",
                                  marginTop:
                                    "10px",
                                }}
                              >
                                {photos.map(
                                  (
                                    item,
                                    index
                                  ) => (
                                    <img
                                      key={`${item.path}-${index}`}
                                      src={
                                        item.url
                                      }
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                      onClick={() =>
                                        setPreviewPhoto(
                                          item.url
                                        )
                                      }
                                      style={{
                                        width:
                                          "100%",
                                        height:
                                          photos.length ===
                                          1
                                            ? "320px"
                                            : "180px",
                                        objectFit:
                                          "contain",
                                        background:
                                          "#111827",
                                        borderRadius:
                                          "10px",
                                        cursor:
                                          "pointer",
                                      }}
                                    />
                                  )
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div
                            style={{
                              marginTop:
                                "12px",
                              fontSize:
                                "13px",
                              color:
                                "#9ca3af",
                            }}
                          >
                            저장된 고객
                            사진 없음
                          </div>
                        )}

                        <label
                          style={{
                            display:
                              "block",
                            marginTop:
                              "16px",
                            fontWeight:
                              "bold",
                            marginBottom:
                              "6px",
                          }}
                        >
                          관리자 메모
                        </label>

                        <textarea
                          defaultValue={
                            lead.admin_memo ||
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
                          rows={4}
                          style={{
                            ...inputStyle,
                            resize:
                              "vertical",
                          }}
                        />

                        <div
                          style={{
                            marginTop:
                              "18px",
                            padding:
                              "14px",
                            borderRadius:
                              "12px",
                            background:
                              "#faf7f2",
                            border:
                              "1px solid #e7dfd6",
                          }}
                        >
                          <h3
                            style={{
                              margin:
                                "0 0 12px",
                              color:
                                "#5d4037",
                            }}
                          >
                            최종 견적
                          </h3>

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
                            최종
                            견적금액
                          </label>

                          <input
                            value={
                              lead.final_price ||
                              ""
                            }
                            onChange={(
                              e
                            ) =>
                              updateLeadLocal(
                                lead.id,
                                "final_price",
                                e
                                  .target
                                  .value
                              )
                            }
                            inputMode="numeric"
                            placeholder="예: 550000"
                            style={{
                              ...inputStyle,
                              marginBottom:
                                "10px",
                            }}
                          />

                          {lead.final_price && (
                            <div
                              style={{
                                marginTop:
                                  "-4px",
                                marginBottom:
                                  "12px",
                                fontWeight:
                                  "bold",
                                color:
                                  "#5d4037",
                              }}
                            >
                              {formatWon(
                                lead.final_price
                              )}
                            </div>
                          )}

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
                            시공 내용
                          </label>

                          <textarea
                            value={
                              lead.quote_work_details ||
                              ""
                            }
                            onChange={(
                              e
                            ) =>
                              updateLeadLocal(
                                lead.id,
                                "quote_work_details",
                                e
                                  .target
                                  .value
                              )
                            }
                            rows={4}
                            placeholder="예: 방문 및 문틀 인테리어필름 시공"
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
                                "6px",
                            }}
                          >
                            사용 자재
                          </label>

                          <input
                            value={
                              lead.quote_material ||
                              ""
                            }
                            onChange={(
                              e
                            ) =>
                              updateLeadLocal(
                                lead.id,
                                "quote_material",
                                e
                                  .target
                                  .value
                              )
                            }
                            placeholder="예: 현대 L&C 인테리어필름"
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
                                "6px",
                            }}
                          >
                            안내사항
                          </label>

                          <textarea
                            value={
                              lead.quote_note ||
                              ""
                            }
                            onChange={(
                              e
                            ) =>
                              updateLeadLocal(
                                lead.id,
                                "quote_note",
                                e
                                  .target
                                  .value
                              )
                            }
                            rows={3}
                            placeholder="현장 상태에 따라 추가 비용이 발생할 수 있습니다."
                            style={{
                              ...inputStyle,
                              resize:
                                "vertical",
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
                                "#5d4037",
                              marginTop:
                                "12px",
                            }}
                          >
                            최종 견적 저장
                          </button>

                          {lead.quote_created_at && (
                            <div
                              style={{
                                marginTop:
                                  "8px",
                                fontSize:
                                  "12px",
                                color:
                                  "#78716c",
                              }}
                            >
                              저장:{" "}
                              {formatDate(
                                lead.quote_created_at
                              )}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              shareQuote(
                                lead
                              )
                            }
                            style={{
                              ...secondaryButtonStyle,
                              marginTop:
                                "8px",
                              borderColor:
                                "#5d4037",
                              color:
                                "#5d4037",
                            }}
                          >
                            📤 견적 이미지 만들기 / 고객에게 전송
                          </button>
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
              alignItems:
                "center",
              gap: "8px",
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
                textAlign:
                  "center",
                fontSize:
                  "14px",
              }}
            >
              {leadPage} /{" "}
              {totalLeadPages}
            </div>

            <button
              type="button"
              disabled={
                leadPage >=
                totalLeadPages
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
        </>
      )}

      {/* =====================================================
          사진 크게 보기
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
            background:
              "rgba(0,0,0,.88)",
            zIndex:
              10000,
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
              top: "18px",
              right:
                "18px",
              border:
                "none",
              borderRadius:
                "999px",
              width:
                "44px",
              height:
                "44px",
              background:
                "#ffffff",
              fontSize:
                "22px",
              fontWeight:
                "bold",
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
            alt=""
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
      )}
    </main>
  );
    }
