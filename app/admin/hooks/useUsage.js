"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { getUsagePhotoPaths } from "../adminUtils";
import { SIGNED_URL_SECONDS } from "../adminConstants";
import {
  getCachedSignedUrl,
  setCachedSignedUrl,
} from "../signedUrlCache";
import { fetchUsageDashboard } from "../usageDataService";

export default function useUsage({
  companyId,
}) {
  const [usageStats, setUsageStats] = useState({
    today: 0,
    sevenDays: 0,
    total: 0,
    sessions: 0,
    leads: 0,
    converted: 0,
    conversion: 0,
  });

  const [usageRecent, setUsageRecent] =
    useState([]);

  const [usageLoading, setUsageLoading] =
    useState(false);

  const [usageMessage, setUsageMessage] =
    useState("");

  const [
    openUsagePhotoId,
    setOpenUsagePhotoId,
  ] = useState(null);

  const [
    usagePhotoUrls,
    setUsagePhotoUrls,
  ] = useState({});

  const [
    usagePhotoLoadingId,
    setUsagePhotoLoadingId,
  ] = useState(null);

  async function toggleUsagePhotos(row) {
    if (!row?.id) return;

    if (
      openUsagePhotoId ===
      row.id
    ) {
      setOpenUsagePhotoId(null);
      return;
    }

    const paths =
      getUsagePhotoPaths(row);

    if (paths.length === 0) {
      setUsageMessage(
        "⚠️ 이 자동견적에는 저장된 사진 경로가 없습니다.",
      );
      return;
    }

    const cached =
      usagePhotoUrls[row.id];

    if (
      Array.isArray(cached) &&
      cached.length > 0
    ) {
      setOpenUsagePhotoId(
        row.id,
      );
      return;
    }

    setUsagePhotoLoadingId(
      row.id,
    );

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

        const {
          data,
          error,
        } = await supabase.storage
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

      setUsagePhotoUrls(
        (current) => ({
          ...current,
          [row.id]: urls,
        }),
      );

      setOpenUsagePhotoId(
        row.id,
      );

      if (
        urls.length <
        paths.length
      ) {
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
      setUsagePhotoLoadingId(
        null,
      );
    }
  }

  async function loadUsageStats(
    scopedCompanyId = companyId,
  ) {
    setUsageLoading(true);
    setUsageMessage("");

    try {
      if (!scopedCompanyId) {
        throw new Error(
          "회사 정보를 확인할 수 없습니다.",
        );
      }

      const {
        stats,
        recent,
      } = await fetchUsageDashboard(
        supabase,
        scopedCompanyId,
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
              getUsagePhotoPaths(
                row,
              ).length > 0,
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

  function resetUsagePhotos() {
    setOpenUsagePhotoId(null);
    setUsagePhotoUrls({});
    setUsagePhotoLoadingId(null);
  }

  return {
    usageStats,
    usageRecent,
    usageLoading,

    usageMessage,
    setUsageMessage,

    openUsagePhotoId,
    setOpenUsagePhotoId,

    usagePhotoUrls,
    usagePhotoLoadingId,

    loadUsageStats,
    toggleUsagePhotos,
    resetUsagePhotos,
  };
}
