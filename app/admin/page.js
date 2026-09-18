"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  getCachedSignedUrl,
  setCachedSignedUrl,
} from "./signedUrlCache";
import { fetchUsageDashboard } from "./usageDataService";

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
        },
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

      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
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
        `✅ AI 유사도 기준 ${Math.round(threshold * 100)}% 저장 완료`,
      );
    } catch (error) {
      setSettingMessage(`❌ 설정 저장 오류: ${error?.message || "실패"}`);
    } finally {
      setSettingLoading(false);
    }
  }

  /* =========================================================
     자동견적 사진 보기
  ========================================================= */

  async function toggleUsagePhotos(row) {
    if (!row?.id) {
      return;
    }

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
          urls.push({
            path,
            url: cachedUrl,
          });

          continue;
        }

        const { data, error } = await supabase.storage
          .from("work-photos")
          .createSignedUrl(path, SIGNED_URL_SECONDS);

        if (error) {
          console.error(
            "자동견적 사진 Signed URL 오류:",
            path,
            error,
          );

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

  /* =========================================================
     사용자 로그 분석
  ========================================================= */

  async function loadUsageStats() {
    setUsageLoading(true);
    setUsageMessage("");

    try {
      const { stats, recent } =
        await fetchUsageDashboard(supabase);

      setUsageStats(stats);
      setUsageRecent(recent);
      setOpenUsagePhotoId(null);

      if (stats.total === 0) {
        setUsageMessage(
          "⚠️ estimate_usage 조회는 성공했지만 현재 확인되는 자동견적 로그가 없습니다.",
        );
      } else {
        const recentPhotoCount =
          recent.filter(
            (row) =>
              getUsagePhotoPaths(row).length > 0,
          ).length;

        setUsageMessage(
          `✅ 자동견적 전체 ${stats.total.toLocaleString(
            "ko-KR",
          )}건 · 최근 목록 ${
            recent.length
          }건 · 최근 사진 저장 ${
            recentPhotoCount
          }건 · 상세상담 전환 ${stats.converted.toLocaleString(
            "ko-KR",
          )}건`,
        );
      }
    } catch (error) {
      console.error(
        "사용자 로그 통계 오류:",
        error,
      );

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
          error?.message ||
          "estimate_usage 조회에 실패했습니다."
        }\n\nSupabase의 estimate_usage RLS/SELECT 권한을 확인해주세요.`,
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
    keyword = jobSearchApplied,
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
          },
        );

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
          error?.message ||
          "불러오기 실패"
        }`,
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
        `,
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

    const cachedUrl =
      getCachedSignedUrl(
        photo.storage_path,
      );

    if (cachedUrl) {
      setJobPhotoUrls((current) => ({
        ...current,
        [photo.id]: cachedUrl,
      }));

      return cachedUrl;
    }

    setLoadingPhotoId(photo.id);

    try {
      const { data, error } =
        await supabase.storage
          .from("work-photos")
          .createSignedUrl(
            photo.storage_path,
            SIGNED_URL_SECONDS,
          );

      if (error) throw error;

      const url = data?.signedUrl;

      if (!url) {
        throw new Error(
          "사진 주소를 만들 수 없습니다.",
        );
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
      url =
        await loadSingleJobPhoto(
          photo,
        );
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
      job.category || "",
    );
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
      String(editCost).replace(
        /,/g,
        "",
      ),
    );

    if (!editCategory.trim()) {
      setJobsMessage(
        "⚠️ 시공 부위를 입력해주세요.",
      );
      return;
    }

    if (
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      setJobsMessage(
        "⚠️ 실제 시공금액을 입력해주세요.",
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

  async function savePhotoEdit(photo) {
    if (!editPhotoCategory.trim()) {
      setJobsMessage(
        "⚠️ 사진 카테고리를 입력해주세요.",
      );
      return;
    }

    setPhotoEditLoading(true);

    try {
      let tags = Array.isArray(
        photo.ai_tags,
      )
        ? [...photo.ai_tags]
        : [];

      tags = tags.filter(
        (tag) =>
          tag !== "시공전" &&
          tag !== "시공후" &&
          tag !== "전후비교",
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
            const embedding = await createEmbedding(searchText);

      const embedding =
        await createEmbedding(
          searchText,
        );

      const { error } = await supabase
        .from("work_photos")
        .update({
          photo_type: editPhotoType,
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
        "✅ 사진 정보가 수정되었습니다.",
      );

      await loadJobPhotos(
        photo.work_item_id,
      );
    } catch (error) {
      setJobsMessage(
        `❌ 사진 수정 오류: ${
          error?.message || "실패"
        }`,
      );
    } finally {
      setPhotoEditLoading(false);
    }
  }

  async function deletePhoto(photo) {
    if (
      !window.confirm(
        "이 사진을 완전히 삭제하시겠습니까?",
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
            item.id !== photo.id,
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
        "✅ 사진이 삭제되었습니다.",
      );
    } catch (error) {
      setJobsMessage(
        `❌ 사진 삭제 오류: ${
          error?.message || "실패"
        }`,
      );
    }
  }

  async function deleteJob(job) {
    if (
      !window.confirm(
        "이 시공건과 연결된 모든 사진까지 완전히 삭제하시겠습니까?",
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
            photo.storage_path,
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
        "✅ 시공건이 삭제되었습니다.",
      );

      const targetPage =
        jobs.length === 1 &&
        jobPage > 1
          ? jobPage - 1
          : jobPage;

      await loadJobs(
        targetPage,
        jobSearchApplied,
      );
    } catch (error) {
      setJobsMessage(
        `❌ 시공 삭제 오류: ${
          error?.message || "실패"
        }`,
      );
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
        0.7,
      );

    const imageHash =
      await getImageHash(
        compressed,
      );

    const {
      data: duplicates,
      error: duplicateError,
    } = await supabase
      .from("work_photos")
      .select("id,photo_type")
      .eq("image_hash", imageHash)
      .or(
        "photo_type.is.null,photo_type.neq.customer",
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
          searchText,
        );
    } catch (error) {
      console.error(
        "임베딩:",
        error,
      );
    }

    const storagePath = `history/${projectId}/${workItemId}/${photoType}/${Date.now()}-${crypto.randomUUID()}.jpg`;

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
              "31536000",
            upsert: false,
          },
        );

    if (uploadError) {
      throw uploadError;
    }

    try {
      const { data: publicData } =
        supabase.storage
          .from("work-photos")
          .getPublicUrl(storagePath);

      const photoUrl =
        publicData?.publicUrl ||
        storagePath;

      const { error } =
        await supabase
          .from("work_photos")
          .insert({
            work_item_id:
              workItemId,
            project_id: projectId,
            photo_type: photoType,
            category: finalCategory,
            sub_category:
              finalSubCategory,
            storage_path:
              storagePath,
            photo_url: photoUrl,
            ai_description:
              description,
            ai_tags: tags,
            embedding,
            image_hash: imageHash,
          });

      if (error) throw error;

      return {
        skipped: false,
      };
    } catch (error) {
      try {
        await supabase.storage
          .from("work-photos")
          .remove([storagePath]);
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
        "⚠️ 시공 전 또는 시공 후 사진을 한 장 이상 선택해주세요.",
      );

      return;
    }

    if (!category.trim()) {
      setMessage(
        "⚠️ 시공 부위를 입력해주세요.",
      );

      return;
    }

    const cost = Number(
      String(actualCost).replace(
        /,/g,
        "",
      ),
    );

    if (
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      setMessage(
        "⚠️ 실제 시공금액을 정확히 입력해주세요.",
      );

      return;
    }

    setLoading(true);

    setMessage(
      "시공 데이터를 생성하고 있습니다...",
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
        .insert({          project_id: PROJECT_ID,
          category: category.trim(),
          sub_category:
            category.trim(),
          actual_cost: cost,
          memo:
            combinedMemo || null,
        })
        .select()
        .single();

      if (error) throw error;

      workItemId = workItem.id;

      setMessage(
        "AI가 시공 전/후 사진을 비교하고 있습니다...",
      );

      const comparison =
        await compareMultipleBeforeAfter(
          beforeImages,
          afterImages,
        );

      const allPhotos = [
        ...beforeImages.map(
          (file) => ({
            file,
            type: "before",
          }),
        ),

        ...afterImages.map(
          (file) => ({
            file,
            type: "after",
          }),
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
          } 사진 ${index + 1}/${
            allPhotos.length
          } AI 분석 + 저장 중...`,
        );

        let analysis = {};

        try {
          analysis =
            await analyzeImage(
              item.file,
              item.type,
            );
        } catch (error) {
          console.error(
            "AI 분석:",
            error,
          );
        }

        const result =
          await savePhoto({
            file: item.file,
            workItemId:
              workItem.id,
            projectId:
              PROJECT_ID,
            photoType: item.type,
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
            workItem.id,
          );

        workItemId = null;

        throw new Error(
          "선택한 사진이 모두 이미 시공 DB에 등록되어 있습니다.",
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
          : `✅ 시공사례 저장 완료!\n사진 ${saved}장 + AI 분석 + 임베딩 저장`,
      );

      await loadJobs(1, "");
    } catch (error) {
      console.error(error);

      if (workItemId) {
        try {
          const { count } =
            await supabase
              .from(
                "work_photos",
              )
              .select("id", {
                count: "exact",
                head: true,
              })
              .eq(
                "work_item_id",
                workItemId,
              );

          if (!count) {
            await supabase
              .from(
                "work_items",
              )
              .delete()
              .eq(
                "id",
                workItemId,
              );
          }
        } catch {}
      }

      setMessage(
        `❌ 오류: ${
          error?.message ||
          "저장 실패"
        }`,
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
      const { count, error } =
        await supabase
          .from("customer_leads")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("is_read", false);

      if (error) {
        console.error(
          "미확인 상담 수:",
          error,
        );
        return;
      }

      setUnreadCount(count || 0);
    } catch (error) {
      console.error(
        "미확인 상담 수:",
        error,
      );
    }
  }

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
        );

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

  async function markLeadRead(lead) {
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
            : item,
        ),
      );

      setUnreadCount((current) =>
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
    if (openLeadId === lead.id) {
      setOpenLeadId(null);
      return;
    }

    setOpenLeadId(lead.id);

    await markLeadRead(lead);
  }

  async function loadLeadPhotos(
    lead,
  ) {
    const paths =
      getLeadPhotoPaths(lead);

    if (paths.length === 0) {
      setLeadsMessage(
        "⚠️ 저장된 고객 사진이 없습니다.",
      );
      return;
    }

    if (
      Array.isArray(
        leadPhotoUrls[lead.id],
      ) &&
      leadPhotoUrls[lead.id]
        .length > 0
    ) {
      return;
    }

    setLeadPhotoLoadingId(
      lead.id,
    );

    try {
      const urls = [];

      for (const path of paths) {
        const cachedUrl = getCachedSignedUrl(path);

        if (cachedUrl) {
          urls.push({
            path,
            url: cachedUrl,
          });
          continue;
        }

        const { data, error } = await supabase.storage
          .from("work-photos")
          .createSignedUrl(path, SIGNED_URL_SECONDS);

        if (error) {
          console.error(
            "고객 사진:",
            error,
          );

          continue;
        }

        if (data?.signedUrl) {
          setCachedSignedUrl(path, data.signedUrl, SIGNED_URL_SECONDS);
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
          error?.message || "실패"
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
            : lead,
        ),
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 상태 변경 오류: ${
          error?.message || "실패"
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
          .from("customer_leads")
          .update({
            admin_memo:
              memo || null,
          })
          .eq("id", leadId);

      if (error) throw error;

      setLeadsMessage(
        "✅ 상담 메모가 저장되었습니다.",
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 메모 저장 오류: ${
          error?.message || "실패"
        }`,
      );
    }
  }

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
              [field]: value,
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
        lead.final_price || "",
      ).replace(/,/g, ""),
    );

    if (
      !Number.isFinite(price) ||
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
                final_price: price,
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
          error?.message || "실패"
        }`,
      );
    }
  }

  /* =========================================================
     화면
  ========================================================= */

  const totalJobPages = Math.max(
    1,
    Math.ceil(
      jobTotal / JOB_PAGE_SIZE,
    ),
  );

  const totalLeadPages = Math.max(
    1,
    Math.ceil(
      leadTotal /
        LEAD_PAGE_SIZE,
    ),
  );

  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding:
          "16px 14px 80px",
        background: "#f8fafc",
        minHeight: "100vh",
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
        changeTab={changeTab}
      />

      <h1
        style={{
          fontSize: "24px",
          margin: "8px 0 16px",
        }}
      >
        기분좋은공간 관리자
      </h1>

      <AdminTabs
        activeTab={activeTab}
        changeTab={changeTab}
        unreadCount={unreadCount}
      />

      {/* =====================================================
          시공 DB
      ===================================================== */}

      {activeTab === "jobs" && (
        <JobsTab
          jobSearch={jobSearch}
          setJobSearch={
            setJobSearch
          }
          searchJobs={searchJobs}
          clearJobSearch={
            clearJobSearch
          }
          jobSearchApplied={
            jobSearchApplied
          }
          jobTotal={jobTotal}
          jobsMessage={jobsMessage}
          jobsLoading={jobsLoading}
          jobs={jobs}
          editingId={editingId}
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
          editCost={editCost}
          setEditCost={
            setEditCost
          }
          editMemo={editMemo}
          setEditMemo={
            setEditMemo
          }
          saveJobEdit={
            saveJobEdit
          }
          cancelEdit={cancelEdit}
          startEdit={startEdit}
          deleteJob={deleteJob}
          openJobId={openJobId}
          toggleJobDetail={
            toggleJobDetail
          }
          jobPhotoLoadingId={
            jobPhotoLoadingId
          }
          jobPhotos={jobPhotos}
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
          deletePhoto={deletePhoto}
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
          jobPage={jobPage}
          totalJobPages={
            totalJobPages
          }
          loadJobs={loadJobs}
        />
      )}

      {/* =====================================================
          시공 등록
      ===================================================== */}

      {activeTab ===
        "register" && (
        <RegisterTab
          category={category}
          setCategory={setCategory}
          actualCost={actualCost}
          setActualCost={
            setActualCost
          }
          material={material}
          setMaterial={setMaterial}
          memo={memo}
          setMemo={setMemo}
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
          loading={loading}
          handleSave={handleSave}
          message={message}
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
          로그 분석
      ===================================================== */}

      {activeTab === "usage" && (
        <UsageTab
          usageStats={usageStats}
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

      {activeTab === "leads" && (
        <LeadsTab
          leadFilter={leadFilter}
          setLeadFilter={
            setLeadFilter
          }
          loadLeads={loadLeads}
          leadTotal={leadTotal}
          unreadCount={unreadCount}
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
          leads={leads}
          updateLeadStatus={
            updateLeadStatus
          }
          openLeadId={openLeadId}
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
          leadPage={leadPage}
          totalLeadPages={
            totalLeadPages
          }
        />
      )}

      {/* =====================================================
          사진 크게 보기
      ===================================================== */}

      <PhotoPreviewModal
        previewPhoto={previewPhoto}
        setPreviewPhoto={
          setPreviewPhoto
        }
      />
    </main>
  );
          }
