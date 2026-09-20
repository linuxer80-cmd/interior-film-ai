"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  getLeadPhotoPaths,
  getUsagePhotoPaths,
  sanitizeSearchKeyword,
} from "./adminUtils";
import {
  JOB_PAGE_SIZE,
  LEAD_PAGE_SIZE,
  SIGNED_URL_SECONDS,
  PROJECT_ID,
} from "./adminConstants";
import { resizeImage, getImageHash } from "./imageUtils";
import {
  createEmbedding,
  analyzeImage,
  compareMultipleBeforeAfter,
} from "./aiUtils";
import PhotoPreviewModal from "./PhotoPreviewModal";
import AdminTabs from "./AdminTabs";
import NewLeadAlert from "./NewLeadAlert";
import JobsTab from "./JobsTab";
import RegisterTab from "./RegisterTab";
import UsageTab from "./UsageTab";
import LeadsTab from "./LeadsTab";
import SiteManagementTab from "./SiteManagementTab";
import WorkerManagement from "./WorkerManagement";
import useSites from "./hooks/useSites";
import useWorkers from "./hooks/useWorkers";
import {
  getCachedSignedUrl,
  setCachedSignedUrl,
} from "./signedUrlCache";
import { fetchUsageDashboard } from "./usageDataService";

export default function AdminPage() {
  const router = useRouter();
  const [currentCompany, setCurrentCompany] = useState(null);
  const [adminReady, setAdminReady] = useState(false);
  const companyId = currentCompany?.company_id || null;
  const companyName = currentCompany?.company_name || "업체";
  const [activeTab, setActiveTab] = useState("jobs");
  const activeTabRef = useRef("jobs");
    /* =========================================================
     현장 관리
  ========================================================= */

  const {
    sites,
    sitesLoading,
    sitesMessage,
    selectedSite,
    loadSites,
    createSite,
    updateSiteStatus,
    openSite,
    closeSite,
  } = useSites({
    companyId,
  });

  /* =========================================================
     시공자 관리
  ========================================================= */

  const {
    workers,
    workersLoading,
    workersMessage,
    loadWorkers,
    createWorker,
    updateWorker,
    setWorkerActive,
    assignSiteWorkers,
    loadSiteWorkers,
  } = useWorkers({
    companyId,
  });

  const [similarityThreshold, setSimilarityThreshold] = useState(0.65);
  const [settingMessage, setSettingMessage] = useState("");
  const [settingLoading, setSettingLoading] = useState(false);

  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);

  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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
     기존 시공사진 AI 구조분석
  ========================================================= */

  const [structureAnalysis, setStructureAnalysis] = useState({
    total: 0,
    completed: 0,
    remaining: 0,
    failed: 0,
    processed: 0,
    running: false,
    finished: false,
    message: "",
    errors: [],
  });

  const structureStopRef = useRef(false);

  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editMemo, setEditMemo] = useState("");

  const [previewPhoto, setPreviewPhoto] = useState(null);

  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editPhotoType, setEditPhotoType] = useState("before");
  const [editPhotoCategory, setEditPhotoCategory] = useState("");
  const [editPhotoSubCategory, setEditPhotoSubCategory] = useState("");
  const [editPhotoDescription, setEditPhotoDescription] = useState("");
  const [photoEditLoading, setPhotoEditLoading] = useState(false);

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

  const [openUsagePhotoId, setOpenUsagePhotoId] = useState(null);
  const [usagePhotoUrls, setUsagePhotoUrls] = useState({});
  const [usagePhotoLoadingId, setUsagePhotoLoadingId] = useState(null);

  function changeTab(tab) {
  activeTabRef.current = tab;
  setActiveTab(tab);

  if (tab === "sites") {
    loadSites(companyId);
  }

  if (tab === "usage") {
    loadUsageStats();
  }

  if (tab === "leads") {
    loadLeads(1, leadFilter);
  }
}

  useEffect(() => {
    let cancelled = false;

    async function checkAdminSession() {
      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!sessionData?.session?.user) {
          router.replace("/login");
          return;
        }

        const { data, error } = await supabase.rpc("get_my_company");
        if (error) throw error;

        const company = Array.isArray(data) ? data[0] : null;

        if (!company?.company_id || company.is_active === false) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        if (!cancelled) {
          setCurrentCompany(company);
          setAdminReady(true);
        }
      } catch (error) {
        console.error("관리자 로그인 확인:", error);
        if (!cancelled) {
          setAdminReady(false);
          router.replace("/login");
        }
      }
    }

    checkAdminSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!adminReady || !companyId) return;

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
      .channel(`customer-leads-admin-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_leads",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          handleRealtimeLead(payload.new);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminReady, companyId]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

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
      document.title = `🔴 신규 상담 | ${companyName}`;
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

      new Notification(companyName, {
        body: "신규 상담 알림이 활성화되었습니다.",
      });
    } catch (error) {
      console.error(error);
      alert(`알림 설정 오류: ${error?.message || "실패"}`);
    }
  }

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from("company_settings")
        .select("similarity_threshold")
        .eq("company_id", companyId)
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

      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        throw new Error("유사도 기준은 0~1 사이 숫자로 입력해주세요.");
      }

      const { error } = await supabase
        .from("company_settings")
        .update({
          similarity_threshold: threshold,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);

      if (error) throw error;

      setSettingMessage(
        `✅ AI 유사도 기준 ${Math.round(threshold * 100)}% 저장 완료`,
      );
    } catch (error) {
      setSettingMessage(`❌ 설정 저장 오류: ${error?.message || "실패"}`);
    } finally {
      setSettingLoading(false);
    }
  }

  async function toggleUsagePhotos(row) {
    if (!row?.id) return;

    if (openUsagePhotoId === row.id) {
      setOpenUsagePhotoId(null);
      return;
    }

    const paths = getUsagePhotoPaths(row);

    if (paths.length === 0) {
      setUsageMessage("⚠️ 이 자동견적에는 저장된 사진 경로가 없습니다.");
      return;
    }

    const cached = usagePhotoUrls[row.id];

    if (Array.isArray(cached) && cached.length > 0) {
      setOpenUsagePhotoId(row.id);
      return;
    }

    setUsagePhotoLoadingId(row.id);

    try {
      const urls = [];

      for (const path of paths) {
        const cachedUrl = getCachedSignedUrl(path);

        if (cachedUrl) {
          urls.push({ path, url: cachedUrl });
          continue;
        }

        const { data, error } = await supabase.storage
          .from("work-photos")
          .createSignedUrl(path, SIGNED_URL_SECONDS);

        if (error) {
          console.error("자동견적 사진 Signed URL 오류:", path, error);
          continue;
        }

        if (data?.signedUrl) {
          setCachedSignedUrl(
            path,
            data.signedUrl,
            SIGNED_URL_SECONDS,
          );

          urls.push({
            path,
            url: data.signedUrl,
          });
        }
      }

      if (urls.length === 0) {
        throw new Error(
          "저장된 사진을 불러올 수 없습니다. Storage 경로 또는 권한을 확인해주세요.",
        );
      }

      setUsagePhotoUrls((current) => ({
        ...current,
        [row.id]: urls,
      }));

      setOpenUsagePhotoId(row.id);

      if (urls.length < paths.length) {
        setUsageMessage(
          `⚠️ 사진 ${paths.length}장 중 ${urls.length}장만 불러왔습니다.`,
        );
      }
    } catch (error) {
      console.error("자동견적 사진 보기:", error);

      setUsageMessage(
        `❌ 자동견적 사진 오류: ${
          error?.message || "사진을 불러오지 못했습니다."
        }`,
      );
    } finally {
      setUsagePhotoLoadingId(null);
    }
  }

  async function loadUsageStats() {
    setUsageLoading(true);
    setUsageMessage("");

    try {
      const { stats, recent } = await fetchUsageDashboard(supabase, companyId);

      setUsageStats(stats);
      setUsageRecent(recent);
      setOpenUsagePhotoId(null);

      if (stats.total === 0) {
        setUsageMessage(
          "⚠️ estimate_usage 조회는 성공했지만 현재 확인되는 자동견적 로그가 없습니다.",
        );
      } else {
        const recentPhotoCount = recent.filter(
          (row) => getUsagePhotoPaths(row).length > 0,
        ).length;

        setUsageMessage(
          `✅ 자동견적 전체 ${stats.total.toLocaleString(
            "ko-KR",
          )}건 · 최근 목록 ${recent.length}건 · 최근 사진 저장 ${
            recentPhotoCount
          }건 · 상세상담 전환 ${stats.converted.toLocaleString(
            "ko-KR",
          )}건`,
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
        }\n\nSupabase의 estimate_usage RLS/SELECT 권한을 확인해주세요.`,
      );
    } finally {
      setUsageLoading(false);
    }
  }

  /* =========================================================
     AI 구조분석
     실제 API 오류를 화면에 표시하는 수정 버전
  ========================================================= */

  async function runStructureAnalysis() {
    if (structureAnalysis.running) return;

    const confirmed = window.confirm(
      "기존 시공사진의 구조를 AI로 분석합니다.\n\n" +
        "기존 카테고리, 금액, 임베딩은 변경하지 않고\n" +
        "새 구조분석 정보만 저장합니다.\n\n" +
        "사진 수에 따라 시간이 걸릴 수 있습니다.\n" +
        "시작할까요?",
    );

    if (!confirmed) return;

    structureStopRef.current = false;

    let totalFailed = 0;
    let totalProcessed = 0;
    let previousRemaining = null;
    let noProgressCount = 0;

    const collectedErrors = [];

    function collectApiErrors(data) {
      const results = Array.isArray(data?.results)
        ? data.results
        : [];

      for (const result of results) {
        if (result?.success !== false || !result?.error) {
          continue;
        }

        const photoId = result?.id
          ? String(result.id)
          : "ID 없음";

        const storagePath = result?.storage_path
          ? String(result.storage_path)
          : "";

        const errorText = String(result.error);

        const text = [
          `사진 ID: ${photoId}`,
          storagePath ? `경로: ${storagePath}` : "",
          `오류: ${errorText}`,
        ]
          .filter(Boolean)
          .join("\n");

        if (!collectedErrors.includes(text)) {
          collectedErrors.push(text);
        }
      }

      if (collectedErrors.length > 10) {
        collectedErrors.splice(10);
      }
    }

    function makeErrorMessage(prefix, remaining) {
      const visibleErrors = collectedErrors.slice(0, 3);

      let text = prefix;

      if (
        remaining !== null &&
        remaining !== undefined
      ) {
        text += `\n남은 사진 ${remaining}장`;
      }

      if (visibleErrors.length > 0) {
        text += "\n\n실제 오류:";

        visibleErrors.forEach((item, index) => {
          text += `\n\n${index + 1}. ${item}`;
        });

        if (collectedErrors.length > 3) {
          text += `\n\n외 ${collectedErrors.length - 3}개 오류`;
        }
      }

      return text;
    }

    setStructureAnalysis((current) => ({
      ...current,
      running: true,
      finished: false,
      failed: 0,
      processed: 0,
      errors: [],
      message: "AI 구조분석을 시작합니다...",
    }));

    try {
      while (!structureStopRef.current) {
        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        const accessToken =
          sessionData?.session?.access_token;

        if (!accessToken) {
          throw new Error(
            "로그인 세션이 만료되었습니다. 다시 로그인해주세요.",
          );
        }

        const response = await fetch("/api/analyze-work-structure", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            limit: 3,
          }),
        });

        let data;

        try {
          data = await response.json();
        } catch {
          throw new Error(
            `구조분석 API 응답을 읽을 수 없습니다. HTTP ${response.status}`,
          );
        }

        if (!response.ok || !data?.success) {
          const apiError =
            data?.error ||
            `구조분석 API 오류 (${response.status})`;

          if (!collectedErrors.includes(apiError)) {
            collectedErrors.push(apiError);
          }

          throw new Error(apiError);
        }

        collectApiErrors(data);

        const total = Number(data.total || 0);
        const completed = Number(data.completed || 0);
        const remaining = Number(data.remaining || 0);
        const processed = Number(data.processed || 0);
        const failed = Number(data.failed || 0);

        totalProcessed += processed;
        totalFailed += failed;

        if (structureStopRef.current) {
          setStructureAnalysis({
            total,
            completed,
            remaining,
            failed: totalFailed,
            processed: totalProcessed,
            running: false,
            finished: false,
            errors: [...collectedErrors],
            message: makeErrorMessage(
              "⏸️ 구조분석을 중지했습니다. 다시 시작하면 남은 사진부터 계속합니다.",
              remaining,
            ),
          });

          break;
        }

        setStructureAnalysis({
          total,
          completed,
          remaining,
          failed: totalFailed,
          processed: totalProcessed,
          running: true,
          finished:
            data.finished === true ||
            remaining === 0,
          errors: [...collectedErrors],
          message:
            remaining === 0
              ? "✅ 기존 시공사진 구조분석이 완료되었습니다."
              : `AI 구조분석 중... ${completed}/${total}`,
        });

        if (
          data.finished === true ||
          remaining === 0
        ) {
          setStructureAnalysis((current) => ({
            ...current,
            running: false,
            finished: true,
            errors: [...collectedErrors],
            message:
              totalFailed > 0
                ? makeErrorMessage(
                    `✅ 구조분석 완료 · 완료 ${completed}장 · 이번 실행 실패 ${totalFailed}회`,
                    0,
                  )
                : "✅ 기존 시공사진 구조분석이 완료되었습니다.",
          }));

          break;
        }

        if (
          processed > 0 ||
          previousRemaining === null ||
          remaining < previousRemaining
        ) {
          noProgressCount = 0;
        } else {
          noProgressCount += 1;
        }

        previousRemaining = remaining;

        if (noProgressCount >= 2) {
          setStructureAnalysis((current) => ({
            ...current,
            running: false,
            finished: false,
            errors: [...collectedErrors],
            message: makeErrorMessage(
              "⚠️ 반복 실패로 자동 분석을 중단했습니다.",
              remaining,
            ),
          }));

          break;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 500),
        );
      }
    } catch (error) {
      console.error("시공사진 구조분석:", error);

      const errorText =
        error?.message || "실패";

      if (!collectedErrors.includes(errorText)) {
        collectedErrors.push(errorText);
      }

      setStructureAnalysis((current) => ({
        ...current,
        running: false,
        finished: false,
        errors: [...collectedErrors],
        message: makeErrorMessage(
          `❌ 구조분석 오류: ${errorText}`,
          current.remaining,
        ),
      }));
    }
  }

  function stopStructureAnalysis() {
    structureStopRef.current = true;

    setStructureAnalysis((current) => ({
      ...current,
      running: false,
      message:
        "⏸️ 구조분석 중지를 요청했습니다. 현재 처리 중인 사진이 끝나면 중지됩니다.",
    }));
  }

  /* =========================================================
     시공 DB
  ========================================================= */

  async function loadJobs(
    page = 1,
    keyword = jobSearchApplied,
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
          },
        )
        .eq("company_id", companyId);

      if (safeKeyword) {
        query = query.or(
          `category.ilike.%${safeKeyword}%,sub_category.ilike.%${safeKeyword}%,memo.ilike.%${safeKeyword}%`,
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
        }`,
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
        `,
        )
        .eq("work_item_id", workItemId)
        .eq("company_id", companyId)
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
        }`,
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
    if (!photo?.storage_path) {
      return null;
    }

    if (jobPhotoUrls[photo.id]) {
      return jobPhotoUrls[photo.id];
    }

    const cachedUrl = getCachedSignedUrl(photo.storage_path);

    if (cachedUrl) {
      setJobPhotoUrls((current) => ({
        ...current,
        [photo.id]: cachedUrl,
      }));

      return cachedUrl;
    }

    setLoadingPhotoId(photo.id);

    try {
      const { data, error } = await supabase.storage
        .from("work-photos")
        .createSignedUrl(
          photo.storage_path,
          SIGNED_URL_SECONDS,
        );

      if (error) throw error;

      const url = data?.signedUrl;

      if (!url) {
        throw new Error("사진 주소를 만들 수 없습니다.");
      }

      setCachedSignedUrl(
        photo.storage_path,
        url,
        SIGNED_URL_SECONDS,
      );

      setJobPhotoUrls((current) => ({
        ...current,
        [photo.id]: url,
      }));

      return url;
    } catch (error) {
      setJobsMessage(
        `❌ 사진 오류: ${
          error?.message || "실패"
        }`,
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
        "",
    );

    setEditCost(
      job.actual_cost !== null &&
        job.actual_cost !== undefined
        ? String(job.actual_cost)
        : "",
    );

    setEditMemo(job.memo || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveJobEdit(jobId) {
    const cost = Number(
      String(editCost).replace(/,/g, ""),
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
          memo: editMemo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("company_id", companyId);

      if (error) throw error;

      setEditingId(null);

      setJobsMessage(
        "✅ 시공 데이터가 수정되었습니다.",
      );

      await loadJobs(
        jobPage,
        jobSearchApplied,
      );
    } catch (error) {
      setJobsMessage(
        `❌ 수정 오류: ${
          error?.message || "실패"
        }`,
      );
    }
  }

  /* =========================================================
     사진정보 수정
  ========================================================= */

  function startPhotoEdit(photo) {
    setEditingPhotoId(photo.id);

    setEditPhotoType(
      photo.photo_type || "before",
    );

    setEditPhotoCategory(
      photo.category || "",
    );

    setEditPhotoSubCategory(
      photo.sub_category ||
        photo.category ||
        "",
    );

    setEditPhotoDescription(
      photo.ai_description || "",
    );
  }

  function cancelPhotoEdit() {
    setEditingPhotoId(null);
  }

  async function savePhotoEdit(photoId, workItemId) {
    if (!photoId) return;

    setPhotoEditLoading(true);
    setJobsMessage("");

    try {
      const { error } = await supabase
        .from("work_photos")
        .update({
          photo_type: editPhotoType || "before",
          category: editPhotoCategory.trim() || null,
          sub_category:
            editPhotoSubCategory.trim() ||
            editPhotoCategory.trim() ||
            null,
          ai_description:
            editPhotoDescription.trim() || null,
        })
        .eq("id", photoId)
        .eq("company_id", companyId);

      if (error) throw error;

      setEditingPhotoId(null);

      setJobsMessage(
        "✅ 사진 정보가 수정되었습니다.",
      );

      await loadJobPhotos(workItemId);
    } catch (error) {
      console.error("사진 수정:", error);

      setJobsMessage(
        `❌ 사진 수정 오류: ${
          error?.message || "실패"
        }`,
      );
    } finally {
      setPhotoEditLoading(false);
    }
  }

  /* =========================================================
     사진 삭제
  ========================================================= */

  async function deletePhoto(photo, workItemId) {
    if (!photo?.id) return;

    const confirmed = window.confirm(
      "이 사진을 삭제할까요?\n삭제 후 복구할 수 없습니다.",
    );

    if (!confirmed) return;

    setJobsMessage("");

    try {
      if (photo.storage_path) {
        const { error: storageError } =
          await supabase.storage
            .from("work-photos")
            .remove([photo.storage_path]);

        if (storageError) {
          console.error(
            "Storage 사진 삭제:",
            storageError,
          );
        }
      }

      const { error } = await supabase
        .from("work_photos")
        .delete()
        .eq("id", photo.id)
        .eq("company_id", companyId);

      if (error) throw error;

      setJobPhotoUrls((current) => {
        const next = { ...current };
        delete next[photo.id];
        return next;
      });

      setJobsMessage(
        "✅ 사진이 삭제되었습니다.",
      );

      await loadJobPhotos(workItemId);
    } catch (error) {
      console.error("사진 삭제:", error);

      setJobsMessage(
        `❌ 사진 삭제 오류: ${
          error?.message || "실패"
        }`,
      );
    }
  }

  /* =========================================================
     시공 데이터 삭제
  ========================================================= */

  async function deleteJob(job) {
    if (!job?.id) return;

    const confirmed = window.confirm(
      `"${job.category || "시공 데이터"}"를 삭제할까요?\n\n연결된 사진도 함께 삭제됩니다.\n삭제 후 복구할 수 없습니다.`,
    );

    if (!confirmed) return;

    setJobsMessage("");

    try {
      const { data: photos, error: photoLoadError } =
        await supabase
          .from("work_photos")
          .select("id, storage_path")
          .eq("work_item_id", job.id)
          .eq("company_id", companyId);

      if (photoLoadError) {
        throw photoLoadError;
      }

      const storagePaths = (photos || [])
        .map((photo) => photo.storage_path)
        .filter(Boolean);

      if (storagePaths.length > 0) {
        const { error: storageError } =
          await supabase.storage
            .from("work-photos")
            .remove(storagePaths);

        if (storageError) {
          console.error(
            "시공 사진 Storage 삭제:",
            storageError,
          );
        }
      }

      const { error: photoDeleteError } =
        await supabase
          .from("work_photos")
          .delete()
          .eq("work_item_id", job.id)
          .eq("company_id", companyId);

      if (photoDeleteError) {
        throw photoDeleteError;
      }

      const { error: itemDeleteError } =
        await supabase
          .from("work_items")
          .delete()
          .eq("id", job.id)
          .eq("company_id", companyId);

      if (itemDeleteError) {
        throw itemDeleteError;
      }

      setOpenJobId(null);

      setJobPhotos((current) => {
        const next = { ...current };
        delete next[job.id];
        return next;
      });

      setJobsMessage(
        "✅ 시공 데이터가 삭제되었습니다.",
      );

      const nextTotal = Math.max(
        0,
        jobTotal - 1,
      );

      const nextTotalPages = Math.max(
        1,
        Math.ceil(
          nextTotal / JOB_PAGE_SIZE,
        ),
      );

      const nextPage = Math.min(
        jobPage,
        nextTotalPages,
      );

      await loadJobs(
        nextPage,
        jobSearchApplied,
      );
    } catch (error) {
      console.error("시공 데이터 삭제:", error);

      setJobsMessage(
        `❌ 삭제 오류: ${
          error?.message || "실패"
        }`,
      );
    }
  }

  /* =========================================================
     시공 등록용 파일 처리
  ========================================================= */

  function normalizeFileList(files) {
    if (!files) return [];

    return Array.from(files).filter(
      (file) =>
        file &&
        typeof file.type === "string" &&
        file.type.startsWith("image/"),
    );
  }

  function handleBeforeFiles(event) {
    const files = normalizeFileList(
      event?.target?.files,
    );

    if (files.length === 0) return;

    setBeforeImages((current) => [
      ...current,
      ...files,
    ]);

    if (event?.target) {
      event.target.value = "";
    }
  }

  function handleAfterFiles(event) {
    const files = normalizeFileList(
      event?.target?.files,
    );

    if (files.length === 0) return;

    setAfterImages((current) => [
      ...current,
      ...files,
    ]);

    if (event?.target) {
      event.target.value = "";
    }
  }

  function removeBeforeImage(index) {
    setBeforeImages((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index,
      ),
    );
  }

  function removeAfterImage(index) {
    setAfterImages((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index,
      ),
    );
  }

  /* =========================================================
     시공 등록
  ========================================================= */

  async function handleSave() {
    if (loading) return;

    const cleanCategory =
      String(category || "").trim();

    const cleanMaterial =
      String(material || "").trim();

    const cleanMemo =
      String(memo || "").trim();

    const cost = Number(
      String(actualCost || "")
        .replace(/,/g, "")
        .trim(),
    );

    if (!cleanCategory) {
      setMessage(
        "⚠️ 시공 부위를 입력해주세요.",
      );
      return;
    }

    if (
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      setMessage(
        "⚠️ 실제 시공금액을 입력해주세요.",
      );
      return;
    }

    if (
      beforeImages.length === 0 &&
      afterImages.length === 0
    ) {
      setMessage(
        "⚠️ 시공 전 또는 시공 후 사진을 1장 이상 등록해주세요.",
      );
      return;
    }

    setLoading(true);
    setMessage(
      "사진을 분석하고 시공 데이터를 저장하고 있습니다...",
    );

    let workItemId = null;

    try {
      const {
        data: workItem,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert({
          company_id: companyId,
          project_id: PROJECT_ID,
          category: cleanCategory,
          sub_category: cleanCategory,
          actual_cost: cost,
          memo: cleanMemo || null,
        })
        .select("id")
        .single();

      if (workItemError) {
        throw workItemError;
      }

      workItemId = workItem?.id;

      if (!workItemId) {
        throw new Error(
          "시공 데이터 ID를 생성하지 못했습니다.",
        );
      }

      const savePhoto = async (
        file,
        photoType,
        index,
      ) => {
        if (!file) return;

        let resizedFile = file;

        try {
          resizedFile =
            await resizeImage(file);
        } catch (resizeError) {
          console.error(
            "이미지 리사이즈:",
            resizeError,
          );

          resizedFile = file;
        }

        let imageHash = null;

        try {
          imageHash =
            await getImageHash(
              resizedFile,
            );
        } catch (hashError) {
          console.error(
            "이미지 해시:",
            hashError,
          );
        }

        const extension =
          String(
            resizedFile?.name ||
              file?.name ||
              "",
          )
            .split(".")
            .pop()
            ?.toLowerCase() ||
          "jpg";

        const safeExtension =
          extension === "jpeg"
            ? "jpg"
            : extension;

        const storagePath =
          `history/${companyId}/${Date.now()}_${workItemId}_${photoType}_${index}.${safeExtension}`;

        const { error: uploadError } =
          await supabase.storage
            .from("work-photos")
            .upload(
              storagePath,
              resizedFile,
              {
                cacheControl: "3600",
                upsert: false,
                contentType:
                  resizedFile.type ||
                  file.type ||
                  "image/jpeg",
              },
            );

        if (uploadError) {
          throw uploadError;
        }

        let aiResult = null;

        try {
          aiResult =
            await analyzeImage(
              resizedFile,
              photoType,
            );
        } catch (analysisError) {
          console.error(
            "사진 AI 분석:",
            analysisError,
          );
        }

        const aiDescription =
          String(
            aiResult?.description ||
              aiResult?.ai_description ||
              "",
          ).trim();

        const aiTags = Array.isArray(
          aiResult?.tags,
        )
          ? aiResult.tags
          : Array.isArray(
                aiResult?.ai_tags,
              )
            ? aiResult.ai_tags
            : [];

        const detectedCategory =
          String(
            aiResult?.category ||
              cleanCategory,
          ).trim() ||
          cleanCategory;

        const detectedSubCategory =
          String(
            aiResult?.sub_category ||
              aiResult?.subcategory ||
              detectedCategory,
          ).trim() ||
          detectedCategory;

        let embedding = null;

        try {
          const embeddingText = [
            detectedCategory,
            detectedSubCategory,
            aiDescription,
            ...aiTags,
          ]
            .filter(Boolean)
            .join(" ");

          if (embeddingText) {
            embedding =
              await createEmbedding(
                embeddingText,
              );
          }
        } catch (embeddingError) {
          console.error(
            "임베딩 생성:",
            embeddingError,
          );
        }

        const {
          error: photoInsertError,
        } = await supabase
          .from("work_photos")
          .insert({
            company_id: companyId,
            project_id: PROJECT_ID,
            work_item_id: workItemId,
            photo_type: photoType,
            category:
              detectedCategory,
            sub_category:
              detectedSubCategory,
            storage_path:
              storagePath,
            photo_url: null,
            ai_description:
              aiDescription || null,
            ai_tags:
              aiTags.length > 0
                ? aiTags
                : null,
            embedding:
              embedding || null,
            image_hash:
              imageHash || null,
          });

        if (photoInsertError) {
          try {
            await supabase.storage
              .from("work-photos")
              .remove([
                storagePath,
              ]);
          } catch {}

          throw photoInsertError;
        }
      };

      for (
        let index = 0;
        index < beforeImages.length;
        index += 1
      ) {
        setMessage(
          `시공 전 사진 ${
            index + 1
          }/${beforeImages.length} 저장 중...`,
        );

        await savePhoto(
          beforeImages[index],
          "before",
          index,
        );
      }

      for (
        let index = 0;
        index < afterImages.length;
        index += 1
      ) {
        setMessage(
          `시공 후 사진 ${
            index + 1
          }/${afterImages.length} 저장 중...`,
        );

        await savePhoto(
          afterImages[index],
          "after",
          index,
        );
      }

      if (
        beforeImages.length > 0 &&
        afterImages.length > 0
      ) {
        try {
          await compareMultipleBeforeAfter(
            beforeImages,
            afterImages,
          );
        } catch (compareError) {
          console.error(
            "전후 비교:",
            compareError,
          );
        }
      }

      setBeforeImages([]);
      setAfterImages([]);
      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");

      setMessage(
        "✅ 시공 데이터가 저장되었습니다.",
      );

      await loadJobs(
        1,
        jobSearchApplied,
      );
    } catch (error) {
      console.error(
        "시공 등록:",
        error,
      );

      if (workItemId) {
        try {
          const {
            data: savedPhotos,
          } = await supabase
            .from("work_photos")
            .select(
              "id, storage_path",
            )
            .eq(
              "work_item_id",
              workItemId,
            )
            .eq("company_id", companyId);

          const paths =
            (savedPhotos || [])
              .map(
                (photo) =>
                  photo.storage_path,
              )
              .filter(Boolean);

          if (paths.length > 0) {
            await supabase.storage
              .from("work-photos")
              .remove(paths);
          }

          await supabase
            .from("work_photos")
            .delete()
            .eq(
              "work_item_id",
              workItemId,
            )
            .eq("company_id", companyId);

          await supabase
            .from("work_items")
            .delete()
            .eq(
              "id",
              workItemId,
            )
            .eq("company_id", companyId);
        } catch (
          cleanupError
        ) {
          console.error(
            "시공 등록 실패 후 정리:",
            cleanupError,
          );
        }
      }

      setMessage(
        `❌ 저장 오류: ${
          error?.message ||
          "시공 데이터 저장에 실패했습니다."
        }`,
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     고객 상담 - 미확인 수
  ========================================================= */

  async function loadUnreadCount() {
    try {
      const { count, error } =
        await supabase
          .from("customer_leads")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("company_id", companyId)
          .eq("is_read", false);

      if (error) {
        console.error(
          "미확인 상담 수:",
          error,
        );
        return;
      }

      setUnreadCount(
        count || 0,
      );
    } catch (error) {
      console.error(
        "미확인 상담 수:",
        error,
      );
    }
      }
    /* =========================================================
     고객 상담 목록
  ========================================================= */

  async function loadLeads(
    page = 1,
    filter = leadFilter,
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
        .from(
          "customer_leads",
        )
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
        .range(from, to);

      if (error) throw error;

      setLeads(
        data || [],
      );

      setLeadTotal(
        count || 0,
      );

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
          .eq("company_id", companyId);

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

  async function toggleLeadDetail(
    lead,
  ) {
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

  async function loadLeadPhotos(
    lead,
  ) {
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
            "고객 사진:",
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
          "고객 사진을 불러오지 못했습니다.",
        );
      }

      setLeadPhotoUrls(
        (current) => ({
          ...current,
          [lead.id]: urls,
        }),
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 고객 사진 오류: ${
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
    try {
      const { error } =
        await supabase
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
          .eq("company_id", companyId);

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

  async function saveLeadMemo(
    leadId,
    memo,
  ) {
    try {
      const { error } =
        await supabase
          .from(
            "customer_leads",
          )
          .update({
            admin_memo:
              memo || null,
          })
          .eq(
            "id",
            leadId,
          )
          .eq("company_id", companyId);

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
          .eq("company_id", companyId);

      if (error) throw error;

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

  /* =========================================================
     화면 계산
  ========================================================= */

  const totalJobPages =
    Math.max(
      1,
      Math.ceil(
        jobTotal /
          JOB_PAGE_SIZE,
      ),
    );

  const totalLeadPages =
    Math.max(
      1,
      Math.ceil(
        leadTotal /
          LEAD_PAGE_SIZE,
      ),
    );

  /* =========================================================
     화면
  ========================================================= */

  if (!adminReady || !companyId) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          color: "#6b7280",
          fontSize: "14px",
          fontWeight: "700",
        }}
      >
        관리자 계정을 확인하고 있습니다...
      </main>
    );
  }

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
        color: "#111827",
      }}
    >
      <NewLeadAlert
        newLeadAlert={
          newLeadAlert
        }
        setNewLeadAlert={
          setNewLeadAlert
        }
        changeTab={
          changeTab
        }
      />

      <h1
        style={{
          fontSize: "24px",
          margin:
            "8px 0 16px",
        }}
      >
        {companyName} 관리자
      </h1>

      <AdminTabs
        activeTab={
          activeTab
        }
        changeTab={
          changeTab
        }
        unreadCount={
          unreadCount
        }
      />

      {/* =====================================================
          시공 DB
      ===================================================== */}

      {activeTab ===
        "jobs" && (
        <JobsTab
          jobSearch={
            jobSearch
          }
          setJobSearch={
            setJobSearch
          }
          searchJobs={
            searchJobs
          }
          clearJobSearch={
            clearJobSearch
          }
          jobSearchApplied={
            jobSearchApplied
          }
          jobTotal={
            jobTotal
          }
          jobsMessage={
            jobsMessage
          }

          structureAnalysis={
            structureAnalysis
          }
          runStructureAnalysis={
            runStructureAnalysis
          }
          stopStructureAnalysis={
            stopStructureAnalysis
          }

          jobsLoading={
            jobsLoading
          }
          jobs={jobs}
          editingId={
            editingId
          }
          editCategory={
            editCategory
          }
          setEditCategory={
            setEditCategory
          }
          editSubCategory={
            editSubCategory
          }
          setEditSubCategory={
            setEditSubCategory
          }
          editCost={
            editCost
          }
          setEditCost={
            setEditCost
          }
          editMemo={
            editMemo
          }
          setEditMemo={
            setEditMemo
          }
          saveJobEdit={
            saveJobEdit
          }
          cancelEdit={
            cancelEdit
          }
          startEdit={
            startEdit
          }
          deleteJob={
            deleteJob
          }
          openJobId={
            openJobId
          }
          toggleJobDetail={
            toggleJobDetail
          }
          jobPhotoLoadingId={
            jobPhotoLoadingId
          }
          jobPhotos={
            jobPhotos
          }
          jobPhotoUrls={
            jobPhotoUrls
          }
          loadingPhotoId={
            loadingPhotoId
          }
          editingPhotoId={
            editingPhotoId
          }
          setPreviewPhoto={
            setPreviewPhoto
          }
          loadSingleJobPhoto={
            loadSingleJobPhoto
          }
          startPhotoEdit={
            startPhotoEdit
          }
          deletePhoto={
            deletePhoto
          }
          editPhotoType={
            editPhotoType
          }
          setEditPhotoType={
            setEditPhotoType
          }
          editPhotoCategory={
            editPhotoCategory
          }
          setEditPhotoCategory={
            setEditPhotoCategory
          }
          editPhotoSubCategory={
            editPhotoSubCategory
          }
          setEditPhotoSubCategory={
            setEditPhotoSubCategory
          }
          editPhotoDescription={
            editPhotoDescription
          }
          setEditPhotoDescription={
            setEditPhotoDescription
          }
          photoEditLoading={
            photoEditLoading
          }
          savePhotoEdit={
            savePhotoEdit
          }
          cancelPhotoEdit={
            cancelPhotoEdit
          }
          jobPage={
            jobPage
          }
          totalJobPages={
            totalJobPages
          }
          loadJobs={
            loadJobs
          }
        />
      )}
      {/* =====================================================
          시공 등록
      ===================================================== */}

      {activeTab ===
        "register" && (
        <RegisterTab
          category={
            category
          }
          setCategory={
            setCategory
          }
          actualCost={
            actualCost
          }
          setActualCost={
            setActualCost
          }
          material={
            material
          }
          setMaterial={
            setMaterial
          }
          memo={
            memo
          }
          setMemo={
            setMemo
          }
          beforeImages={
            beforeImages
          }
          setBeforeImages={
            setBeforeImages
          }
          afterImages={
            afterImages
          }
          setAfterImages={
            setAfterImages
          }

          handleBeforeFiles={
            handleBeforeFiles
          }
          handleAfterFiles={
            handleAfterFiles
          }
          removeBeforeImage={
            removeBeforeImage
          }
          removeAfterImage={
            removeAfterImage
          }

          loading={
            loading
          }
          handleSave={
            handleSave
          }
          message={
            message
          }

          similarityThreshold={
            similarityThreshold
          }
          setSimilarityThreshold={
            setSimilarityThreshold
          }
          settingLoading={
            settingLoading
          }
          saveSimilaritySetting={
            saveSimilaritySetting
          }
          settingMessage={
            settingMessage
          }
        />
      )}
      {/* =====================================================
          현장 관리
      ===================================================== */}

      {activeTab === "sites" && (
        <SiteManagementTab
          sites={sites}
          sitesLoading={sitesLoading}
          sitesMessage={sitesMessage}
          createSite={createSite}
          updateSiteStatus={updateSiteStatus}
          selectedSite={selectedSite}
          openSite={openSite}
          closeSite={closeSite}
          workers={workers}
          workersLoading={workersLoading}
          workersMessage={workersMessage}
          loadWorkers={loadWorkers}
          createWorker={createWorker}
          updateWorker={updateWorker}
          setWorkerActive={setWorkerActive}
          assignSiteWorkers={assignSiteWorkers}
          loadSiteWorkers={loadSiteWorkers}
          reloadSites={() => loadSites(companyId)}
        />
      )}
      {/* =====================================================
          로그 분석
      ===================================================== */}

      {activeTab ===
        "usage" && (
        <UsageTab
          usageStats={
            usageStats
          }
          usageMessage={
            usageMessage
          }
          usageLoading={
            usageLoading
          }
          loadUsageStats={
            loadUsageStats
          }
          usageRecent={
            usageRecent
          }
          usagePhotoUrls={
            usagePhotoUrls
          }
          openUsagePhotoId={
            openUsagePhotoId
          }
          usagePhotoLoadingId={
            usagePhotoLoadingId
          }
          toggleUsagePhotos={
            toggleUsagePhotos
          }
          setPreviewPhoto={
            setPreviewPhoto
          }
        />
      )}

      {/* =====================================================
          고객 상담
      ===================================================== */}

      {activeTab ===
        "leads" && (
        <LeadsTab
          leadFilter={
            leadFilter
          }
          setLeadFilter={
            setLeadFilter
          }
          loadLeads={
            loadLeads
          }
          leadTotal={
            leadTotal
          }
          unreadCount={
            unreadCount
          }
          notificationEnabled={
            notificationEnabled
          }
          enableNotifications={
            enableNotifications
          }
          leadsMessage={
            leadsMessage
          }
          leadsLoading={
            leadsLoading
          }
          leads={
            leads
          }
          updateLeadStatus={
            updateLeadStatus
          }
          openLeadId={
            openLeadId
          }
          toggleLeadDetail={
            toggleLeadDetail
          }
          leadPhotoUrls={
            leadPhotoUrls
          }
          leadPhotoLoadingId={
            leadPhotoLoadingId
          }
          loadLeadPhotos={
            loadLeadPhotos
          }
          setPreviewPhoto={
            setPreviewPhoto
          }
          saveLeadMemo={
            saveLeadMemo
          }
          updateLeadLocal={
            updateLeadLocal
          }
          saveFinalQuote={
            saveFinalQuote
          }
          setLeadsMessage={
            setLeadsMessage
          }
          leadPage={
            leadPage
          }
          totalLeadPages={
            totalLeadPages
          }
        />
      )}

      {/* =====================================================
          사진 크게 보기
      ===================================================== */}

      <PhotoPreviewModal
        previewPhoto={
          previewPhoto
        }
        setPreviewPhoto={
          setPreviewPhoto
        }
      />
    </main>
  );
}
