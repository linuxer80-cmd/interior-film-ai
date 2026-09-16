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
    /* ======================================
     이미지 HASH
  ====================================== */

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

  /* ======================================
     이미지 압축
  ====================================== */

  async function resizeImage(
    file,
    maxSize = 1200,
    quality = 0.7
  ) {
    let bitmap = null;

    try {
      bitmap =
        await createImageBitmap(file);
    } catch {
      bitmap = null;
    }

    if (!bitmap) {
      throw new Error(
        "사진을 불러올 수 없습니다."
      );
    }

    let width = bitmap.width;
    let height = bitmap.height;

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

    const context =
      canvas.getContext("2d", {
        alpha: false,
      });

    if (!context) {
      bitmap.close?.();

      throw new Error(
        "이미지 변환 기능을 사용할 수 없습니다."
      );
    }

    context.fillStyle =
      "#ffffff";

    context.fillRect(
      0,
      0,
      width,
      height
    );

    context.drawImage(
      bitmap,
      0,
      0,
      width,
      height
    );

    bitmap.close?.();

    const blob =
      await new Promise(
        (resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (!result) {
                reject(
                  new Error(
                    "이미지 변환 실패"
                  )
                );

                return;
              }

              resolve(result);
            },
            "image/jpeg",
            quality
          );
        }
      );

    return new File(
      [blob],
      `${String(
        file.name || "photo"
      ).replace(
        /\.[^.]+$/,
        ""
      )}.jpg`,
      {
        type: "image/jpeg",
      }
    );
  }

  /* ======================================
     AI 분석
  ====================================== */

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

    const analysis =
      result?.analysis || result;

    return {
      category:
        analysis?.category || "",

      sub_category:
        analysis?.sub_category ||
        analysis?.subcategory ||
        "",

      description:
        analysis?.description ||
        analysis?.ai_description ||
        "",

      tags: Array.isArray(
        analysis?.tags
      )
        ? analysis.tags
        : [],
    };
  }

  async function createEmbedding(
    text
  ) {
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
      result?.embedding || null
    );
  }

  /* ======================================
     시공사진 저장
  ====================================== */

  async function savePhoto({
    file,
    workItemId,
    projectId,
    photoType,
    fallbackCategory,
  }) {
    /*
      기존사진 복구 HASH와 같은 기준을 사용하도록
      압축된 실제 저장파일의 HASH를 계산합니다.
    */

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
      data: duplicate,
      error: duplicateError,
    } = await supabase
      .from("work_photos")
      .select("id")
      .eq(
        "image_hash",
        imageHash
      )
      .limit(1);

    if (duplicateError) {
      throw duplicateError;
    }

    if (duplicate?.length) {
      return {
        skipped: true,
      };
    }

    let analysis = {
      category: "",
      sub_category: "",
      description: "",
      tags: [],
    };

    try {
      analysis =
        await analyzeImage(
          compressed
        );
    } catch (error) {
      console.error(
        "AI 분석 오류:",
        error
      );
    }

    const finalCategory =
      String(
        fallbackCategory ||
          analysis.category ||
          "기타"
      ).trim() || "기타";

    const finalSubCategory =
      String(
        analysis.sub_category ||
          finalCategory
      ).trim() ||
      finalCategory;

    let tags = Array.isArray(
      analysis.tags
    )
      ? analysis.tags.filter(
          Boolean
        )
      : [];

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

    tags = [...new Set(tags)];

    const description =
      String(
        analysis.description || ""
      ).trim();

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
    ].join("\n");

    let embedding = null;

    try {
      embedding =
        await createEmbedding(
          searchText
        );
    } catch (error) {
      console.error(
        "임베딩 오류:",
        error
      );
    }

    const storagePath =
      `history/${Date.now()}-` +
      `${crypto.randomUUID()}.jpg`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("work-photos")
      .upload(
        storagePath,
        compressed,
        {
          contentType:
            "image/jpeg",
          cacheControl: "3600",
          upsert: false,
        }
      );

    if (uploadError) {
      throw uploadError;
    }

    try {
      const {
        data: publicUrlData,
      } = supabase.storage
        .from("work-photos")
        .getPublicUrl(
          storagePath
        );

      const photoUrl =
        publicUrlData?.publicUrl ||
        storagePath;

      const {
        data: inserted,
        error: insertError,
      } = await supabase
        .from("work_photos")
        .insert({
          project_id:
            projectId,

          work_item_id:
            workItemId,

          photo_url:
            photoUrl,

          storage_path:
            storagePath,

          photo_type:
            photoType,

          category:
            finalCategory,

          sub_category:
            finalSubCategory,

          ai_description:
            description,

          ai_tags:
            tags,

          embedding,

          image_hash:
            imageHash,
        })
        .select("id")
        .single();

      if (insertError) {
        throw insertError;
      }

      return {
        skipped: false,
        id: inserted?.id,
      };
    } catch (error) {
      await supabase.storage
        .from("work-photos")
        .remove([
          storagePath,
        ]);

      throw error;
    }
  }

  /* ======================================
     시공 등록
  ====================================== */

  async function registerJob() {
    if (!category.trim()) {
      setMessage(
        "⚠️ 시공 부위를 입력해주세요."
      );

      return;
    }

    const cost = Number(
      String(
        actualCost
      ).replace(/,/g, "")
    );

    if (
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      setMessage(
        "⚠️ 실제 시공금액을 입력해주세요."
      );

      return;
    }

    if (
      beforeImages.length ===
        0 &&
      afterImages.length === 0
    ) {
      setMessage(
        "⚠️ 사진을 1장 이상 선택해주세요."
      );

      return;
    }

    setLoading(true);

    setMessage(
      "사진 압축 + AI 분석 + 저장 중입니다..."
    );

    let createdWorkItemId =
      null;

    try {
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      const memoParts = [];

      if (material.trim()) {
        memoParts.push(
          `사용 자재: ${material.trim()}`
        );
      }

      if (memo.trim()) {
        memoParts.push(
          memo.trim()
        );
      }

      const {
        data: workItem,
        error: itemError,
      } = await supabase
        .from("work_items")
        .insert({
          project_id:
            projectId,

          category:
            category.trim(),

          sub_category:
            category.trim(),

          quantity: 1,
          difficulty: 3,

          actual_cost:
            cost,

          memo:
            memoParts.join(
              "\n"
            ) || null,
        })
        .select("id")
        .single();

      if (itemError) {
        throw itemError;
      }

      createdWorkItemId =
        workItem.id;

      let savedCount = 0;
      let duplicateCount = 0;

      for (
        const file of beforeImages
      ) {
        const result =
          await savePhoto({
            file,

            workItemId:
              workItem.id,

            projectId,

            photoType:
              "before",

            fallbackCategory:
              category.trim(),
          });

        if (result?.skipped) {
          duplicateCount += 1;
        } else {
          savedCount += 1;
        }
      }

      for (
        const file of afterImages
      ) {
        const result =
          await savePhoto({
            file,

            workItemId:
              workItem.id,

            projectId,

            photoType:
              "after",

            fallbackCategory:
              category.trim(),
          });

        if (result?.skipped) {
          duplicateCount += 1;
        } else {
          savedCount += 1;
        }
      }

      if (savedCount === 0) {
        await supabase
          .from("work_items")
          .delete()
          .eq(
            "id",
            workItem.id
          );

        createdWorkItemId =
          null;

        setMessage(
          "⚠️ 선택한 사진이 모두 이미 등록된 사진입니다."
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
          ? `✅ ${savedCount}장 저장 / 중복 ${duplicateCount}장 제외`
          : `✅ 사진 ${savedCount}장 저장 + AI 분석 완료`
      );

      await loadJobs(1, "");
    } catch (error) {
      console.error(error);

      if (
        createdWorkItemId
      ) {
        try {
          const {
            count,
          } = await supabase
            .from(
              "work_photos"
            )
            .select("id", {
              count: "exact",
              head: true,
            })
            .eq(
              "work_item_id",
              createdWorkItemId
            );

          if (!count) {
            await supabase
              .from(
                "work_items"
              )
              .delete()
              .eq(
                "id",
                createdWorkItemId
              );
          }
        } catch {}
      }

      setMessage(
        `❌ 저장 오류: ${
          error?.message ||
          "실패"
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  /* ======================================
     미확인 상담 수
  ====================================== */

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
        .eq(
          "is_read",
          false
        );

      if (error) throw error;

      setUnreadCount(
        count || 0
      );
    } catch (error) {
      console.error(
        "미확인 상담:",
        error
      );
    }
  }

  /* ======================================
     고객상담 목록
  ====================================== */

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
          {
            count: "exact",
          }
        );

      if (
        filter === "unread"
      ) {
        query = query.eq(
          "is_read",
          false
        );
      }

      if (
        filter === "read"
      ) {
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
        .order("created_at", {
          ascending: false,
        })
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
      const now =
        new Date().toISOString();

      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .update({
            is_read: true,
            read_at: now,
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
                      now,
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

  async function openLeadDetail(
    lead
  ) {
    if (
      openLeadId === lead.id
    ) {
      setOpenLeadId(null);
      return;
    }

    setOpenLeadId(lead.id);

    await markLeadRead(
      lead
    );
  }

  async function loadLeadPhoto(
    lead,
    path,
    index
  ) {
    const key =
      `${lead.id}:${index}`;

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
      } = await supabase.storage
        .from("work-photos")
        .createSignedUrl(
          path,
          SIGNED_URL_SECONDS
        );

      if (error) throw error;

      if (!data?.signedUrl) {
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
      console.error(error);

      setLeadsMessage(
        `❌ 고객사진 오류: ${
          error?.message || "실패"
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
    path,
    index
  ) {
    const key =
      `${lead.id}:${index}`;

    let url =
      leadPhotoUrls[key];

    if (!url) {
      url =
        await loadLeadPhoto(
          lead,
          path,
          index
        );
    }

    if (url) {
      setPreviewPhoto(url);
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
          .eq("id", leadId);

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

      setLeadsMessage(
        "✅ 상담 상태가 변경되었습니다."
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 상태 변경 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  async function saveLeadMemo(
    leadId,
    value
  ) {
    try {
      const memoValue =
        String(value || "").trim();

      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .update({
            memo:
              memoValue ||
              null,
          })
          .eq("id", leadId);

      if (error) throw error;

      setLeadsMessage(
        "✅ 상담 메모가 저장되었습니다."
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 메모 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  async function saveFinalPrice(
    lead,
    value
  ) {
    const price = Number(
      String(value).replace(
        /[^0-9]/g,
        ""
      )
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
      const now =
        new Date().toISOString();

      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .update({
            final_price:
              price,

            quote_created_at:
              now,
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
                    final_price:
                      price,
                    quote_created_at:
                      now,
                  }
                : item
          )
      );

      setLeadsMessage(
        "✅ 최종 견적금액이 저장되었습니다."
      );
    } catch (error) {
      setLeadsMessage(
        `❌ 견적 저장 오류: ${
          error?.message || "실패"
        }`
      );
    }
  }

  async function deleteLead(
    lead
  ) {
    const ok = window.confirm(
      "이 고객 상담과 고객사진을 삭제하시겠습니까?"
    );

    if (!ok) return;

    try {
      const paths =
        getLeadPhotoPaths(
          lead
        );

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

      const { error } =
        await supabase
          .from(
            "customer_leads"
          )
          .delete()
          .eq("id", lead.id);

      if (error) throw error;

      setOpenLeadId(null);

      setLeadsMessage(
        "✅ 고객 상담이 삭제되었습니다."
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
          error?.message || "실패"
        }`
      );
    }
  }

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

  /* ======================================
     메인 화면
  ====================================== */

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
          margin:
            "0 0 14px",
        }}
      >
        기분좋은공간 관리자
      </h1>

      {/* 탭 */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,1fr)",
          gap: "5px",
          marginBottom: "15px",
        }}
      >
        {[
          [
            "stats",
            "사용통계",
          ],
          ["jobs", "시공 DB"],
          [
            "register",
            "시공 등록",
          ],
          [
            "leads",
            unreadCount
              ? `상담 ${unreadCount}`
              : "고객 상담",
          ],
        ].map(
          ([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() =>
                changeTab(tab)
              }
              style={{
                padding:
                  "12px 3px",
                borderRadius:
                  "9px",
                border: 0,
                fontWeight:
                  "bold",

                background:
                  activeTab ===
                  tab
                    ? "#111827"
                    : "#fff",

                color:
                  activeTab ===
                  tab
                    ? "#fff"
                    : "#111827",
              }}
            >
              {label}
            </button>
          )
        )}
      </div>

      {/* ==================================
          자동견적 통계
      ================================== */}

      {activeTab ===
        "stats" && (
        <section
          style={sectionStyle}
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
            📊 자동견적 사용통계
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(3,1fr)",
              gap: "6px",
              marginBottom:
                "14px",
            }}
          >
            {[7, 30, 90].map(
              (days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    loadStats(
                      days
                    )
                  }
                  style={{
                    padding:
                      "10px",

                    border:
                      "none",

                    borderRadius:
                      "8px",

                    fontWeight:
                      "bold",

                    background:
                      statsDays ===
                      days
                        ? "#111827"
                        : "#e5e7eb",

                    color:
                      statsDays ===
                      days
                        ? "#fff"
                        : "#111827",
                  }}
                >
                  {days}일
                </button>
              )
            )}
          </div>

          {statsMessage && (
            <div
              style={{
                marginBottom:
                  "10px",
                whiteSpace:
                  "pre-wrap",
              }}
            >
              {statsMessage}
            </div>
          )}

          {statsLoading ? (
            <div>
              통계를 불러오는
              중...
            </div>
          ) : stats ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2,1fr)",
                  gap: "8px",
                }}
              >
                {[
                  [
                    "자동견적 사용",
                    `${stats.total_uses || 0}회`,
                  ],
                  [
                    "사용 방문자",
                    `${stats.unique_sessions || 0}명`,
                  ],
                  [
                    "상담 신청",
                    `${stats.converted_count || 0}건`,
                  ],
                  [
                    "상담 전환율",
                    `${stats.conversion_rate || 0}%`,
                  ],
                  [
                    "분석 사진",
                    `${stats.total_photos || 0}장`,
                  ],
                ].map(
                  ([
                    title,
                    value,
                  ]) => (
                    <div
                      key={title}
                      style={{
                        padding:
                          "14px",
                        borderRadius:
                          "11px",
                        background:
                          "#f3f4f6",
                      }}
                    >
                      <div
                        style={{
                          color:
                            "#6b7280",
                          fontSize:
                            "12px",
                        }}
                      >
                        {title}
                      </div>

                      <strong
                        style={{
                          display:
                            "block",
                          marginTop:
                            "5px",
                          fontSize:
                            "22px",
                        }}
                      >
                        {value}
                      </strong>
                    </div>
                  )
                )}
              </div>

              <h3>
                많이 조회한 시공
                부위
              </h3>

              {stats
                .popular_categories
                ?.length ? (
                stats.popular_categories.map(
                  (item) => (
                    <div
                      key={
                        item.category
                      }
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        padding:
                          "9px 0",
                        borderBottom:
                          "1px solid #e5e7eb",
                      }}
                    >
                      <span>
                        {
                          item.category
                        }
                      </span>

                      <strong>
                        {item.count}회
                      </strong>
                    </div>
                  )
                )
              ) : (
                <div>
                  아직 사용기록이
                  없습니다.
                </div>
              )}
            </>
          ) : null}
        </section>
      )}

      {/* ==================================
          시공 DB
      ================================== */}

      {activeTab === "jobs" && (
        <section
          style={sectionStyle}
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
              display: "none",
              padding: "13px",
              marginBottom:
                "14px",
              border:
                "1px solid #facc15",
              borderRadius:
                "12px",
              background:
                "#fefce8",
            }}
          >
            <strong>
              🔐 기존 사진 HASH
              복구
            </strong>

            <div
              style={{
                marginTop:
                  "6px",
                fontSize:
                  "12px",
                lineHeight: 1.6,
              }}
            >
              HASH가 없는 기존
              사진만 처리합니다.
            </div>

            {hashRepairProgress && (
              <div
                style={{
                  marginTop:
                    "9px",
                }}
              >
                <strong>
                  {
                    hashRepairProgress.completed
                  }
                  /
                  {
                    hashRepairProgress.total
                  }
                  장 ·{" "}
                  {
                    hashRepairProgress.progress
                  }
                </strong>

                <div
                  style={{
                    height:
                      "11px",
                    marginTop:
                      "6px",
                    borderRadius:
                      "99px",
                    overflow:
                      "hidden",
                    background:
                      "#e5e7eb",
                  }}
                >
                  <div
                    style={{
                      width:
                        hashRepairProgress.progress ||
                        "0%",
                      height:
                        "100%",
                      background:
                        "#16a34a",
                    }}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={
                hashRepairRunning
              }
              onClick={
                startHashRepair
              }
              style={{
                ...primaryButtonStyle,
                marginTop: "10px",

                background:
                  hashRepairRunning
                    ? "#9ca3af"
                    : "#ca8a04",
              }}
            >
              {hashRepairRunning
                ? "복구 진행 중..."
                : "HASH 복구 시작"}
            </button>

            {hashRepairMessage && (
              <div
                style={{
                  marginTop:
                    "8px",
                  padding: "8px",
                  background:
                    "#fff",
                  borderRadius:
                    "8px",
                  whiteSpace:
                    "pre-wrap",
                  fontSize:
                    "12px",
                }}
              >
                {
                  hashRepairMessage
                }
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "6px",
              marginBottom:
                "10px",
            }}
          >
            <input
              value={jobSearch}
              onChange={(event) =>
                setJobSearch(
                  event.target
                    .value
                )
              }
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  searchJobs();
                }
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
              }}
            >
              {jobsMessage}
            </div>
          )}

          {jobsLoading ? (
            <div>
              불러오는 중...
            </div>
          ) : (
            jobs.map((job) => {
              const isOpen =
                openJobId ===
                job.id;

              const photos =
                jobPhotos[
                  job.id
                ] || [];

              return (
                <div
                  key={job.id}
                  style={{
                    padding:
                      "12px",
                    marginBottom:
                      "9px",
                    border:
                      "1px solid #e5e7eb",
                    borderRadius:
                      "11px",
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
                      lineHeight: 1.6,
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
                          "10px",
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
                              event
                            ) =>
                              setEditCategory(
                                event
                                  .target
                                  .value
                              )
                            }
                            placeholder="시공 부위"
                            style={{
                              ...inputStyle,
                              marginBottom:
                                "6px",
                            }}
                          />

                          <input
                            value={
                              editSubCategory
                            }
                            onChange={(
                              event
                            ) =>
                              setEditSubCategory(
                                event
                                  .target
                                  .value
                              )
                            }
                            placeholder="세부 부위"
                            style={{
                              ...inputStyle,
                              marginBottom:
                                "6px",
                            }}
                          />

                          <input
                            value={
                              editCost
                            }
                            inputMode="numeric"
                            onChange={(
                              event
                            ) =>
                              setEditCost(
                                event.target.value.replace(
                                  /[^0-9]/g,
                                  ""
                                )
                              )
                            }
                            placeholder="시공금액"
                            style={{
                              ...inputStyle,
                              marginBottom:
                                "6px",
                            }}
                          />

                          <textarea
                            value={
                              editMemo
                            }
                            onChange={(
                              event
                            ) =>
                              setEditMemo(
                                event
                                  .target
                                  .value
                              )
                            }
                            placeholder="메모"
                            rows={3}
                            style={{
                              ...inputStyle,
                              marginBottom:
                                "6px",
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
                            onClick={() =>
                              setEditingId(
                                null
                              )
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
                                "9px",
                              background:
                                "#f9fafb",
                              borderRadius:
                                "8px",
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

                      <h4>
                        📷 시공사진
                      </h4>

                      {jobPhotoLoadingId ===
                      job.id ? (
                        <div>
                          사진정보 불러오는
                          중...
                        </div>
                      ) : photos.length ? (
                        photos.map(
                          (photo) => {
                            const url =
                              jobPhotoUrls[
                                photo.id
                              ];

                            return (
                              <div
                                key={
                                  photo.id
                                }
                                style={{
                                  padding:
                                    "9px",
                                  marginBottom:
                                    "7px",
                                  border:
                                    "1px solid #e5e7eb",
                                  borderRadius:
                                    "9px",
                                }}
                              >
                                {url ? (
                                  <img
                                    src={
                                      url
                                    }
                                    alt="시공사진"
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
                                        "8px",
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
                                    style={
                                      secondaryButtonStyle
                                    }
                                  >
                                    {loadingPhotoId ===
                                    photo.id
                                      ? "불러오는 중..."
                                      : "사진 보기"}
                                  </button>
                                )}

                                <div
                                  style={{
                                    marginTop:
                                      "7px",
                                    fontSize:
                                      "12px",
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {photo.photo_type ===
                                  "before"
                                    ? "시공 전"
                                    : "시공 후"}
                                  {" · "}
                                  {photo.category ||
                                    "-"}
                                  <br />
                                  HASH:{" "}
                                  {photo.image_hash
                                    ? "있음"
                                    : "없음"}
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    deletePhoto(
                                      photo
                                    )
                                  }
                                  style={{
                                    ...secondaryButtonStyle,
                                    marginTop:
                                      "6px",
                                    color:
                                      "#dc2626",
                                  }}
                                >
                                  사진 삭제
                                </button>
                              </div>
                            );
                          }
                        )
                      ) : (
                        <div>
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
                            "10px",
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
            })
          )}

          {jobTotalPages > 1 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr auto 1fr",
                gap: "7px",
                alignItems:
                  "center",
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
          )}
        </section>
      )}

      {/* ==================================
          시공 등록
      ================================== */}

      {activeTab ===
        "register" && (
        <section
          style={sectionStyle}
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
            ➕ 시공 등록
          </h2>

          <input
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value
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
            value={actualCost}
            inputMode="numeric"
            onChange={(event) =>
              setActualCost(
                event.target.value.replace(
                  /[^0-9]/g,
                  ""
                )
              )
            }
            placeholder="실제 시공금액"
            style={{
              ...inputStyle,
              marginBottom:
                "8px",
            }}
          />

          <input
            value={material}
            onChange={(event) =>
              setMaterial(
                event.target.value
              )
            }
            placeholder="사용 자재"
            style={{
              ...inputStyle,
              marginBottom:
                "8px",
            }}
          />

          <textarea
            value={memo}
            onChange={(event) =>
              setMemo(
                event.target.value
              )
            }
            placeholder="메모"
            rows={3}
            style={{
              ...inputStyle,
              marginBottom:
                "10px",
            }}
          />

          <div
            style={{
              padding: "10px",
              background:
                "#f9fafb",
              borderRadius:
                "9px",
              marginBottom:
                "8px",
            }}
          >
            <strong>
              시공 전 사진
            </strong>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(
                event
              ) => {
                setBeforeImages(
                  Array.from(
                    event.target
                      .files || []
                  )
                );

                event.target.value =
                  "";
              }}
              style={{
                width: "100%",
                marginTop:
                  "8px",
              }}
            />

            <div>
              {beforeImages.length}
              장 선택
            </div>
          </div>

          <div
            style={{
              padding: "10px",
              background:
                "#f9fafb",
              borderRadius:
                "9px",
              marginBottom:
                "10px",
            }}
          >
            <strong>
              시공 후 사진
            </strong>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(
                event
              ) => {
                setAfterImages(
                  Array.from(
                    event.target
                      .files || []
                  )
                );

                event.target.value =
                  "";
              }}
              style={{
                width: "100%",
                marginTop:
                  "8px",
              }}
            />

            <div>
              {afterImages.length}
              장 선택
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={
              registerJob
            }
            style={
              primaryButtonStyle
            }
          >
            {loading
              ? "AI 분석 + 저장 중..."
              : "시공 데이터 저장"}
          </button>

          {message && (
            <div
              style={{
                marginTop:
                  "10px",
                whiteSpace:
                  "pre-wrap",
              }}
            >
              {message}
            </div>
          )}

          <hr
            style={{
              margin: "20px 0",
              border: 0,
              borderTop:
                "1px solid #e5e7eb",
            }}
          />

          <strong>
            AI 유사도 기준
          </strong>

          <div
            style={{
              display: "flex",
              gap: "7px",
              marginTop: "7px",
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
              onChange={(event) =>
                setSimilarityThreshold(
                  event.target
                    .value
                )
              }
              style={inputStyle}
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
                width: "100px",
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
              }}
            >
              {settingMessage}
            </div>
          )}
        </section>
      )}

      {/* ==================================
          고객 상담
      ================================== */}

      {activeTab ===
        "leads" && (
        <section
          style={sectionStyle}
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
              display: "grid",
              gridTemplateColumns:
                "repeat(3,1fr)",
              gap: "5px",
              marginBottom:
                "10px",
            }}
          >
            {[
              ["all", "전체"],
              [
                "unread",
                "미확인",
              ],
              ["read", "확인"],
            ].map(
              ([
                value,
                label,
              ]) => (
                <button
                  key={value}
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
                        ? "#fff"
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
              }}
            >
              {leadsMessage}
            </div>
          )}

          {leadsLoading ? (
            <div>
              불러오는 중...
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

                return (
                  <div
                    key={lead.id}
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
                        lineHeight: 1.6,
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
                        openLeadDetail(
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
                            "10px",
                        }}
                      >
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
                          <strong>
                            AI 분석
                          </strong>
                          <br />
                          {lead.ai_description ||
                            "-"}
                        </div>

                        {paths.length >
                          0 && (
                          <div
                            style={{
                              marginTop:
                                "9px",
                            }}
                          >
                            <strong>
                              고객사진 (
                              {
                                paths.length
                              }
                              )
                            </strong>

                            {paths.map(
                              (
                                path,
                                index
                              ) => {
                                const key =
                                  `${lead.id}:${index}`;

                                const url =
                                  leadPhotoUrls[
                                    key
                                  ];

                                return (
                                  <div
                                    key={
                                      key
                                    }
                                    style={{
                                      marginTop:
                                        "7px",
                                    }}
                                  >
                                    {url ? (
                                      <img
                                        src={
                                          url
                                        }
                                        alt="고객사진"
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
                                            "9px",
                                        }}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={
                                          leadPhotoLoadingId ===
                                          key
                                        }
                                        onClick={() =>
                                          openLeadPhoto(
                                            lead,
                                            path,
                                            index
                                          )
                                        }
                                        style={
                                          secondaryButtonStyle
                                        }
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
                        )}

                        <select
                          value={
                            lead.status ||
                            "new"
                          }
                          onChange={(
                            event
                          ) =>
                            updateLeadStatus(
                              lead.id,
                              event
                                .target
                                .value
                            )
                          }
                          style={{
                            ...inputStyle,
                            marginTop:
                              "9px",
                          }}
                        >
                          <option value="new">
                            신규
                          </option>

                          <option value="contacted">
                            연락완료
                          </option>

                          <option value="scheduled">
                            시공예정
                          </option>

                          <option value="completed">
                            완료
                          </option>

                          <option value="cancelled">
                            취소
                          </option>
                        </select>

                        <textarea
                          defaultValue={
                            lead.memo ||
                            ""
                          }
                          onBlur={(
                            event
                          ) =>
                            saveLeadMemo(
                              lead.id,
                              event
                                .target
                                .value
                            )
                          }
                          placeholder="관리자 메모"
                          rows={3}
                          style={{
                            ...inputStyle,
                            marginTop:
                              "7px",
                          }}
                        />

                        <div
                          style={{
                            padding:
                              "11px",
                            marginTop:
                              "9px",
                            background:
                              "#fff7ed",
                            borderRadius:
                              "9px",
                          }}
                        >
                          <strong>
                            🧾 최종 견적
                          </strong>

                          <div
                            style={{
                              marginTop:
                                "6px",
                            }}
                          >
                            현재 확정금액:{" "}
                            <strong>
                              {lead.final_price
                                ? formatWon(
                                    lead.final_price
                                  )
                                : "미확정"}
                            </strong>
                          </div>

                          <input
                            key={`${lead.id}-${lead.final_price}`}
                            defaultValue={
                              lead.final_price ||
                              ""
                            }
                            inputMode="numeric"
                            placeholder="최종 견적금액"
                            id={`price-${lead.id}`}
                            style={{
                              ...inputStyle,
                              marginTop:
                                "7px",
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => {
                              const input =
                                document.getElementById(
                                  `price-${lead.id}`
                                );

                              saveFinalPrice(
                                lead,
                                input?.value ||
                                  ""
                              );
                            }}
                            style={{
                              ...primaryButtonStyle,
                              marginTop:
                                "7px",
                              background:
                                "#92400e",
                            }}
                          >
                            최종 견적 저장
                          </button>
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
                            marginTop:
                              "9px",
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

          {leadTotalPages > 1 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr auto 1fr",
                gap: "7px",
                alignItems:
                  "center",
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
          )}
        </section>
      )}

      {/* 사진 전체화면 */}

      {previewPhoto && (
        <div
          onClick={() =>
            setPreviewPhoto(null)
          }
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background:
              "rgba(0,0,0,.92)",
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            padding: "15px",
          }}
        >
          <img
            src={previewPhoto}
            alt="사진 크게 보기"
            onClick={(event) =>
              event.stopPropagation()
            }
            style={{
              maxWidth: "100%",
              maxHeight: "92vh",
              objectFit:
                "contain",
            }}
          />
        </div>
      )}
    </main>
  );
}
