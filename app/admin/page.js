"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

const JOB_PAGE_SIZE = 10;
const LEAD_PAGE_SIZE = 20;
const SIGNED_URL_SECONDS = 60 * 30;

export default function AdminPage() {
  /* ======================================
     기본 상태
  ====================================== */

  const [activeTab, setActiveTab] =
    useState("stats");

  const activeTabRef =
    useRef("stats");

  const [previewPhoto, setPreviewPhoto] =
    useState(null);

  /* ======================================
     공통 스타일
  ====================================== */

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

  /* ======================================
     자동견적 통계
  ====================================== */

  const [statsDays, setStatsDays] =
    useState(30);

  const [stats, setStats] =
    useState(null);

  const [statsLoading, setStatsLoading] =
    useState(false);

  const [statsMessage, setStatsMessage] =
    useState("");

  /* ======================================
     시공 DB
  ====================================== */

  const [jobs, setJobs] =
    useState([]);

  const [jobsLoading, setJobsLoading] =
    useState(false);

  const [jobsMessage, setJobsMessage] =
    useState("");

  const [jobSearch, setJobSearch] =
    useState("");

  const [
    jobSearchApplied,
    setJobSearchApplied,
  ] = useState("");

  const [jobPage, setJobPage] =
    useState(1);

  const [jobTotal, setJobTotal] =
    useState(0);

  const [openJobId, setOpenJobId] =
    useState(null);

  const [jobPhotos, setJobPhotos] =
    useState({});

  const [
    jobPhotoUrls,
    setJobPhotoUrls,
  ] = useState({});

  const [
    jobPhotoLoadingId,
    setJobPhotoLoadingId,
  ] = useState(null);

  const [
    loadingPhotoId,
    setLoadingPhotoId,
  ] = useState(null);

  /* ======================================
     시공 수정
  ====================================== */

  const [editingId, setEditingId] =
    useState(null);

  const [
    editCategory,
    setEditCategory,
  ] = useState("");

  const [
    editSubCategory,
    setEditSubCategory,
  ] = useState("");

  const [editCost, setEditCost] =
    useState("");

  const [editMemo, setEditMemo] =
    useState("");

  /* ======================================
     신규 시공 등록
  ====================================== */

  const [beforeImages, setBeforeImages] =
    useState([]);

  const [afterImages, setAfterImages] =
    useState([]);

  const [category, setCategory] =
    useState("");

  const [actualCost, setActualCost] =
    useState("");

  const [material, setMaterial] =
    useState("");

  const [memo, setMemo] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  /* ======================================
     AI 설정
  ====================================== */

  const [
    similarityThreshold,
    setSimilarityThreshold,
  ] = useState(0.65);

  const [
    settingMessage,
    setSettingMessage,
  ] = useState("");

  const [
    settingLoading,
    setSettingLoading,
  ] = useState(false);

  /* ======================================
     HASH 복구
  ====================================== */

  const [
    hashRepairRunning,
    setHashRepairRunning,
  ] = useState(false);

  const [
    hashRepairProgress,
    setHashRepairProgress,
  ] = useState(null);

  const [
    hashRepairMessage,
    setHashRepairMessage,
  ] = useState("");

  /* ======================================
     고객 상담
  ====================================== */

  const [leads, setLeads] =
    useState([]);

  const [
    leadsLoading,
    setLeadsLoading,
  ] = useState(false);

  const [
    leadsMessage,
    setLeadsMessage,
  ] = useState("");

  const [leadPage, setLeadPage] =
    useState(1);

  const [leadTotal, setLeadTotal] =
    useState(0);

  const [leadFilter, setLeadFilter] =
    useState("all");

  const [unreadCount, setUnreadCount] =
    useState(0);

  const [openLeadId, setOpenLeadId] =
    useState(null);

  const [
    leadPhotoUrls,
    setLeadPhotoUrls,
  ] = useState({});

  const [
    leadPhotoLoadingId,
    setLeadPhotoLoadingId,
  ] = useState(null);

  /* ======================================
     공통 함수
  ====================================== */

  function formatWon(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "-";
    }

    return `${Number(
      value
    ).toLocaleString("ko-KR")}원`;
  }

  function formatDate(value) {
    if (!value) return "-";

    try {
      return new Date(
        value
      ).toLocaleString("ko-KR");
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

    if (
      Array.isArray(
        lead?.customer_photo_paths
      )
    ) {
      for (
        const path of
        lead.customer_photo_paths
      ) {
        if (
          path &&
          !paths.includes(path)
        ) {
          paths.push(path);
        }
      }
    }

    if (
      lead?.customer_photo_path &&
      !paths.includes(
        lead.customer_photo_path
      )
    ) {
      paths.push(
        lead.customer_photo_path
      );
    }

    return paths;
  }

  async function getAccessToken() {
    const {
      data,
      error,
    } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    const token =
      data?.session?.access_token;

    if (!token) {
      throw new Error(
        "관리자 로그인이 필요합니다."
      );
    }

    return token;
  }

  /* ======================================
     탭 전환
  ====================================== */

  function changeTab(tab) {
    activeTabRef.current = tab;
    setActiveTab(tab);

    if (tab === "stats") {
      loadStats(statsDays);
    }

    if (tab === "jobs") {
      loadJobs(
        jobPage,
        jobSearchApplied
      );
    }

    if (tab === "leads") {
      loadLeads(
        1,
        leadFilter
      );
    }
  }

  /* ======================================
     초기 실행
  ====================================== */

  useEffect(() => {
    loadStats(30);
    loadSettings();
    loadJobs(1, "");
    loadUnreadCount();

    const channel = supabase
      .channel(
        "customer-leads-admin-realtime"
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_leads",
        },
        () => {
          setUnreadCount(
            (current) =>
              current + 1
          );

          if (
            activeTabRef.current ===
            "leads"
          ) {
            loadLeads(
              1,
              leadFilter
            );
          }

          try {
            navigator.vibrate?.([
              250,
              120,
              250,
            ]);
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, []);

  useEffect(() => {
    activeTabRef.current =
      activeTab;
  }, [activeTab]);

  /* ======================================
     자동견적 통계 불러오기
  ====================================== */

  async function loadStats(
    days = statsDays
  ) {
    setStatsLoading(true);
    setStatsMessage("");

    try {
      const token =
        await getAccessToken();

      const response = await fetch(
        `/api/estimate-usage?days=${days}&t=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.error ||
            "통계를 불러오지 못했습니다."
        );
      }

      setStats(result);
      setStatsDays(days);
    } catch (error) {
      console.error(error);

      setStatsMessage(
        `❌ 통계 오류: ${
          error?.message ||
          "불러오기 실패"
        }`
      );
    } finally {
      setStatsLoading(false);
    }
  }

  /* ======================================
     AI 유사도 설정
  ====================================== */

  async function loadSettings() {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("app_settings")
        .select(
          "similarity_threshold"
        )
        .eq("id", 1)
        .single();

      if (error) throw error;

      if (
        data?.similarity_threshold !==
          null &&
        data?.similarity_threshold !==
          undefined
      ) {
        setSimilarityThreshold(
          Number(
            data.similarity_threshold
          )
        );
      }
    } catch (error) {
      console.error(
        "설정 불러오기:",
        error
      );
    }
  }

  async function saveSimilaritySetting() {
    setSettingLoading(true);
    setSettingMessage("");

    try {
      const value = Number(
        similarityThreshold
      );

      if (
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1
      ) {
        throw new Error(
          "유사도는 0부터 1 사이로 입력해주세요."
        );
      }

      const { error } =
        await supabase
          .from("app_settings")
          .update({
            similarity_threshold:
              value,
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", 1);

      if (error) throw error;

      setSettingMessage(
        `✅ AI 유사도 ${Math.round(
          value * 100
        )}% 저장 완료`
      );
    } catch (error) {
      setSettingMessage(
        `❌ 설정 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setSettingLoading(false);
    }
  }

  /* ======================================
     시공 목록
  ====================================== */

  async function loadJobs(
    page = 1,
    keyword = jobSearchApplied
  ) {
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
          keyword
        );

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
          error?.message ||
          "불러오기 실패"
        }`
      );
    } finally {
      setJobsLoading(false);
    }
  }

  function searchJobs() {
    const keyword =
      sanitizeSearchKeyword(
        jobSearch
      );

    setJobSearchApplied(
      keyword
    );

    loadJobs(1, keyword);
  }

  function clearJobSearch() {
    setJobSearch("");
    setJobSearchApplied("");
    loadJobs(1, "");
  }

  /* ======================================
     시공사진 정보
  ====================================== */

  async function loadJobPhotos(
    workItemId
  ) {
    setJobPhotoLoadingId(
      workItemId
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
          project_id,
          photo_type,
          category,
          sub_category,
          storage_path,
          ai_description,
          ai_tags,
          image_hash,
          created_at
          `
        )
        .eq(
          "work_item_id",
          workItemId
        )
        .order("created_at", {
          ascending: true,
        });

      if (error) throw error;

      setJobPhotos(
        (current) => ({
          ...current,
          [workItemId]:
            data || [],
        })
      );
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 사진정보 오류: ${
          error?.message || "실패"
        }`
      );
    } finally {
      setJobPhotoLoadingId(
        null
      );
    }
  }

  async function toggleJobDetail(
    jobId
  ) {
    if (openJobId === jobId) {
      setOpenJobId(null);
      return;
    }

    setOpenJobId(jobId);

    if (!jobPhotos[jobId]) {
      await loadJobPhotos(
        jobId
      );
    }
  }

  async function loadJobPhoto(
    photo
  ) {
    if (
      !photo?.id ||
      !photo?.storage_path
    ) {
      return null;
    }

    if (
      jobPhotoUrls[photo.id]
    ) {
      return jobPhotoUrls[
        photo.id
      ];
    }

    setLoadingPhotoId(
      photo.id
    );

    try {
      const {
        data,
        error,
      } = await supabase.storage
        .from("work-photos")
        .createSignedUrl(
          photo.storage_path,
          SIGNED_URL_SECONDS
        );

      if (error) throw error;

      if (!data?.signedUrl) {
        throw new Error(
          "사진 주소를 만들 수 없습니다."
        );
      }

      setJobPhotoUrls(
        (current) => ({
          ...current,
          [photo.id]:
            data.signedUrl,
        })
      );

      return data.signedUrl;
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 사진 오류: ${
          error?.message || "실패"
        }`
      );

      return null;
    } finally {
      setLoadingPhotoId(
        null
      );
    }
  }

  async function openJobPhoto(
    photo
  ) {
    let url =
      jobPhotoUrls[photo.id];

    if (!url) {
      url =
        await loadJobPhoto(
          photo
        );
    }

    if (url) {
      setPreviewPhoto(url);
    }
  }

  /* ======================================
     시공 수정
  ====================================== */

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
      job.actual_cost !==
        null &&
        job.actual_cost !==
          undefined
        ? String(
            job.actual_cost
          )
        : ""
    );

    setEditMemo(
      job.memo || ""
    );
  }

  async function saveJobEdit(
    jobId
  ) {
    const cost = Number(
      String(editCost).replace(
        /,/g,
        ""
      )
    );

    if (
      !editCategory.trim()
    ) {
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
        "⚠️ 시공금액을 입력해주세요."
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

            actual_cost:
              cost,

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
        "✅ 시공정보가 수정되었습니다."
      );

      await loadJobs(
        jobPage,
        jobSearchApplied
      );
    } catch (error) {
      console.error(error);

      setJobsMessage(
        `❌ 수정 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  /* ======================================
     사진 삭제
  ====================================== */

  async function deletePhoto(
    photo
  ) {
    const ok = window.confirm(
      "이 사진을 완전히 삭제하시겠습니까?"
    );

    if (!ok) return;

    try {
      if (
        photo.storage_path
      ) {
        const {
          error:
            storageError,
        } =
          await supabase.storage
            .from(
              "work-photos"
            )
            .remove([
              photo.storage_path,
            ]);

        if (storageError) {
          console.error(
            storageError
          );
        }
      }

      const { error } =
        await supabase
          .from("work_photos")
          .delete()
          .eq("id", photo.id);

      if (error) throw error;

      setJobPhotos(
        (current) => ({
          ...current,

          [photo.work_item_id]:
            (
              current[
                photo.work_item_id
              ] || []
            ).filter(
              (item) =>
                item.id !==
                photo.id
            ),
        })
      );

      setJobPhotoUrls(
        (current) => {
          const next = {
            ...current,
          };

          delete next[
            photo.id
          ];

          return next;
        }
      );

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

  /* ======================================
     시공 전체 삭제
  ====================================== */

  async function deleteJob(job) {
    const ok = window.confirm(
      "이 시공건과 연결된 사진을 모두 삭제하시겠습니까?"
    );

    if (!ok) return;

    try {
      const {
        data: photos,
        error: photoError,
      } = await supabase
        .from("work_photos")
        .select(
          "id,storage_path"
        )
        .eq(
          "work_item_id",
          job.id
        );

      if (photoError) {
        throw photoError;
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
        const {
          error:
            storageError,
        } =
          await supabase.storage
            .from(
              "work-photos"
            )
            .remove(paths);

        if (storageError) {
          console.error(
            storageError
          );
        }
      }

      const {
        error:
          photoDeleteError,
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
      console.error(error);

      setJobsMessage(
        `❌ 시공 삭제 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  /* ======================================
     HASH 복구
  ====================================== */

  async function startHashRepair() {
    if (hashRepairRunning) {
      return;
    }

    const ok = window.confirm(
      "기존 사진의 중복검사용 HASH를 생성합니다.\n\n사진은 삭제되거나 변경되지 않습니다.\n완료될 때까지 화면을 열어두세요."
    );

    if (!ok) return;

    setHashRepairRunning(true);

    setHashRepairMessage(
      "기존 사진 HASH 복구를 시작합니다..."
    );

    try {
      const token =
        await getAccessToken();

      while (true) {
        const response =
          await fetch(
            `/api/repair-image-hashes?t=${Date.now()}`,
            {
              method: "GET",
              cache: "no-store",

              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result?.success
        ) {
          throw new Error(
            result?.error ||
              `HASH 복구 실패 (${response.status})`
          );
        }

        setHashRepairProgress(
          result
        );

        setHashRepairMessage(
          `처리 중 ${
            result.completed || 0
          } / ${
            result.total || 0
          }장 (${
            result.progress ||
            "0%"
          })\n남은 사진 ${
            result.remaining || 0
          }장`
        );

        if (
          Number(
            result.failed || 0
          ) > 0
        ) {
          throw new Error(
            `${result.failed}장 처리에 실패했습니다. 다시 실행하면 남은 사진부터 계속됩니다.`
          );
        }

        if (
          result.finished ||
          Number(
            result.remaining ||
              0
          ) === 0
        ) {
          setHashRepairMessage(
            "✅ 기존 사진 HASH 복구가 완료되었습니다."
          );

          break;
        }

        if (
          Number(
            result.processed ||
              0
          ) === 0
        ) {
          throw new Error(
            "처리 가능한 사진이 없습니다."
          );
        }

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              700
            )
        );
      }
    } catch (error) {
      console.error(error);

      setHashRepairMessage(
        `⚠️ HASH 복구가 중단되었습니다.\n${
          error?.message ||
          "오류"
        }\n다시 누르면 남은 사진부터 이어서 진행합니다.`
      );
    } finally {
      setHashRepairRunning(false);
    }
  }
