"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { JOB_PAGE_SIZE, SIGNED_URL_SECONDS } from "../adminConstants";
import { sanitizeSearchKeyword } from "../adminUtils";
import {
  getCachedSignedUrl,
  setCachedSignedUrl,
} from "../signedUrlCache";

export default function useJobs({ companyId, setPreviewPhoto }) {
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

  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editMemo, setEditMemo] = useState("");

  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editPhotoType, setEditPhotoType] = useState("before");
  const [editPhotoCategory, setEditPhotoCategory] = useState("");
  const [editPhotoSubCategory, setEditPhotoSubCategory] = useState("");
  const [editPhotoDescription, setEditPhotoDescription] = useState("");
  const [photoEditLoading, setPhotoEditLoading] = useState(false);

  async function loadJobs(page = 1, keyword = jobSearchApplied) {
    if (!companyId) return;

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
        `❌ 시공 DB 오류: ${error?.message || "불러오기 실패"}`,
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
    if (!companyId || !workItemId) return;

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
        `❌ 사진정보 오류: ${error?.message || "실패"}`,
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
        `❌ 사진 오류: ${error?.message || "실패"}`,
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

    if (url && typeof setPreviewPhoto === "function") {
      setPreviewPhoto(url);
    }
  }

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
        `❌ 수정 오류: ${error?.message || "실패"}`,
      );
    }
  }

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
        `❌ 사진 수정 오류: ${error?.message || "실패"}`,
      );
    } finally {
      setPhotoEditLoading(false);
    }
  }

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
        `❌ 사진 삭제 오류: ${error?.message || "실패"}`,
      );
    }
  }

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
        `❌ 삭제 오류: ${error?.message || "실패"}`,
      );
    }
  }

  return {
    jobs,
    jobsLoading,
    jobsMessage,
    setJobsMessage,

    jobSearch,
    setJobSearch,
    jobSearchApplied,

    jobPage,
    jobTotal,

    openJobId,

    jobPhotos,
    jobPhotoLoadingId,

    jobPhotoUrls,
    loadingPhotoId,

    editingId,
    editCategory,
    setEditCategory,
    editSubCategory,
    setEditSubCategory,
    editCost,
    setEditCost,
    editMemo,
    setEditMemo,

    editingPhotoId,
    editPhotoType,
    setEditPhotoType,
    editPhotoCategory,
    setEditPhotoCategory,
    editPhotoSubCategory,
    setEditPhotoSubCategory,
    editPhotoDescription,
    setEditPhotoDescription,
    photoEditLoading,

    loadJobs,
    searchJobs,
    clearJobSearch,
    loadJobPhotos,
    toggleJobDetail,
    openJobPhoto,
    startEdit,
    cancelEdit,
    saveJobEdit,
    startPhotoEdit,
    cancelPhotoEdit,
    savePhotoEdit,
    deletePhoto,
    deleteJob,
  };
            }
