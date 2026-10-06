"use client";

import { useCallback, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

const PHOTO_BUCKET = "work-photos";

export default function useSiteWorkReport({
  companyId,
  reloadSites,
}) {
  const [reportSaving, setReportSaving] = useState(false);
  const [reportMessage, setReportMessage] = useState("");

  const lock = useRef(false);
  const uploaded = useRef(new Map());
  const requestIds = useRef(new Map());
  const completed = useRef(new Set());

  const clearReportMessage = useCallback(() => {
    setReportMessage("");

    if (!lock.current) {
      for (const siteId of completed.current) {
        requestIds.current.delete(siteId);
        uploaded.current.delete(siteId);
      }

      completed.current.clear();
    }
  }, []);

  const submitWorkReport = useCallback(
    async (payload) => {
      if (lock.current) return false;

      const {
        siteId,
        photos = [],
        work_summary,
      } = payload;

      if (!companyId || !siteId || !work_summary?.trim()) {
        setReportMessage("업체·현장·시공 내용을 확인해주세요.");
        return false;
      }

      if (!Array.isArray(photos) || !photos.length) {
        setReportMessage("시공 완료 사진을 1장 이상 등록해주세요.");
        return false;
      }

      lock.current = true;
      setReportSaving(true);
      setReportMessage("완료사진과 보고서를 저장하고 있습니다…");

      try {
        const { data, error } = await supabase.auth.getSession();

        if (error || !data.session?.access_token) {
          throw new Error("다시 로그인해주세요.");
        }

        if (!requestIds.current.has(siteId)) {
          requestIds.current.set(siteId, crypto.randomUUID());
        }

        if (!uploaded.current.has(siteId)) {
          uploaded.current.set(siteId, new Set());
        }

        const done = uploaded.current.get(siteId);

        for (const file of photos) {
          if (done.has(file) || completed.current.has(siteId)) {
            continue;
          }

          const extension =
            file.name
              .split(".")
              .pop()
              ?.toLowerCase()
              .replace(/[^a-z0-9]/g, "") || "jpg";

          const path =
            `sites/${companyId}/${siteId}/after/` +
            `${crypto.randomUUID()}.${extension}`;

          const upload = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type || undefined,
            });

          if (upload.error) {
            throw new Error(
              `완료사진 업로드 실패: ${upload.error.message}`
            );
          }

          const row = await supabase
            .from("site_photos")
            .insert({
              company_id: companyId,
              site_id: siteId,
              uploaded_by: data.session.user.id,
              photo_type: "after",
              storage_path: path,
              photo_url: null,
              description: "시공 완료 보고 사진",
            });

          if (row.error) {
            await supabase.storage
              .from(PHOTO_BUCKET)
              .remove([path]);

            throw new Error(
              `사진 정보 저장 실패: ${row.error.message}`
            );
          }

          done.add(file);
        }

        const response = await fetch(
          "/api/admin/site-work-report",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${data.session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              siteId,
              requestId: requestIds.current.get(siteId),
              work_region: payload.work_region,
              work_summary,
              memo: payload.memo,
              materials: payload.materials || [],
              expenses: payload.expenses || [],
            }),
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.error || "보고서를 저장하지 못했습니다."
          );
        }

        completed.current.add(siteId);
        setReportMessage("완료보고와 자재 정산을 저장했습니다.");

        if (typeof reloadSites === "function") {
          try {
            await reloadSites();
          } catch {
            setReportMessage(
              "저장은 완료했습니다. 현장 목록을 새로고침해주세요."
            );
          }
        }

        window.dispatchEvent(
          new CustomEvent("site-materials-changed", {
            detail: { siteId },
          })
        );

        return true;
      } catch (error) {
        setReportMessage(`저장 오류: ${error.message}`);
        return false;
      } finally {
        lock.current = false;
        setReportSaving(false);
      }
    },
    [companyId, reloadSites]
  );

  return {
    reportSaving,
    reportMessage,
    submitWorkReport,
    clearReportMessage,
  };
    }
