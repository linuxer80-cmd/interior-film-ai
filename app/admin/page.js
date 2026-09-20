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
  const [adminReady, setAdminReady] = useState(false);
  const [currentCompany, setCurrentCompany] = useState(null);
  const companyId =
    currentCompany?.company_id || currentCompany?.id || null;
  const companyName = currentCompany?.company_name || "관리자";

  const [activeTab, setActiveTab] = useState("jobs");
  const activeTabRef = useRef("jobs");

  const [similarityThreshold, setSimilarityThreshold] =
    useState(0.65);
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
  const [jobPhotoLoadingId, setJobPhotoLoadingId] =
    useState(null);

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
  const [editPhotoSubCategory, setEditPhotoSubCategory] =
    useState("");
  const [editPhotoDescription, setEditPhotoDescription] =
    useState("");
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
  const [leadPhotoLoadingId, setLeadPhotoLoadingId] =
    useState(null);

  const [newLeadAlert, setNewLeadAlert] = useState(null);
  const [notificationEnabled, setNotificationEnabled] =
    useState(false);

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
  const [usagePhotoLoadingId, setUsagePhotoLoadingId] =
    useState(null);

  function changeTab(tab) {
    activeTabRef.current = tab;
    setActiveTab(tab);

    if (tab === "usage") {
      loadUsageStats();
    }

    if (tab === "leads") {
      loadLeads(1, leadFilter, companyId);
    }
  }

  useEffect(() => {
    let mounted = true;
    let channel = null;

    async function initializeAdmin() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session?.user) {
          window.location.href = "/login";
          return;
        }

        const { data: companyRows, error: companyError } =
          await supabase.rpc("get_my_company");

        if (companyError) throw companyError;

        const company = Array.isArray(companyRows)
          ? companyRows[0]
          : companyRows;

        const resolvedCompanyId =
          company?.company_id || company?.id || null;

        if (!company || !resolvedCompanyId) {
          throw new Error(
            "로그인 계정에 연결된 회사가 없습니다.",
          );
        }

        if (company?.is_active === false) {
          throw new Error("비활성화된 회사 계정입니다.");
        }

        if (!mounted) return;

        setCurrentCompany(company);

        await Promise.all([
          loadSettings(resolvedCompanyId),
          loadJobs(1, "", resolvedCompanyId),
          loadUnreadCount(resolvedCompanyId),
        ]);

        if (!mounted) return;

        channel = supabase
          .channel(
            `customer-leads-admin-realtime-${resolvedCompanyId}`,
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "customer_leads",
              filter: `company_id=eq.${resolvedCompanyId}`,
            },
            (payload) => {
              handleRealtimeLead(
                payload.new,
                resolvedCompanyId,
              );
            },
          )
          .subscribe();

        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          setNotificationEnabled(true);
        }

        setAdminReady(true);
      } catch (error) {
        console.error("관리자 초기화:", error);

        if (mounted) {
          setMessage(
            `❌ 관리자 접속 오류: ${
              error?.message ||
              "회사 정보를 불러오지 못했습니다."
            }`,
          );
          setAdminReady(true);
        }
      }
    }

    initializeAdmin();

    return () => {
      mounted = false;

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  function handleRealtimeLead(
    lead,
    scopedCompanyId = companyId,
  ) {
    if (
      !lead ||
      !scopedCompanyId ||
      lead.company_id !== scopedCompanyId
    ) {
      return;
    }

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

  async function enableNotifications() {
    try {
      if (!("Notification" in window)) {
        alert(
          "이 브라우저는 알림 기능을 지원하지 않습니다.",
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

      new Notification(companyName, {
        body: "신규 상담 알림이 활성화되었습니다.",
      });
    } catch (error) {
      console.error(error);
      alert(
        `알림 설정 오류: ${error?.message || "실패"}`,
      );
    }
  }

  async function loadSettings(
    scopedCompanyId = companyId,
  ) {
    try {
      if (!scopedCompanyId) return;

      const { data, error } = await supabase
        .from("company_settings")
        .select("similarity_threshold")
        .eq("company_id", scopedCompanyId)
        .maybeSingle();

      if (error) throw error;

      if (
        data?.similarity_threshold !== null &&
        data?.similarity_threshold !== undefined
      ) {
        setSimilarityThreshold(
          Number(data.similarity_threshold),
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
      const threshold = Number(similarityThreshold);

      if (
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        threshold > 1
      ) {
        throw new Error(
          "유사도 기준은 0~1 사이 숫자로 입력해주세요.",
        );
      }

      if (!companyId) {
        throw new Error(
          "회사 정보를 확인할 수 없습니다.",
        );
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
        `✅ AI 유사도 기준 ${Math.round(
          threshold * 100,
        )}% 저장 완료`,
      );
    } catch (error) {
      setSettingMessage(
        `❌ 설정 저장 오류: ${
          error?.message || "실패"
        }`,
      );
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
      setUsageMessage(
        "⚠️ 이 자동견적에는 저장된 사진 경로가 없습니다.",
      );
      return;
    }

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
        const cachedUrl =
          getCachedSignedUrl(path);

        if (cachedUrl) {
          urls.push({
            path,
            url: cachedUrl,
          });
          continue;
        }

        const { data, error } =
          await supabase.storage
            .from("work-photos")
            .createSignedUrl(
              path,
              SIGNED_URL_SECONDS,
            );

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
      console.error(
        "자동견적 사진 보기:",
        error,
      );

      setUsageMessage(
        `❌ 자동견적 사진 오류: ${
          error?.message ||
          "사진을 불러오지 못했습니다."
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
      if (!companyId) {
        throw new Error(
          "회사 정보를 확인할 수 없습니다.",
        );
      }

      const { stats, recent } =
        await fetchUsageDashboard(
          supabase,
          companyId,
        );

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
              getUsagePhotoPaths(row)
                .length > 0,
          ).length;

        setUsageMessage(
          `✅ 자동견적 전체 ${stats.total.toLocaleString(
            "ko-KR",
          )}건 · 최근 목록 ${
            recent.length
          }건 · 최근 사진 저장 ${recentPhotoCount}건 · 상세상담 전환 ${stats.converted.toLocaleString(
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
     AI 구조분석
  ========================================================= */

  async function runStructureAnalysis() {
    if (structureAnalysis.running) return;

    const confirmed =
      window.confirm(
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
      const results =
        Array.isArray(data?.results)
          ? data.results
          : [];

      for (const result of results) {
        if (
          result?.success !== false ||
          !result?.error
        ) {
          continue;
        }

        const photoId = result?.id
          ? String(result.id)
          : "ID 없음";

        const storagePath =
          result?.storage_path
            ? String(
                result.storage_path,
              )
            : "";

        const errorText =
          String(result.error);

        const text = [
          `사진 ID: ${photoId}`,
          storagePath
            ? `경로: ${storagePath}`
            : "",
          `오류: ${errorText}`,
        ]
          .filter(Boolean)
          .join("\n");

        if (
          !collectedErrors.includes(
            text,
          )
        ) {
          collectedErrors.push(
            text,
          );
        }
      }

      if (
        collectedErrors.length >
        10
      ) {
        collectedErrors.splice(
          10,
        );
      }
    }

    function makeErrorMessage(
      prefix,
      remaining,
    ) {
      const visibleErrors =
        collectedErrors.slice(
          0,
          3,
        );

      let text = prefix;

      if (
        remaining !== null &&
        remaining !== undefined
      ) {
        text += `\n남은 사진 ${remaining}장`;
      }

      if (
        visibleErrors.length >
        0
      ) {
        text +=
          "\n\n실제 오류:";

        visibleErrors.forEach(
          (item, index) => {
            text += `\n\n${
              index + 1
            }. ${item}`;
          },
        );

        if (
          collectedErrors.length >
          3
        ) {
          text += `\n\n외 ${
            collectedErrors.length -
            3
          }개 오류`;
        }
      }

      return text;
    }

    setStructureAnalysis(
      (current) => ({
        ...current,
        running: true,
        finished: false,
        failed: 0,
        processed: 0,
        errors: [],
        message:
          "AI 구조분석을 시작합니다...",
      }),
    );

    try {
      while (
        !structureStopRef.current
      ) {
        const {
          data: { session },
        } =
          await supabase.auth.getSession();

        if (
          !session?.access_token
        ) {
          throw new Error(
            "로그인이 만료되었습니다. 다시 로그인해주세요.",
          );
        }

        const response =
          await fetch(
            "/api/analyze-work-structure",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body:
                JSON.stringify({
                  limit: 3,
                }),
            },
          );

        let data;

        try {
          data =
            await response.json();
        } catch {
          throw new Error(
            `구조분석 API 응답을 읽을 수 없습니다. HTTP ${response.status}`,
          );
        }

        if (
          !response.ok ||
          !data?.success
        ) {
          const apiError =
            data?.error ||
            `구조분석 API 오류 (${response.status})`;

          if (
            !collectedErrors.includes(
              apiError,
            )
          ) {
            collectedErrors.push(
              apiError,
            );
          }

          throw new Error(
            apiError,
          );
        }

        collectApiErrors(data);

        const total =
          Number(
            data.total || 0,
          );

        const completed =
          Number(
            data.completed || 0,
          );

        const remaining =
          Number(
            data.remaining || 0,
          );

        const processed =
          Number(
            data.processed || 0,
          );

        const failed =
          Number(
            data.failed || 0,
          );

        totalProcessed +=
          processed;

        totalFailed += failed;

        if (
          structureStopRef.current
        ) {
          setStructureAnalysis({
            total,
            completed,
            remaining,
            failed:
              totalFailed,
            processed:
              totalProcessed,
            running: false,
            finished: false,
            errors: [
              ...collectedErrors,
            ],
            message:
              makeErrorMessage(
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
          failed:
            totalFailed,
          processed:
            totalProcessed,
          running: true,
          finished:
            data.finished ===
              true ||
            remaining === 0,
          errors: [
            ...collectedErrors,
          ],
          message:
            remaining === 0
              ? "✅ 기존 시공사진 구조분석이 완료되었습니다."
              : `AI 구조분석 중... ${completed}/${total}`,
        });

        if (
          data.finished ===
            true ||
          remaining === 0
        ) {
          setStructureAnalysis(
            (current) => ({
              ...current,
              running: false,
              finished: true,
              errors: [
                ...collectedErrors,
              ],
              message:
                totalFailed > 0
                  ? makeErrorMessage(
                      `✅ 구조분석 완료 · 완료 ${completed}장 · 이번 실행 실패 ${totalFailed}회`,
                      0,
                    )
                  : "✅ 기존 시공사진 구조분석이 완료되었습니다.",
            }),
          );

          break;
        }

        if (
          processed > 0 ||
          previousRemaining ===
            null ||
          remaining <
            previousRemaining
        ) {
          noProgressCount = 0;
        } else {
          noProgressCount += 1;
        }

        previousRemaining =
          remaining;

        if (
          noProgressCount >= 2
        ) {
          setStructureAnalysis(
            (current) => ({
              ...current,
              running: false,
              finished: false,
              errors: [
                ...collectedErrors,
              ],
              message:
                makeErrorMessage(
                  "⚠️ 반복 실패로 자동 분석을 중단했습니다.",
                  remaining,
                ),
            }),
          );

          break;
        }

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              500,
            ),
        );
      }
    } catch (error) {
      console.error(
        "시공사진 구조분석:",
        error,
      );

      const errorText =
        error?.message ||
        "실패";

      if (
        !collectedErrors.includes(
          errorText,
        )
      ) {
        collectedErrors.push(
          errorText,
        );
      }

      setStructureAnalysis(
        (current) => ({
          ...current,
          running: false,
          finished: false,
          errors: [
            ...collectedErrors,
          ],
          message:
            makeErrorMessage(
              `❌ 구조분석 오류: ${errorText}`,
              current.remaining,
            ),
        }),
      );
    }
  }

  function stopStructureAnalysis() {
    structureStopRef.current =
      true;

    setStructureAnalysis(
      (current) => ({
        ...current,
        running: false,
        message:
          "⏸️ 구조분석 중지를 요청했습니다. 현재 처리 중인 사진이 끝나면 중지됩니다.",
      }),
    );
  }

  /* =========================================================
     시공 DB
  ========================================================= */

  async function loadJobs(
    page = 1,
    keyword = jobSearchApplied,
    scopedCompanyId = companyId,
  ) {
    if (!scopedCompanyId)
      return;

    setJobsLoading(true);
    setJobsMessage("");

    try {
      const from =
        (page - 1) *
        JOB_PAGE_SIZE;

      const to =
        from +
        JOB_PAGE_SIZE -
        1;

      const safeKeyword =
        sanitizeSearchKeyword(
          keyword,
        );

      let query =
        supabase
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
          .eq(
            "company_id",
            scopedCompanyId,
          );

      if (safeKeyword) {
        query =
          query.or(
            `category.ilike.%${safeKeyword}%,sub_category.ilike.%${safeKeyword}%,memo.ilike.%${safeKeyword}%`,
          );
      }

      const {
        data,
        error,
        count,
      } =
        await query
          .order(
            "created_at",
            {
              ascending:
                false,
            },
          )
          .range(
            from,
            to,
          );

      if (error)
        throw error;

      setJobs(data || []);
      setJobTotal(
        count || 0,
      );
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
      sanitizeSearchKeyword(
        jobSearch,
      );

    setJobSearchApplied(
      keyword,
    );

    loadJobs(
      1,
      keyword,
    );
  }

  function clearJobSearch() {
    setJobSearch("");
    setJobSearchApplied("");
    loadJobs(1, "");
}  async function loadJobPhotos(
    workItemId,
  ) {
    if (!workItemId) return;

    setJobPhotoLoadingId(
      workItemId,
    );

    try {
      const {
        data,
        error,
      } = await supabase
        .from("work_photos")
        .select(
          `
            id,
            work_item_id,
            photo_url,
            storage_path,
            photo_type,
            category,
            sub_category,
            region,
            material_id,
            width_mm,
            height_mm,
            area_m2,
            ai_description,
            ai_tags,
            created_at
          `,
        )
        .eq(
          "work_item_id",
          workItemId,
        )
        .eq(
          "company_id",
          companyId,
        )
        .order(
          "created_at",
          {
            ascending:
              true,
          },
        );

      if (error) throw error;

      setJobPhotos(
        (current) => ({
          ...current,
          [workItemId]:
            data || [],
        }),
      );
    } catch (error) {
      console.error(
        "시공사진:",
        error,
      );

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
    let url =
      jobPhotoUrls[photo.id];

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
      const { error } =
        await supabase
          .from("work_items")
          .update({
            category:
              editCategory.trim(),
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
          .eq("id", jobId)
          .eq(
            "company_id",
            companyId,
          );

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

  async function savePhotoEdit(
    photoId,
    workItemId,
  ) {
    if (!photoId) return;

    setPhotoEditLoading(true);
    setJobsMessage("");

    try {
      const { error } =
        await supabase
          .from("work_photos")
          .update({
            photo_type:
              editPhotoType ||
              "before",
            category:
              editPhotoCategory.trim() ||
              null,
            sub_category:
              editPhotoSubCategory.trim() ||
              editPhotoCategory.trim() ||
              null,
            ai_description:
              editPhotoDescription.trim() ||
              null,
          })
          .eq("id", photoId)
          .eq(
            "company_id",
            companyId,
          );

      if (error) throw error;

      setEditingPhotoId(null);

      setJobsMessage(
        "✅ 사진 정보가 수정되었습니다.",
      );

      await loadJobPhotos(
        workItemId,
      );
    } catch (error) {
      console.error(
        "사진 수정:",
        error,
      );

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

  async function deletePhoto(
    photo,
    workItemId,
  ) {
    if (!photo?.id) return;

    const confirmed =
      window.confirm(
        "이 사진을 삭제할까요?\n삭제 후 복구할 수 없습니다.",
      );

    if (!confirmed) return;

    setJobsMessage("");

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
            "Storage 사진 삭제:",
            storageError,
          );
        }
      }

      const { error } =
        await supabase
          .from("work_photos")
          .delete()
          .eq("id", photo.id)
          .eq(
            "company_id",
            companyId,
          );

      if (error) throw error;

      setJobPhotoUrls(
        (current) => {
          const next = {
            ...current,
          };

          delete next[photo.id];

          return next;
        },
      );

      setJobsMessage(
        "✅ 사진이 삭제되었습니다.",
      );

      await loadJobPhotos(
        workItemId,
      );
    } catch (error) {
      console.error(
        "사진 삭제:",
        error,
      );

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

    const confirmed =
      window.confirm(
        `"${job.category || "시공 데이터"}"를 삭제할까요?\n\n연결된 사진도 함께 삭제됩니다.\n삭제 후 복구할 수 없습니다.`,
      );

    if (!confirmed) return;

    setJobsMessage("");

    try {
      const {
        data: photos,
        error: photoLoadError,
      } = await supabase
        .from("work_photos")
        .select(
          "id, storage_path",
        )
        .eq(
          "work_item_id",
          job.id,
        );

      if (photoLoadError) {
        throw photoLoadError;
      }

      const storagePaths =
        (photos || [])
          .map(
            (photo) =>
              photo.storage_path,
          )
          .filter(Boolean);

      if (
        storagePaths.length > 0
      ) {
        const {
          error: storageError,
        } = await supabase.storage
          .from("work-photos")
          .remove(storagePaths);

        if (storageError) {
          console.error(
            "시공 사진 Storage 삭제:",
            storageError,
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
          job.id,
        );

      if (photoDeleteError) {
        throw photoDeleteError;
      }

      const {
        error: itemDeleteError,
      } = await supabase
        .from("work_items")
        .delete()
        .eq("id", job.id);

      if (itemDeleteError) {
        throw itemDeleteError;
      }

      setOpenJobId(null);

      setJobPhotos(
        (current) => {
          const next = {
            ...current,
          };

          delete next[job.id];

          return next;
        },
      );

      setJobsMessage(
        "✅ 시공 데이터가 삭제되었습니다.",
      );

      const nextTotal =
        Math.max(
          0,
          jobTotal - 1,
        );

      const nextTotalPages =
        Math.max(
          1,
          Math.ceil(
            nextTotal /
              JOB_PAGE_SIZE,
          ),
        );

      const nextPage =
        Math.min(
          jobPage,
          nextTotalPages,
        );

      await loadJobs(
        nextPage,
        jobSearchApplied,
      );
    } catch (error) {
      console.error(
        "시공 데이터 삭제:",
        error,
      );

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

    return Array.from(
      files,
    ).filter(
      (file) =>
        file &&
        typeof file.type ===
          "string" &&
        file.type.startsWith(
          "image/",
        ),
    );
  }

  function handleBeforeFiles(
    event,
  ) {
    const files =
      normalizeFileList(
        event?.target?.files,
      );

    if (files.length === 0) {
      return;
    }

    setBeforeImages(
      (current) => [
        ...current,
        ...files,
      ],
    );

    if (event?.target) {
      event.target.value = "";
    }
  }

  function handleAfterFiles(
    event,
  ) {
    const files =
      normalizeFileList(
        event?.target?.files,
      );

    if (files.length === 0) {
      return;
    }

    setAfterImages(
      (current) => [
        ...current,
        ...files,
      ],
    );

    if (event?.target) {
      event.target.value = "";
    }
  }

  function removeBeforeImage(
    index,
  ) {
    setBeforeImages(
      (current) =>
        current.filter(
          (_, itemIndex) =>
            itemIndex !== index,
        ),
    );
  }

  function removeAfterImage(
    index,
  ) {
    setAfterImages(
      (current) =>
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

    if (!companyId) {
      setMessage(
        "❌ 회사 정보를 확인할 수 없습니다.",
      );
      return;
    }

    const cleanCategory =
      category.trim();

    const cleanMaterial =
      material.trim();

    const cleanMemo =
      memo.trim();

    const cost = Number(
      String(actualCost).replace(
        /,/g,
        "",
      ),
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
      "시공 데이터를 저장하고 있습니다...",
    );

    try {
      /*
       * =====================================================
       * 현재 로그인 업체의 기본 프로젝트 확인
       * =====================================================
       *
       * 고정 PROJECT_ID를 사용하지 않는다.
       *
       * 현재 company_id에 속한 프로젝트가 있으면
       * 기존 프로젝트를 그대로 사용한다.
       *
       * 프로젝트가 하나도 없는 신규 업체라면
       * 현재 업체의 company_id로 기본 프로젝트를
       * 자동 생성한 뒤 사용한다.
       */

      let companyProjectId = null;

      const {
        data: existingProject,
        error: projectFindError,
      } = await supabase
        .from("projects")
        .select("id")
        .eq(
          "company_id",
          companyId,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        )
        .limit(1)
        .maybeSingle();

      if (projectFindError) {
        throw projectFindError;
      }

      if (existingProject?.id) {
        companyProjectId =
          existingProject.id;
      } else {
        const {
          data: newProject,
          error: projectCreateError,
        } = await supabase
          .from("projects")
          .insert({
            company_id:
              companyId,
          })
          .select("id")
          .single();

        if (projectCreateError) {
          throw projectCreateError;
        }

        companyProjectId =
          newProject?.id ||
          null;
      }

      if (!companyProjectId) {
        throw new Error(
          "업체 프로젝트를 확인하지 못했습니다.",
        );
      }

      const {
        data: workItem,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert({
          company_id:
            companyId,
          project_id:
            companyProjectId,
          category:
            cleanCategory,
          sub_category:
            cleanCategory,
          actual_cost:
            cost,
          memo:
            cleanMemo ||
            null,
        })
        .select("id")
        .single();

      if (workItemError) {
        throw workItemError;
      }

      const workItemId =
        workItem?.id;

      if (!workItemId) {
        throw new Error(
          "시공 데이터 ID를 만들지 못했습니다.",
        );
      }

      const uploadTargets = [
        ...beforeImages.map(
          (file) => ({
            file,
            photoType:
              "before",
          }),
        ),
        ...afterImages.map(
          (file) => ({
            file,
            photoType:
              "after",
          }),
        ),
      ];

      let uploadedCount = 0;

      for (
        let index = 0;
        index <
        uploadTargets.length;
        index += 1
      ) {
        const {
          file,
          photoType,
        } =
          uploadTargets[index];

        setMessage(
          `사진 ${
            index + 1
          }/${
            uploadTargets.length
          } 처리 중...`,
        );

        try {
          const resizedFile =
            await resizeImage(
              file,
            );

          const imageHash =
            await getImageHash(
              resizedFile,
            );

          const timestamp =
            Date.now();

          const randomText =
            Math.random()
              .toString(36)
              .slice(2, 10);

          const extension =
            resizedFile.type ===
            "image/png"
              ? "png"
              : "jpg";

          const storagePath =
            `history/${companyId}/${timestamp}-${randomText}.${extension}`;

          const {
            error: uploadError,
          } =
            await supabase.storage
              .from(
                "work-photos",
              )
              .upload(
                storagePath,
                resizedFile,
                {
                  cacheControl:
                    "3600",
                  upsert:
                    false,
                  contentType:
                    resizedFile.type,
                },
              );

          if (uploadError) {
            throw uploadError;
          }

          let analysis =
            null;

          try {
            analysis =
              await analyzeImage(
                resizedFile,
              );
          } catch (error) {
            console.error(
              "AI 사진 분석:",
              error,
            );
          }

          let embedding =
            null;

          try {
            const embeddingText =
              [
                cleanCategory,
                analysis?.category,
                analysis?.sub_category,
                analysis?.description,
                Array.isArray(
                  analysis?.tags,
                )
                  ? analysis.tags.join(
                      ", ",
                    )
                  : "",
              ]
                .filter(Boolean)
                .join(" ");

            if (
              embeddingText
            ) {
              embedding =
                await createEmbedding(
                  embeddingText,
                );
            }
          } catch (error) {
            console.error(
              "임베딩 생성:",
              error,
            );
          }

          const aiCategory =
            analysis?.category ||
            cleanCategory;

          const aiSubCategory =
            analysis?.sub_category ||
            cleanCategory;

          const aiDescription =
            analysis?.description ||
            null;

          const aiTags =
            Array.isArray(
              analysis?.tags,
            )
              ? analysis.tags
              : [];

          const {
            error: photoInsertError,
          } =
            await supabase
              .from(
                "work_photos",
              )
              .insert({
                company_id:
                  companyId,
                project_id:
                  companyProjectId,
                work_item_id:
                  workItemId,
                photo_url:
                  storagePath,
                storage_path:
                  storagePath,
                photo_type:
                  photoType,
                category:
                  aiCategory,
                sub_category:
                  aiSubCategory,
                material_id:
                  cleanMaterial ||
                  null,
                ai_description:
                  aiDescription,
                ai_tags:
                  aiTags,
                embedding:
                  embedding,
                image_hash:
                  imageHash ||
                  null,
              });

          if (
            photoInsertError
          ) {
            throw photoInsertError;
          }

          uploadedCount += 1;
        } catch (error) {
          console.error(
            `사진 ${
              index + 1
            } 저장 실패:`,
            error,
          );

          throw new Error(
            `사진 ${
              index + 1
            } 저장 실패: ${
              error?.message ||
              "알 수 없는 오류"
            }`,
          );
        }
      }

      /*
       * 전/후 사진이 모두 있으면
       * 기존 비교 분석 기능 유지
       */

      if (
        beforeImages.length >
          0 &&
        afterImages.length >
          0
      ) {
        try {
          await compareMultipleBeforeAfter(
            beforeImages,
            afterImages,
          );
        } catch (error) {
          console.error(
            "전후 비교 분석:",
            error,
          );
        }
      }

      setMessage(
        `✅ 시공 등록 완료 · 사진 ${uploadedCount}장 저장`,
      );

      setBeforeImages([]);
      setAfterImages([]);
      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");

      await loadJobs(
        1,
        "",
        companyId,
      );

      setActiveTab(
        "jobs",
      );
      activeTabRef.current =
        "jobs";
    } catch (error) {
      console.error(
        "시공 등록:",
        error,
      );

      setMessage(
        `❌ 저장 오류: ${
          error?.message ||
          "시공 등록에 실패했습니다."
        }`,
      );
    } finally {
      setLoading(false);
    }
                      }
  
    /* =========================================================
     고객 상담
  ========================================================= */

  async function loadUnreadCount(
    scopedCompanyId =
      companyId,
  ) {
    if (!scopedCompanyId) {
      return;
    }

    try {
      const {
        count,
        error,
      } = await supabase
        .from(
          "customer_leads",
        )
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "company_id",
          scopedCompanyId,
        )
        .eq(
          "is_read",
          false,
        );

      if (error) {
        throw error;
      }

      setUnreadCount(
        count || 0,
      );
    } catch (error) {
      console.error(
        "읽지 않은 상담:",
        error,
      );
    }
  }

  async function loadLeads(
    page = 1,
    filter = leadFilter,
    scopedCompanyId =
      companyId,
  ) {
    if (!scopedCompanyId) {
      return;
    }

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
            "customer_leads",
          )
          .select(
            "*",
            {
              count: "exact",
            },
          )
          .eq(
            "company_id",
            scopedCompanyId,
          );

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
      } =
        await query
          .order(
            "created_at",
            {
              ascending:
                false,
            },
          )
          .range(
            from,
            to,
          );

      if (error) {
        throw error;
      }

      setLeads(
        data || [],
      );

      setLeadTotal(
        count || 0,
      );

      setLeadPage(page);

      await loadUnreadCount(
        scopedCompanyId,
      );
    } catch (error) {
      console.error(
        "상담 조회:",
        error,
      );

      setLeadsMessage(
        `❌ 상담 조회 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    } finally {
      setLeadsLoading(
        false,
      );
    }
  }

  async function toggleLeadDetail(
    lead,
  ) {
    if (!lead?.id) {
      return;
    }

    if (
      openLeadId ===
      lead.id
    ) {
      setOpenLeadId(
        null,
      );
      return;
    }

    setOpenLeadId(
      lead.id,
    );

    if (
      !lead.is_read
    ) {
      try {
        const {
          error,
        } =
          await supabase
            .from(
              "customer_leads",
            )
            .update({
              is_read:
                true,
            })
            .eq(
              "id",
              lead.id,
            )
            .eq(
              "company_id",
              companyId,
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
      } catch (
        error
      ) {
        console.error(
          "상담 읽음 처리:",
          error,
        );
      }
    }
  }

  async function loadLeadPhotos(
    lead,
  ) {
    if (!lead?.id) {
      return;
    }

    const paths =
      getLeadPhotoPaths(
        lead,
      );

    if (
      paths.length ===
      0
    ) {
      setLeadsMessage(
        "⚠️ 이 상담에는 저장된 사진이 없습니다.",
      );
      return;
    }

    setLeadPhotoLoadingId(
      lead.id,
    );

    try {
      const urls = [];

      for (
        const path of
        paths
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
            "상담 사진 Signed URL:",
            path,
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
        urls.length ===
        0
      ) {
        throw new Error(
          "사진을 불러올 수 없습니다.",
        );
      }

      setLeadPhotoUrls(
        (current) => ({
          ...current,
          [lead.id]:
            urls,
        }),
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 상담 사진 오류: ${
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
    if (!leadId) {
      return;
    }

    try {
      const {
        error,
      } =
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
          .eq(
            "company_id",
            companyId,
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
                : lead,
          ),
      );

      setLeadsMessage(
        "✅ 상담 상태가 변경되었습니다.",
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 상담 상태 변경 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    }
  }

  async function saveLeadMemo(
    lead,
  ) {
    if (!lead?.id) {
      return;
    }

    try {
      const {
        error,
      } =
        await supabase
          .from(
            "customer_leads",
          )
          .update({
            admin_memo:
              lead.admin_memo ||
              null,          })
          .eq(
            "id",
            lead.id,
          )
          .eq(
            "company_id",
            companyId,
          );

      if (error) {
        throw error;
      }

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
    const price =
      Number(
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

      const {
        error,
      } =
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
          .eq(
            "company_id",
            companyId,
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

  if (!adminReady) {
    return (
      <main
        style={{
          maxWidth:
            "900px",
          margin:
            "0 auto",
          padding:
            "40px 16px",
          minHeight:
            "100vh",
          background:
            "#f8fafc",
          color:
            "#111827",
        }}
      >
        관리자 정보를 확인하고 있습니다...
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth:
          "900px",
        margin:
          "0 auto",
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
          fontSize:
            "24px",
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
          jobs={
            jobs
          }

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
          loadSingleJobPhoto={
            loadSingleJobPhoto
          }
          openJobPhoto={
            openJobPhoto
          }

          editingPhotoId={
            editingPhotoId
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

          startPhotoEdit={
            startPhotoEdit
          }
          cancelPhotoEdit={
            cancelPhotoEdit
          }
          savePhotoEdit={
            savePhotoEdit
          }
          deletePhoto={
            deletePhoto
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

          leadPage={
            leadPage
          }
          totalLeadPages={
            totalLeadPages
          }
        />
      )}

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
