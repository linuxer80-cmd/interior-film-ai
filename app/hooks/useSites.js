"use client";

import { useCallback, useState } from "react";
import { supabase } from "../../lib/supabase";

function makeSafeFileName(fileName = "photo.jpg") {
  const extension = fileName.includes(".")
    ? fileName.split(".").pop().toLowerCase()
    : "jpg";
  return `${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getSiteSortTime(site) {
  if (site?.schedule_start) {
    const value = new Date(site.schedule_start).getTime();
    if (Number.isFinite(value)) return value;
  }
  if (site?.schedule_date) {
    const value = new Date(`${site.schedule_date}T00:00:00+09:00`).getTime();
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function sortSitesBySchedule(a, b) {
  const aValue = getSiteSortTime(a);
  const bValue = getSiteSortTime(b);
  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return 1;
  if (bValue === null) return -1;
  return aValue - bValue;
}

function getLocalDateString(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalizeWorkDates(values) {
  if (!Array.isArray(values)) {
    throw new Error("시공 날짜 목록이 올바르지 않습니다.");
  }

  const invalid = values.some((value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return true;
    }
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    );
  });

  if (invalid) throw new Error("올바르지 않은 시공 날짜가 있습니다.");

  const dates = [...new Set(values)].sort();
  if (dates.length > 366) {
    throw new Error("시공 날짜는 최대 366일 선택할 수 있습니다.");
  }
  return dates;
}

function dateBounds(dates) {
  return {
    schedule_date: dates[0] || null,
    schedule_start: dates.length
      ? new Date(`${dates[0]}T00:00:00+09:00`).toISOString()
      : null,
    schedule_end: dates.length
      ? new Date(`${dates[dates.length - 1]}T23:59:00+09:00`).toISOString()
      : null,
  };
}

export default function useSites({ companyId }) {
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesMessage, setSitesMessage] = useState("");
  const [selectedSite, setSelectedSite] = useState(null);

  const loadSites = useCallback(
    async (targetCompanyId = companyId) => {
      if (!targetCompanyId) return;

      setSitesLoading(true);
      setSitesMessage("");

      try {
        const { data, error } = await supabase
          .from("sites")
          .select(`
            *,
            site_workers (
              id,
              role,
              worker_id,
              workers (
                id,
                name,
                phone,
                position
              )
            )
          `)
          .eq("company_id", targetCompanyId)
          .order("schedule_start", {
            ascending: true,
            nullsFirst: false,
          });

        if (error) throw error;
        setSites((data || []).sort(sortSitesBySchedule));
      } catch (error) {
        console.error("현장 목록 조회 오류:", error);
        setSites([]);
        setSitesMessage(
          `❌ 현장 목록 조회 실패: ${error?.message || "알 수 없는 오류"}`
        );
      } finally {
        setSitesLoading(false);
      }
    },
    [companyId]
  );

  const uploadRequestPhotos = useCallback(
    async ({ siteId, files = [] }) => {
      if (!companyId || !siteId || !files.length) return [];

      const uploadedRows = [];

      for (const file of files) {
        if (!file) continue;

        const safeFileName = makeSafeFileName(file.name);
        const storagePath =
          `sites/${companyId}/${siteId}/request/${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("work-photos")
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          });

        if (uploadError) {
          throw new Error(`요청사진 업로드 실패: ${uploadError.message}`);
        }

        const photoRow = {
          company_id: companyId,
          site_id: siteId,
          photo_type: "request",
          storage_path: storagePath,
          photo_url: null,
          description: "시공 요청사진",
        };

        const { data: insertedPhoto, error: photoError } = await supabase
          .from("site_photos")
          .insert(photoRow)
          .select()
          .single();

        if (photoError) {
          await supabase.storage.from("work-photos").remove([storagePath]);
          throw new Error(`요청사진 정보 저장 실패: ${photoError.message}`);
        }

        uploadedRows.push(insertedPhoto);
      }

      return uploadedRows;
    },
    [companyId]
  );

  const addSiteRequestPhotos = useCallback(
    async ({ siteId, files = [] }) => {
      if (!companyId || !siteId) {
        return {
          success: false,
          error: "회사 또는 현장 정보를 확인할 수 없습니다.",
        };
      }

      const normalizedFiles = Array.from(files || []).filter(Boolean);
      if (!normalizedFiles.length) {
        return { success: false, error: "추가할 사진을 선택해주세요." };
      }

      setSitesMessage("");

      try {
        const uploadedPhotos = await uploadRequestPhotos({
          siteId,
          files: normalizedFiles,
        });

        setSites((prev) =>
          prev.map((site) => {
            if (site.id !== siteId) return site;
            const existingPhotos = Array.isArray(site.site_photos)
              ? site.site_photos
              : [];
            return {
              ...site,
              site_photos: [...existingPhotos, ...uploadedPhotos],
            };
          })
        );

        setSelectedSite((prev) => {
          if (!prev || prev.id !== siteId) return prev;
          const existingPhotos = Array.isArray(prev.site_photos)
            ? prev.site_photos
            : [];
          return {
            ...prev,
            site_photos: [...existingPhotos, ...uploadedPhotos],
          };
        });

        setSitesMessage(`✅ 요청사진 ${uploadedPhotos.length}장이 추가되었습니다.`);
        return { success: true, photos: uploadedPhotos };
      } catch (error) {
        console.error("현장 요청사진 추가 오류:", error);
        const message = error?.message || "사진 추가 중 오류가 발생했습니다.";
        setSitesMessage(`❌ 요청사진 추가 실패: ${message}`);
        return { success: false, error: message };
      }
    },
    [companyId, uploadRequestPhotos]
  );

  const deleteSiteRequestPhoto = useCallback(
    async ({ siteId, photoId, storagePath = null }) => {
      if (!companyId || !siteId || !photoId) {
        return {
          success: false,
          error: "삭제할 사진 정보를 확인할 수 없습니다.",
        };
      }

      setSitesMessage("");

      try {
        const { data: photoRow, error: photoLoadError } = await supabase
          .from("site_photos")
          .select("id, company_id, site_id, photo_type, storage_path")
          .eq("id", photoId)
          .eq("company_id", companyId)
          .eq("site_id", siteId)
          .maybeSingle();

        if (photoLoadError) {
          throw new Error(`사진 정보 확인 실패: ${photoLoadError.message}`);
        }
        if (!photoRow) throw new Error("삭제할 사진을 찾을 수 없습니다.");

        const targetStoragePath =
          photoRow.storage_path || storagePath || null;

        const { error: deleteDbError } = await supabase
          .from("site_photos")
          .delete()
          .eq("id", photoId)
          .eq("company_id", companyId)
          .eq("site_id", siteId);

        if (deleteDbError) {
          throw new Error(`사진 정보 삭제 실패: ${deleteDbError.message}`);
        }

        let storageWarning = null;

        if (targetStoragePath) {
          const { error: storageDeleteError } = await supabase.storage
            .from("work-photos")
            .remove([targetStoragePath]);

          if (storageDeleteError) {
            console.error("현장 요청사진 Storage 삭제 오류:", storageDeleteError);
            storageWarning = storageDeleteError.message;
          }
        }

        setSites((prev) =>
          prev.map((site) => {
            if (site.id !== siteId) return site;
            return {
              ...site,
              site_photos: Array.isArray(site.site_photos)
                ? site.site_photos.filter((photo) => photo.id !== photoId)
                : [],
            };
          })
        );

        setSelectedSite((prev) => {
          if (!prev || prev.id !== siteId) return prev;
          return {
            ...prev,
            site_photos: Array.isArray(prev.site_photos)
              ? prev.site_photos.filter((photo) => photo.id !== photoId)
              : [],
          };
        });

        setSitesMessage(
          storageWarning
            ? "✅ 사진 목록에서는 삭제되었습니다. 저장소 파일 정리는 일부 실패했습니다."
            : "✅ 요청사진이 삭제되었습니다."
        );

        return { success: true, storageWarning };
      } catch (error) {
        console.error("현장 요청사진 삭제 오류:", error);
        const message = error?.message || "사진 삭제 중 오류가 발생했습니다.";
        setSitesMessage(`❌ 요청사진 삭제 실패: ${message}`);
        return { success: false, error: message };
      }
    },
    [companyId]
  );

  const saveSiteMaterials = useCallback(
    async ({ siteId, materials = [] }) => {
      if (!companyId || !siteId || !materials.length) return [];

      const rows = materials
        .filter(
          (material) =>
            material && (material.product_code || material.product_name)
        )
        .map((material) => {
          const quantity = toNumberOrNull(material.quantity) ?? 0;
          const unitPrice = toNumberOrNull(material.unit_price);
          let totalPrice = toNumberOrNull(material.total_price);

          if (totalPrice === null && unitPrice !== null) {
            totalPrice = quantity * unitPrice;
          }

          return {
            company_id: companyId,
            site_id: siteId,
            film_product_id: material.film_product_id || null,
            brand: material.brand?.trim() || null,
            product_code: material.product_code?.trim() || null,
            product_name: material.product_name?.trim() || null,
            quantity,
            unit: material.unit?.trim() || "m",
            unit_price: unitPrice,
            total_price: totalPrice,
            memo: material.memo?.trim() || null,
          };
        });

      if (!rows.length) return [];

      const { data, error } = await supabase
        .from("site_materials")
        .insert(rows)
        .select();

      if (error) {
        throw new Error(`시공 자재 저장 실패: ${error.message}`);
      }
      return data || [];
    },
    [companyId]
  );

  const createSite = useCallback(
    async (form) => {
      if (!companyId) {
        return { success: false, error: "회사 정보를 확인할 수 없습니다." };
      }

      setSitesLoading(true);
      setSitesMessage("");
      let createdSite = null;

      try {
        const insertData = {
          company_id: companyId,
          customer_name: form.customer_name?.trim() || null,
          customer_phone: form.customer_phone?.trim() || null,
          site_name: form.site_name?.trim() || null,
          address: form.address?.trim() || null,
          address_detail: form.address_detail?.trim() || null,
          region: form.region?.trim() || null,
          schedule_date:
            form.schedule_date ||
            getLocalDateString(form.schedule_start) ||
            null,
          schedule_start: form.schedule_start || null,
          schedule_end: form.schedule_end || null,
          work_type: form.work_type?.trim() || null,
          work_description: form.work_description?.trim() || null,
          contract_amount: toNumberOrNull(form.contract_amount),
          deposit_amount: toNumberOrNull(form.deposit_amount),
          source: form.source || "phone",
          status:
            form.status || (form.schedule_start ? "scheduled" : "consulting"),
          memo: form.memo?.trim() || null,
        };

        if (form.work_dates !== undefined) {
          const dates = normalizeWorkDates(form.work_dates);

          Object.assign(insertData, dateBounds(dates), {
            work_dates: dates,
          });

          if (
            !form.status ||
            ["consulting", "scheduled"].includes(form.status)
          ) {
            insertData.status = dates.length ? "scheduled" : "consulting";
          }
        }

        const { data, error } = await supabase
          .from("sites")
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        createdSite = data;

        const materials = Array.isArray(form.materials) ? form.materials : [];
        const savedMaterials = await saveSiteMaterials({
          siteId: createdSite.id,
          materials,
        });

        const requestPhotos = Array.isArray(form.request_photos)
          ? form.request_photos
          : [];

        const savedPhotos = await uploadRequestPhotos({
          siteId: createdSite.id,
          files: requestPhotos,
        });

        const siteForState = {
          ...createdSite,
          site_workers: [],
          site_materials: savedMaterials,
          site_photos: savedPhotos,
        };

        setSites((prev) => [...prev, siteForState].sort(sortSitesBySchedule));

        setSitesMessage(
          createdSite.status === "consulting"
            ? "✅ 상담중 현장으로 등록되었습니다."
            : "✅ 현장 일정이 등록되었습니다."
        );

        return {
          success: true,
          site: siteForState,
          materials: savedMaterials,
          photos: savedPhotos,
        };
      } catch (error) {
        console.error("현장 등록 오류:", error);
        const message = error?.message || "현장 등록 중 오류가 발생했습니다.";
        setSitesMessage(`❌ ${message}`);

        if (createdSite) {
          try {
            await loadSites(companyId);
          } catch {
            // 목록 조회 오류는 loadSites에서 처리합니다.
          }
        }

        return {
          success: false,
          error: createdSite
            ? `현장은 생성되었지만 추가정보 저장 중 오류가 발생했습니다.\n${message}`
            : message,
          site: createdSite,
        };
      } finally {
        setSitesLoading(false);
      }
    },
    [companyId, loadSites, saveSiteMaterials, uploadRequestPhotos]
  );

  const updateSiteBasicInfo = useCallback(
    async ({
      siteId,
      customer_name = "",
      customer_phone = "",
      site_name = "",
      address = "",
      address_detail = "",
      region = "",
      work_type = "",
      work_description = "",
      contract_amount = "",
      deposit_amount = "",
      memo = "",
    }) => {
      if (!companyId || !siteId) {
        return {
          success: false,
          error: "회사 또는 현장 정보를 확인할 수 없습니다.",
        };
      }

      setSitesMessage("");

      try {
        const updateData = {
          customer_name: customer_name?.trim() || null,
          customer_phone: customer_phone?.trim() || null,
          site_name: site_name?.trim() || null,
          address: address?.trim() || null,
          address_detail: address_detail?.trim() || null,
          region: region?.trim() || null,
          work_type: work_type?.trim() || null,
          work_description: work_description?.trim() || null,
          contract_amount: toNumberOrNull(contract_amount),
          deposit_amount: toNumberOrNull(deposit_amount),
          memo: memo?.trim() || null,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("sites")
          .update(updateData)
          .eq("id", siteId)
          .eq("company_id", companyId)
          .select()
          .single();

        if (error) throw error;

        setSites((prev) =>
          prev
            .map((site) => (site.id === siteId ? { ...site, ...data } : site))
            .sort(sortSitesBySchedule)
        );

        setSelectedSite((prev) =>
          prev?.id === siteId ? { ...prev, ...data } : prev
        );

        setSitesMessage("✅ 현장 기본정보가 저장되었습니다.");
        return { success: true, site: data };
      } catch (error) {
        console.error("현장 기본정보 수정 오류:", error);
        const message =
          error?.message || "현장 기본정보 저장 중 오류가 발생했습니다.";
        setSitesMessage(`❌ 기본정보 저장 실패: ${message}`);
        return { success: false, error: message };
      }
    },
    [companyId]
  );

  const updateSiteSchedule = useCallback(
    async ({ siteId, workDates, scheduleStart, scheduleEnd = null }) => {
      if (!companyId || !siteId) {
        return {
          success: false,
          error: "회사 또는 현장 정보를 확인할 수 없습니다.",
        };
      }

      setSitesMessage("");

      try {
        let data;

        if (workDates !== undefined) {
          const dates = normalizeWorkDates(workDates);

          if (!dates.length) {
            throw new Error("시공 날짜를 하나 이상 선택해주세요.");
          }

          const result = await supabase.rpc("set_site_work_dates", {
            p_site_id: siteId,
            p_work_dates: dates,
          });

          if (result.error) {
            if (["PGRST202", "42883"].includes(result.error.code)) {
              throw new Error("여러 날짜 저장 SQL을 먼저 적용해주세요.");
            }
            throw result.error;
          }

          data = Array.isArray(result.data)
            ? result.data[0]
            : result.data;

          if (
            !data ||
            data.id !== siteId ||
            data.company_id !== companyId
          ) {
            throw new Error("저장 결과의 현장 정보를 확인할 수 없습니다.");
          }
        } else {
          if (
            !scheduleStart ||
            Number.isNaN(new Date(scheduleStart).getTime())
          ) {
            throw new Error("시공 시작 일정이 올바르지 않습니다.");
          }

          if (
            scheduleEnd &&
            (
              Number.isNaN(new Date(scheduleEnd).getTime()) ||
              new Date(scheduleEnd) < new Date(scheduleStart)
            )
          ) {
            throw new Error("시공 종료 일정이 올바르지 않습니다.");
          }

          const current = await supabase
            .from("sites")
            .select("id,status,work_dates")
            .eq("id", siteId)
            .eq("company_id", companyId)
            .single();

          if (current.error) throw current.error;

          if (Array.isArray(current.data.work_dates)) {
            throw new Error(
              "여러 날짜가 등록된 현장은 달력에서 시공일을 변경해주세요."
            );
          }

          if (
            ["completed", "cancelled", "canceled"].includes(current.data.status)
          ) {
            throw new Error(
              "완료되거나 취소된 현장은 일정을 변경할 수 없습니다."
            );
          }

          const updateData = {
            schedule_date: getLocalDateString(scheduleStart),
            schedule_start: scheduleStart,
            schedule_end: scheduleEnd || null,
            updated_at: new Date().toISOString(),
          };

          if (current.data.status === "consulting") {
            updateData.status = "scheduled";
          }

          const result = await supabase
            .from("sites")
            .update(updateData)
            .eq("id", siteId)
            .eq("company_id", companyId)
            .eq("status", current.data.status)
            .select()
            .single();

          if (result.error) throw result.error;
          data = result.data;
        }

        setSites((prev) =>
          prev
            .map((site) => (site.id === siteId ? { ...site, ...data } : site))
            .sort(sortSitesBySchedule)
        );

        setSelectedSite((prev) =>
          prev?.id === siteId ? { ...prev, ...data } : prev
        );

        setSitesMessage("✅ 시공 일정이 저장되었습니다.");
        return { success: true, site: data };
      } catch (error) {
        const message = error?.message || "일정 저장 중 오류가 발생했습니다.";
        setSitesMessage(`❌ 일정 변경 실패: ${message}`);
        return { success: false, error: message };
      }
    },
    [companyId]
  );

  updateSiteSchedule.supportsWorkDates = true;

  const updateSiteStatus = useCallback(
    async (siteId, nextStatus, expectedStatus) => {
      if (!companyId || !siteId) return { success: false };

      try {
        const { data: session, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        const token = session?.session?.access_token;
        if (!token) throw new Error("다시 로그인해주세요.");

        const response = await fetch("/api/admin/site-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            siteId,
            status: nextStatus,
            expectedStatus,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || "현장 상태 변경에 실패했습니다.");
        }

        const data = result.site;

        setSites((prev) =>
          prev
            .map((site) => (site.id === siteId ? { ...site, ...data } : site))
            .sort(sortSitesBySchedule)
        );

        setSelectedSite((prev) =>
          prev?.id === siteId ? { ...prev, ...data } : prev
        );

        return { success: true, site: data };
      } catch (error) {
        console.error("현장 상태 변경 오류:", error);
        setSitesMessage(
          `❌ 상태 변경 실패: ${error?.message || "알 수 없는 오류"}`
        );
        return { success: false, error: error?.message };
      }
    },
    [companyId]
  );

  function openSite(site) {
    setSelectedSite(site);
  }

  function closeSite() {
    setSelectedSite(null);
  }

  function clearSitesMessage() {
    setSitesMessage("");
  }

  return {
    sites,
    sitesLoading,
    sitesMessage,
    selectedSite,
    loadSites,
    createSite,
    updateSiteBasicInfo,
    updateSiteSchedule,
    updateSiteStatus,
    saveSiteMaterials,
    uploadRequestPhotos,
    addSiteRequestPhotos,
    deleteSiteRequestPhoto,
    openSite,
    closeSite,
    clearSitesMessage,
  };
    }
